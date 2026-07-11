'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { THEMES, isThemeName, siteVarMap, type Theme } from '@/lib/theme';

const ThemeContext = createContext<{ name: string; T: Theme }>({
  name: 'default',
  T: THEMES.default,
});

function applyThemeVars(name: string) {
  const root = document.documentElement;
  const vars = siteVarMap(name);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = name;
}

/**
 * The root layout only re-renders on a full document load — client-side navigation reuses it
 * as-is, so a theme published after this tab's last full load would otherwise stay stale until
 * a hard refresh. Self-correct against the live value: fetch it (uncached) on mount and whenever
 * the tab regains focus, and push it straight onto :root so every var(--vlg-*) consumer updates
 * without needing a reload.
 */
export function ThemeProvider({ name, children }: { name: string; children: React.ReactNode }) {
  const [current, setCurrent] = useState(name);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch('/api/theme', { cache: 'no-store' });
        const data = await res.json() as { theme?: unknown };
        if (cancelled || typeof data.theme !== 'string' || !isThemeName(data.theme)) return;
        setCurrent(prev => {
          if (data.theme === prev) return prev;
          applyThemeVars(data.theme as string);
          return data.theme as string;
        });
      } catch { /* best-effort — keep the SSR value on failure */ }
    };
    sync();
    window.addEventListener('focus', sync);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', sync);
    };
  }, []);

  const T = THEMES[current] ?? THEMES.default;
  return <ThemeContext.Provider value={{ name: current, T }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
