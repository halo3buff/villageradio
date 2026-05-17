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
            className="flex items-baseline gap-6 px-5 py-3 border-b border-black/[0.08] cursor-pointer group"
          >
            <span className="font-mono text-[10px] text-black/45 shrink-0 w-24 tracking-wider">
              {mix.date}
            </span>
            <span
              className={`text-xs flex-1 transition-colors duration-150 ${
                isActive && isPlaying
                  ? 'text-vr-signal'
                  : 'text-black/80 group-hover:text-vr-white'
              }`}
            >
              {mix.title}
            </span>
            <span className="font-mono text-[10px] text-black/45 shrink-0 tracking-wider">
              {mix.duration}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
