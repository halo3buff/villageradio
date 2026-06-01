# Adding New Mixes

Broadcast mixes are hosted on **Cloudflare R2** and streamed through the
`/api/audio/stream` proxy. `src/lib/data/mixes.ts` is the single source of truth — the
proxy's allowlist is derived from it, so once the file is in R2 you only edit one file.

## 1. Upload to Cloudflare R2

Upload the audio file to the R2 bucket that backs the stream proxy (the bucket behind
`R2_BASE` in `src/app/api/audio/stream/route.ts`). Files live at the bucket root, e.g.:

```
green_05-20-2026.mp3
```

Supported formats: `.mp3`, `.wav`, `.ogg`, `.m4a` (mixes are `.mp3` in practice).

## 2. Get the duration

Add the filename to the `FILES` array in `scripts/probe-durations.mjs`, then run:

```
node scripts/probe-durations.mjs
```

It probes R2 via byte-range requests and prints `durationSec` values to paste below.

## 3. Add it to the playlist

`src/lib/data/mixes.ts` — add an entry to `broadcastPlaylist`. This is the only edit
needed: the stream proxy's allowlist (`broadcastFiles`) is derived from this array
automatically, so there's no separate whitelist to maintain.

```ts
{
  id: 'green-05-20-2026',
  title: 'GREEN 05.20.2026',
  artist: 'Village Radio',
  date: '05-20-2026',
  duration: '3:55',      // human-readable, m:ss or h:mm:ss
  durationSec: 235,      // from the probe script
  src: `${PROXY}green_05-20-2026.mp3`,
  tags: [],
  kind: 'mix',           // use 'inter' for interlude/break tracks
},
```

Then commit and push `main`. Vercel deploys automatically.

---

## Naming conventions

| Type | Filename pattern | `kind` value |
|---|---|---|
| Full mix | `<color>_<MM-DD-YYYY>.mp3` (color = `red` / `green` / `yellow`) | `'mix'` |
| Interlude / break | `inter_<n>.mp3` | `'inter'` |
