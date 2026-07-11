'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GrantLink } from '@/components/GrantLink';
import { useTheme } from '@/components/ThemeProvider';
import { LIGHT_THEMES } from '@/lib/theme';

const NAV_LINKS = ['listen', 'work', 'photography', 'news'] as const;

export function Nav() {
  const pathname = usePathname();
  const { name: theme } = useTheme();
  const logoHref = pathname === '/' ? '/information' : '/';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const invertLogo = !isAdmin && !LIGHT_THEMES.has(theme);

  return (
    <nav className={`flex items-center gap-3 sm:gap-5 px-4 sm:px-5 py-1 border-b ${
      isAdmin
        ? 'bg-white border-black/10'
        : 'bg-[var(--vlg-bg,#080808)] border-[var(--vlg-border,rgba(255,255,255,0.08))]'
    }`}>
      <Link href={logoHref} className="mr-auto shrink-0" aria-label="Village Radio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/hero_logo_p.png"
          alt="Village Radio"
          className="h-10 sm:h-14 w-auto"
          style={invertLogo ? { filter: 'invert(1)' } : undefined}
        />
      </Link>
      {NAV_LINKS.map(slug => (
        <GrantLink
          key={slug}
          href={`/${slug}`}
          className={`font-mono text-[0.55rem] sm:text-[0.65rem] tracking-[0.12em] sm:tracking-[0.15em] transition-opacity duration-150 shrink-0 ${
            isAdmin
              ? pathname === `/${slug}` ? 'text-black' : 'text-black/45 hover:text-black'
              : pathname === `/${slug}` ? 'text-[var(--vlg-fg,#e8e4d9)]' : 'text-[var(--vlg-fg-dim,#c8c4bb)]/55 hover:text-[var(--vlg-fg,#e8e4d9)]'
          }`}
        >
          {slug}
        </GrantLink>
      ))}
    </nav>
  );
}
