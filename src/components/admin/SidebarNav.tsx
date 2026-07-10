'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// Broadcast (Phase 2) + photography/work (Phase 3) + news/information (Phase 4) +
// transmissions (Phase 5) are live; settings is a later phase.
const SECTIONS = [
  { slug: 'broadcast', live: true },
  { slug: 'photography', live: true },
  { slug: 'work', live: true },
  { slug: 'news', live: true },
  { slug: 'information', live: true },
  { slug: 'transmissions', live: true },
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
    <nav className="w-44 shrink-0 border-r border-black/10 px-5 py-7 flex flex-col gap-5">
      <div className="font-mono text-[9px] tracking-[0.28em] uppercase text-black/30">
        vlg.fm
        <span className="block mt-1 text-black/15">console</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {SECTIONS.map((s) =>
          s.live ? (
            <Link
              key={s.slug}
              href={`/admin/${s.slug}`}
              className={`font-mono text-[10px] tracking-[0.16em] uppercase transition-colors ${
                pathname?.startsWith(`/admin/${s.slug}`)
                  ? 'text-black'
                  : 'text-black/45 hover:text-black'
              }`}
            >
              {s.slug}
            </Link>
          ) : (
            <span
              key={s.slug}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-black/15 cursor-default"
              title="coming in a later phase"
            >
              {s.slug}
              <span className="ml-1.5 text-[7px] tracking-[0.2em] text-black/15">soon</span>
            </span>
          ),
        )}
      </div>

      <button
        onClick={logout}
        className="mt-auto self-start font-mono text-[9px] tracking-[0.2em] uppercase text-black/25 hover:text-black transition-colors"
      >
        logout →
      </button>
    </nav>
  );
}
