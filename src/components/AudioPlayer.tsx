'use client';
import { useAudio } from '@/lib/audio-context';

export function AudioPlayer() {
  const { currentTrack, isPlaying, toggle, progress } = useAudio();

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-black border-t border-white/[0.06]">
      <div className="px-5 py-3 flex items-center gap-6">
        <span className="font-mono text-[10px] text-vr-signal tracking-widest shrink-0 select-none">
          ● LIVE
        </span>
        <span className="font-mono text-[10px] text-white/40 flex-1 truncate tracking-wider uppercase">
          {currentTrack?.title ?? 'village radio'}
        </span>
        <button
          onClick={toggle}
          className="font-mono text-[10px] text-white/30 hover:text-vr-white transition-colors duration-150 tracking-widest"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
      </div>
      {progress > 0 && (
        <div
          className="h-px bg-white/10 transition-none"
          style={{ width: `${progress * 100}%` }}
        />
      )}
    </div>
  );
}
