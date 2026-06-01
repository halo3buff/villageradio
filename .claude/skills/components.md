---
name: components
description: Village Radio component architecture and data patterns. Invoke when building new components, setting up data structures, or wiring up audio/player functionality.
---

# Village Radio Component Skill

Component architecture and implementation patterns for villageradio.xyz.

## Component Inventory

These are the components that actually exist in `src/components/`. The root layout
(`src/app/layout.tsx`) wraps everything in `<AudioProvider>` and renders `<Nav>`,
the page, `<NewsStrip>`, and `<AudioPlayer>`.

- `<Nav>` — top bar, always visible, lowercase monospace links (`listen / work /
  photography / news`); logo toggles `/` ↔ `/information`.
- `<AudioPlayer>` — fixed bottom bar, persistent across all pages.
- `<NewsStrip>` — strip rendered above the player in the layout.
- `<LissajousScope>` — canvas X/Y scope on the home page (stereo analyser).
- `<Oscilloscope>` — waveform scope used on `/transmit` (recorder UI).
- `<RecordingSpectrum>` — spectrum view for the recorder.
- `<SDRWaterfall>` — waterfall visualization on `/listen`.
- `<MixList>` — mix archive list (click-to-play rows).

Audio-reactive components read analyser nodes from the audio context (`analyserL`,
`analyserR`, `analyserFreq`).

## Audio Player Architecture

Lives in `src/lib/audio-context.tsx` (`AudioProvider` + `useAudio`). It wraps a single
HTML5 `Audio` element routed through the Web Audio API for visualizers and volume.
**Read the file before changing playback** — it is more involved than a plain player:

- **Two modes.** `mode: 'idle' | 'broadcast' | 'individual'`.
  - `broadcastPlay()` tunes into the *synchronized 24/7 broadcast*: the current track
    and offset are derived from the UTC epoch clock (`Date.now()` + a server-clock
    offset from `/api/time`), so every listener hears the same thing at the same
    instant. A periodic drift corrector nudges `playbackRate` (±3%, inaudible) or, for
    large drift, does a fade-covered seek/re-tune.
    Positions come from `broadcastPlaylist` and each track's `durationSec`.
  - `play(track)` plays a single mix on demand (leaves the broadcast).
- **Visualizer taps.** The graph splits into `analyserL`, `analyserR` (pre-gain,
  per-channel) and `analyserFreq`, exposed on the context for the scope/waterfall
  components.
- **Volume** is a `GainNode` (`volume`, `setVolume`), kept separate from analyser taps.

`useAudio()` returns: `currentTrack, isPlaying, mode, broadcastIndex, play,
broadcastPlay, pause, toggle, progress, analyserL, analyserR, analyserFreq, volume,
setVolume`. Tracks are `Mix` objects (see below); `src` is a proxied stream URL.

## Data Structures

```ts
// lib/types.ts — keep in sync with the actual file
export interface Mix {
  id: string;
  title: string;
  artist: string;
  date: string;          // e.g. "05-20-2026" ('' for interludes)
  duration: string;      // human-readable, e.g. "3:55"
  durationSec?: number;  // numeric duration (from probe-durations.mjs) — used for broadcast sync
  src: string;           // proxied stream URL: `/api/audio/stream?file=...`
  cover?: string;        // optional image
  tags: string[];
  kind?: 'mix' | 'inter'; // 'inter' = interlude/break track
}

export interface WorkItem {
  id: string;
  title: string;
  client?: string;
  year: number;
  category: 'branding' | 'print' | 'motion' | 'identity';
  images: string[];    // array of image URLs
  description?: string;
}

export interface Photo {
  id: string;
  src: string;
  caption?: string;
  date?: string;
  series?: string;     // group photos into series
}
```

## Mix Archive List Pattern

```tsx
// components/MixCard.tsx
export function MixCard({ mix, onPlay }: { mix: Mix; onPlay: (mix: Mix) => void }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-white/10 group cursor-pointer"
         onClick={() => onPlay(mix)}>
      <span className="font-mono text-xs text-white/30 w-24 shrink-0">{mix.date}</span>
      <span className="font-mono text-xs text-white/30 w-16 shrink-0">{mix.duration}</span>
      <span className="text-sm text-white/80 group-hover:text-white flex-1 transition-colors">{mix.title}</span>
      <span className="font-mono text-xs text-white/30 group-hover:text-white/60 ml-4 transition-colors">PLAY →</span>
    </div>
  );
}
```

## Routing & Pages (App Router)

```
app/
  layout.tsx          ← AudioProvider + Nav + NewsStrip + AudioPlayer
  page.tsx            ← Home (LissajousScope + featured links + transmit link)
  listen/page.tsx     ← Radio view (SDRWaterfall)
  work/page.tsx       ← Brand portfolio grid
  photography/page.tsx← "Negative Series" photo grid
  news/page.tsx       ← Editorial posts
  information/page.tsx← About (renders public/information/info_page.md)
  transmit/page.tsx   ← Record + send a transmission (Oscilloscope)
  api/
    audio/stream/     ← proxies mixes from Cloudflare R2 (allowlist from mixes.ts)
    transmissions/    ← POST webm upload → Vercel Blob (private)
    time/             ← server clock for broadcast sync
```

## Static Data

`src/lib/data/mixes.ts` is the single source of truth for the broadcast. Define tracks
once in `broadcastPlaylist`; `mixes` (mix-only) and `broadcastFiles` (the stream proxy's
allowlist) are *derived* from it — never maintain a parallel list.

```ts
// lib/data/mixes.ts
const PROXY = '/api/audio/stream?file=';

export const broadcastPlaylist: Mix[] = [
  {
    id: 'green-05-20-2026',
    title: 'GREEN 05.20.2026',
    artist: 'Village Radio',
    date: '05-20-2026',
    duration: '3:55',
    durationSec: 235,                  // from scripts/probe-durations.mjs
    src: `${PROXY}green_05-20-2026.mp3`,
    tags: [],
    kind: 'mix',
  },
  // ...
];

export const mixes = broadcastPlaylist.filter(t => t.kind === 'mix');
```

See `docs/instructions.md` for the full "add a mix" workflow.

## Keyboard Navigation (Photography)

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextPhoto();
    if (e.key === 'ArrowLeft') prevPhoto();
    if (e.key === 'Escape') router.push('/photography');
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [currentIndex]);
```

## Performance Notes
- Images: use `next/image` with `sizes` prop for all portfolio images
- Audio: lazy-load audio files, never preload all mixes
- Fonts: use `next/font` with `display: swap` and `preload: true`
- Don't install a UI component library — build atomic components by hand per design system
