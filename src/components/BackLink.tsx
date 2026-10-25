'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// The pages visited this tab, mirroring the browser's history: a path matching the one before
// the top is taken as a step back.
const trail: string[] = [];

/** Keep the trail in step with navigation. Mount once, on the always-present frame. */
export function useTrail(pathname: string) {
  useEffect(() => {
    if (trail.at(-2) === pathname) trail.pop();
    else if (trail.at(-1) !== pathname) trail.push(pathname);
  }, [pathname]);
}

/**
 * A page's back arrow: goes up to `href` without stacking history. Came from there? It's a real
 * step back, so the browser's back button keeps walking up the site instead of returning here.
 * Arrived some other way? The parent replaces this page in history.
 */
export function BackLink({ href, onClick, ...props }: React.ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      replace
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (trail.at(-2) === href) {
          e.preventDefault();
          router.back();
        } else trail.pop(); // replaced: the parent takes this page's place
      }}
    />
  );
}
