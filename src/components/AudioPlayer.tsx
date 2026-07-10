'use client';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';

export function AudioPlayer() {
  const { currentTrack, isPlaying, toggle, progress } = useAudio();
  const pathname = usePathname();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <div className={`fixed bottom-0 inset-x-0 z-50 border-t ${
      isAdmin ? 'bg-white border-black/10' : 'bg-[#080808] border-white/[0.08]'
    }`}>
      <div className="px-5 py-3 flex items-center gap-6">
        <span className="font-mono text-[10px] text-vr-signal tracking-widest shrink-0 select-none">
          ● LIVE
        </span>
        <span className="font-mono text-[10px] tracking-wider uppercase truncate flex-1"
              style={{ color: isAdmin ? 'rgba(0,0,0,0.5)' : 'rgba(200,196,187,0.4)' }}>
          {currentTrack?.title ?? 'village radio'}
        </span>
        <button
          onClick={toggle}
          className="font-mono text-[10px] tracking-widest shrink-0 transition-opacity duration-150"
          style={{ color: isAdmin ? 'rgba(0,0,0,0.55)' : 'rgba(200,196,187,0.55)' }}
          onMouseEnter={e => (e.currentTarget.style.color = isAdmin ? '#000' : '#e8e4d9')}
          onMouseLeave={e => (e.currentTarget.style.color = isAdmin ? 'rgba(0,0,0,0.55)' : 'rgba(200,196,187,0.55)')}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
      </div>
      {progress > 0 && (
        <div
          className="h-px transition-none"
          style={{ width: `${progress * 100}%`, background: isAdmin ? 'rgba(0,0,0,0.15)' : 'rgba(200,196,187,0.2)' }}
        />
      )}
    </div>
  );
}
