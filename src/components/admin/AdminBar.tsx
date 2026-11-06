'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAudio } from '@/lib/audio-context';

const SECTIONS = ['broadcast', 'photography', 'work', 'news', 'information', 'transmissions', 'settings'];

/** The console's one bar: the mark, the sections, the live station, logout. */
export function AdminBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentTrack, isPlaying, toggle } = useAudio();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 md:px-6 py-2.5 md:py-0 md:h-11 border-b border-white/10 [background:var(--vlg-cover,#000)]">
      <Link href="/" className="shrink-0 font-mono text-[9.5px] tracking-[0.28em] uppercase text-white/55 hover:text-white transition-colors" title="The site">
        vlg.fm <span className="text-white/30">console</span>
      </Link>

      <nav className="flex flex-wrap gap-x-5 gap-y-2">
        {SECTIONS.map((s) => (
          <Link
            key={s}
            href={`/admin/${s}`}
            className={`font-mono text-[10px] tracking-[0.16em] uppercase transition-colors ${
              pathname?.startsWith(`/admin/${s}`) ? 'text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-5 min-w-0">
        <button
          onClick={toggle}
          className="group flex items-center gap-2.5 min-w-0 font-mono text-[10px] tracking-[0.12em] uppercase"
          aria-label={isPlaying ? 'Pause the station' : 'Play the station'}
        >
          <span className="shrink-0 text-vr-signal">● live</span>
          <span className="truncate max-w-[220px] text-white/50">{currentTrack?.title ?? 'village radio'}</span>
          <span className="shrink-0 text-white/55 group-hover:text-white transition-colors">{isPlaying ? 'pause' : 'play'}</span>
        </button>
        <button onClick={logout} className="shrink-0 font-mono text-[9.5px] tracking-[0.2em] uppercase text-white/50 hover:text-white transition-colors">
          logout →
        </button>
      </div>
    </header>
  );
}
