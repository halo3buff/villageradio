'use client';

import Link from 'next/link';
import { grantClearance } from '@/lib/clearance';

type GrantLinkProps = Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string };

/**
 * Drop-in next/link replacement for the site's OFFICIAL navigation controls.
 * Clicking it grants clearance for the destination before navigating, so the
 * Gate on the other side opens. Deep links, bookmarks, and swipe-resurrected
 * pages never pass through here — that's the whole point.
 */
export function GrantLink({ href, onClick, ...props }: GrantLinkProps) {
  return (
    <Link
      href={href}
      {...props}
      onClick={e => {
        grantClearance(href);
        onClick?.(e);
      }}
    />
  );
}
