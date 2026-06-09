'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// Broadcast is the only live section in Phase 2; the rest are placeholders (later phases).
const SECTIONS = [
  { slug: 'broadcast', live: true },
  { slug: 'photography', live: false },
  { slug: 'work', live: false },
  { slug: 'news', live: false },
  { slug: 'information', live: false },
  { slug: 'transmissions', live: false },
  { slug: 'settings', live: false },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="w-44 shrink-0 border-r border-white/10 px-5 py-7 flex flex-col gap-5">
      <div className="font-mono text-[9px] tracking-[0.28em] uppercase text-white/30">
        vlg.fm
        <span className="block mt-1 text-white/15">console</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {SECTIONS.map((s) =>
          s.live ? (
            <Link
              key={s.slug}
              href={`/admin/${s.slug}`}
              className={`font-mono text-[10px] tracking-[0.16em] uppercase transition-colors ${
                pathname?.startsWith(`/admin/${s.slug}`)
                  ? 'text-white'
                  : 'text-white/45 hover:text-white'
              }`}
            >
              {s.slug}
            </Link>
          ) : (
            <span
              key={s.slug}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/15 cursor-default"
              title="coming in a later phase"
            >
              {s.slug}
              <span className="ml-1.5 text-[7px] tracking-[0.2em] text-white/15">soon</span>
            </span>
          ),
        )}
      </div>

      <button
        onClick={logout}
        className="mt-auto self-start font-mono text-[9px] tracking-[0.2em] uppercase text-white/25 hover:text-white transition-colors"
      >
        logout →
      </button>
    </nav>
  );
}
