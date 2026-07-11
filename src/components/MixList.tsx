'use client';
import { useAudio } from '@/lib/audio-context';
import type { Mix } from '@/lib/types';

export function MixList({ mixes }: { mixes: Mix[] }) {
  const { play, currentTrack, isPlaying } = useAudio();

  return (
    <ul>
      {mixes.map(mix => {
        const isActive = currentTrack?.id === mix.id;
        return (
          <li
            key={mix.id}
            onClick={() => play(mix)}
            className="flex items-baseline gap-6 px-5 py-3 cursor-pointer group"
          >
            <span
              className="font-mono text-[10px] shrink-0 w-24 tracking-wider"
              style={{ color: 'var(--vlg-fg-dim, rgba(200,196,187,0.35))' }}
            >
              {mix.date}
            </span>
            <span
              className="text-xs flex-1 transition-colors duration-150 group-hover:text-[var(--vlg-fg,#e8e4d9)]"
              style={{ color: isActive && isPlaying ? 'var(--color-vr-signal)' : 'var(--vlg-fg-dim, rgba(200,196,187,0.8))' }}
            >
              {mix.title}
            </span>
            <span
              className="font-mono text-[10px] shrink-0 tracking-wider"
              style={{ color: 'var(--vlg-fg-dim, rgba(200,196,187,0.35))' }}
            >
              {mix.duration}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
