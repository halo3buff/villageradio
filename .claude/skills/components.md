---
name: components
description: Village Radio component architecture and data patterns. Invoke when building new components, setting up data structures, or wiring up audio/player functionality.
---

# Village Radio Component Skill

Component architecture and implementation patterns for villageradio.xyz.

## Component Inventory

### Core Layout
- `<RootLayout>` — wraps all pages, renders `<Nav>` + `<AudioPlayer>`
- `<Nav>` — top bar, always visible, lowercase monospace links
- `<AudioPlayer>` — fixed bottom bar, persistent across all pages

### Page-Level
- `<HomeFeed>` — ticker + current mix + recent work teaser
- `<MixArchive>` — list of past mixes, click-to-play
- `<WorkGrid>` — brand design portfolio, border grid layout
- `<PhotoGallery>` — fullscreen photo viewer with keyboard nav
- `<AboutPage>` — single column, left-aligned text only

### Atoms
- `<LiveBadge>` — `● LIVE` in signal green, monospace
- `<Ticker>` — scrolling marquee for currently playing info
- `<MixCard>` — single row: date | duration | title | play button
- `<ProgressBar>` — thin line, no height, full-width under AudioPlayer

## Audio Player Architecture

Use the HTML5 Audio API. Keep state in a React context so any component can control playback.

```tsx
// lib/audio-context.tsx
'use client';
import { createContext, useContext, useRef, useState } from 'react';

interface Track { title: string; artist: string; src: string; }
interface AudioCtx {
  currentTrack: Track | null;
  isPlaying: boolean;
  play: (track: Track) => void;
  pause: () => void;
  toggle: () => void;
  progress: number; // 0-1
}

const AudioContext = createContext<AudioCtx | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function play(track: Track) {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = track.src;
    audioRef.current.play();
    audioRef.current.ontimeupdate = () => {
      const a = audioRef.current!;
      setProgress(a.currentTime / a.duration || 0);
    };
    setCurrentTrack(track);
    setIsPlaying(true);
  }

  function pause() { audioRef.current?.pause(); setIsPlaying(false); }
  function toggle() { isPlaying ? pause() : audioRef.current?.play(); setIsPlaying(!isPlaying); }

  return (
    <AudioContext.Provider value={{ currentTrack, isPlaying, play, pause, toggle, progress }}>
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
};
```

## Data Structures

```ts
// lib/types.ts
export interface Mix {
  id: string;
  title: string;
  artist: string;
  date: string;        // ISO date string
  duration: string;    // e.g. "1:24:30"
  src: string;         // audio file URL or stream URL
  cover?: string;      // optional image
  tags: string[];      // e.g. ['ambient', 'techno']
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
  layout.tsx          ← RootLayout with AudioProvider, Nav, AudioPlayer
  page.tsx            ← Home
  mixes/
    page.tsx          ← Mix archive
  work/
    page.tsx          ← Portfolio grid
    [id]/
      page.tsx        ← Individual work item
  photography/
    page.tsx          ← Photo gallery
  about/
    page.tsx          ← About
```

## Static Data vs CMS

Start with static data files, upgrade to CMS later if needed.

```ts
// lib/data/mixes.ts — start here, no database needed
export const mixes: Mix[] = [
  {
    id: 'mix-001',
    title: 'Signal 01',
    artist: 'Village Radio',
    date: '2024-01-15',
    duration: '1:12:44',
    src: '/audio/signal-01.mp3',
    tags: ['ambient', 'electronic'],
  },
  // ...
];
```

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
