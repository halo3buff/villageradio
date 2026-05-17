'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = ['mixes', 'work', 'photography', 'listen', 'news'] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6 px-5 py-4 border-b border-white/[0.06]">
      <Link href="/" className="mr-auto shrink-0" aria-label="Village Radio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/logo_2.svg" alt="Village Radio" className="h-4 w-auto" />
      </Link>
      {NAV_LINKS.map(slug => (
        <Link
          key={slug}
          href={`/${slug}`}
          className={`font-mono text-[0.65rem] tracking-[0.15em] transition-opacity duration-150 ${
            pathname === `/${slug}`
              ? 'text-vr-white'
              : 'text-white/35 hover:text-white/70'
          }`}
        >
          {slug}
        </Link>
      ))}
    </nav>
  );
}
