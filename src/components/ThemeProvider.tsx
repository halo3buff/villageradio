'use client';

import { createContext, useContext } from 'react';
import { THEMES, type Theme } from '@/lib/theme';

const ThemeContext = createContext<{ name: string; T: Theme }>({
  name: 'default',
  T: THEMES.default,
});

export function ThemeProvider({ name, children }: { name: string; children: React.ReactNode }) {
  const T = THEMES[name] ?? THEMES.default;
  return <ThemeContext.Provider value={{ name, T }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
