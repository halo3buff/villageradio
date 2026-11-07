"""Audit every file on the station for the things that sound like ticks and scratches.

    python scripts/audit-audio.py [https://vlgfm.live] [--keep DIR] [--clips DIR]

--keep keeps the downloads (and reuses them next run); --clips writes a 3 s WAV around each
file's worst spots, to listen to. Click suspects are ranked by how far they stand out, worst
first: on quiet, ambient material a high one is a real tick; on drums, hits rank too.

For each track in the live lineup it downloads the file, then reports:
  decode   corrupt / unreadable MP3 frames (each one is a click when played)
  clip     runs of samples pinned at full scale (clipping baked into the file)
  clicks   single-sample jumps far out of line with the sound around them
  length   the file's real length against the manifest's durationSec (whole seconds, so
           often a little long; the player waits that overhang out in silence)
Needs ffmpeg/ffprobe on PATH and numpy.
"""
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np

SR = 44_100
R2 = 'https://pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev'
CLICK_K = 14  # a click: a 2nd difference this many times the local median of its size


def ts(sec: float) -> str:
    return f'{int(sec // 60):d}:{sec % 60:05.2f}'


def snip(path: Path, at: float, dest: Path):
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-ss', f'{max(0, at - 1.5):.3f}', '-t', '3', '-i', str(path), str(dest)])


def audit(path: Path, manifest_sec: float, clips: Path | None = None) -> list[str]:
    out = []
    err = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', '-'], capture_output=True, text=True).stderr.strip()
    if err:
        lines = err.splitlines()
        out.append(f'decode: {len(lines)} error(s), e.g. {lines[0][:120]}')

    real = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                                capture_output=True, text=True).stdout)
    if manifest_sec - real > 0.05:
        out.append(f'length: manifest {manifest_sec}s but the file is {real:.2f}s — {manifest_sec - real:.2f}s of schedule past its end')

    pcm = subprocess.Popen(['ffmpeg', '-v', 'quiet', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], stdout=subprocess.PIPE)
    block = SR * 10  # 10 s at a time, with a little overlap carried for the differences
    pos, clip_runs, clicks, prev = 0, [], [], np.zeros((0, 2), np.float32)
    while True:
        raw = pcm.stdout.read(block * 8)
        if not raw:
            break
        x = np.concatenate([prev, np.frombuffer(raw, np.float32).reshape(-1, 2)])
        base = pos - len(prev)
        # clipping: 4+ samples in a row at |x| >= 0.999
        hot = (np.abs(x) >= 0.999).any(axis=1).astype(np.int8)
        edges = np.flatnonzero(np.diff(np.concatenate([[0], hot, [0]])))
        for a, b in zip(edges[::2], edges[1::2]):
            if b - a >= 4 and base + a >= pos:
                clip_runs.append((base + a) / SR)
        # clicks: |2nd difference| towering over its 20 ms neighbourhood, and audible in size
        d2 = np.abs(np.diff(x, 2, axis=0)).max(axis=1)
        w = int(SR * 0.02)
        n = len(d2) // w * w
        if n:
            local = np.median(d2[:n].reshape(-1, w), axis=1).repeat(w)
            hit = np.flatnonzero((d2[:n] > CLICK_K * local + 0.02) & (d2[:n] > 0.05))
            for i in hit:
                t = (base + i) / SR
                if base + i >= pos and (not clicks or t - clicks[-1][0] > 0.25):
                    clicks.append((t, d2[i] / max(local[i], 1e-5)))
        prev = x[-64:]
        pos = base + len(x)
    pcm.wait()

    if clip_runs:
        out.append(f'clip: {len(clip_runs)} clipped run(s), first at ' + ', '.join(ts(t) for t in clip_runs[:6]))
    if clicks:
        clicks.sort(key=lambda c: -c[1])
        out.append(f'clicks: {len(clicks)} suspect(s), worst at ' + ', '.join(f'{ts(t)} (x{r:.0f})' for t, r in clicks[:8]))
    if clips:
        spots = [('click', t) for t, _ in clicks[:3]] + [('clip', t) for t in clip_runs[:1]]
        for kind, t in spots:
            snip(path, t, clips / f'{path.stem}_{kind}_{ts(t).replace(":", "m")}.wav')
    return out


def main():
    args = sys.argv[1:]
    keep = Path(args[args.index('--keep') + 1]) if '--keep' in args else None
    clips = Path(args[args.index('--clips') + 1]) if '--clips' in args else None
    if clips:
        clips.mkdir(parents=True, exist_ok=True)
    site = next((a for a in args if a.startswith('http')), 'https://vlgfm.live')
    lineup = json.load(urllib.request.urlopen(f'{site}/api/lineup'))
    folder = keep or Path(tempfile.mkdtemp())
    folder.mkdir(parents=True, exist_ok=True)
    bad = 0
    for t in lineup['playlist']:
        name = t['src'].split('file=')[-1]
        f = folder / name
        if not f.exists():  # R2 turns away Python's default user agent
            req = urllib.request.Request(f'{R2}/{name}', headers={'User-Agent': 'vlgfm-audit'})
            with urllib.request.urlopen(req) as r, open(f, 'wb') as o:
                shutil.copyfileobj(r, o)
        found = audit(f, t['durationSec'], clips)
        bad += bool(found)
        print(f"{'!!' if found else 'ok'}  {t['title']}  ({name})")
        for line in found:
            print(f'      {line}')
    print(f'\n{bad} of {len(lineup["playlist"])} file(s) need a look')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
