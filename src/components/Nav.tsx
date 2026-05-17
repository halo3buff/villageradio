'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = ['mixes', 'work', 'photography', 'listen', 'news'] as const;

export function Nav() {
  const pathname = usePathname();
  const logoHref = pathname === '/' ? '/information' : '/';

  return (
    <nav className="flex items-center gap-6 px-5 py-1 border-b border-black/[0.06]">
      <Link href={logoHref} className="mr-auto shrink-0" aria-label="Village Radio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/hero_logo_p.png" alt="Village Radio" className="h-16 w-auto" />
      </Link>
      {NAV_LINKS.map(slug => (
        <Link
          key={slug}
          href={`/${slug}`}
          className={`font-mono text-[0.65rem] tracking-[0.15em] transition-opacity duration-150 ${
            pathname === `/${slug}`
              ? 'text-vr-white'
              : 'text-black/55 hover:text-black/85'
          }`}
        >
          {slug}
        </Link>
      ))}
    </nav>
  );
}
