import { NextResponse } from 'next/server';
import { getTheme } from '@/lib/content/loaders';
import { DEFAULT_THEME, isThemeName } from '@/lib/theme';

export const runtime = 'nodejs';
// Client-side self-correction reads this directly (bypassing the Next.js Router Cache that a
// root-layout value would otherwise get stuck behind between navigations) — always fresh.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const raw = await getTheme();
  const theme = isThemeName(raw) ? raw : DEFAULT_THEME;
  return NextResponse.json({ theme });
}
