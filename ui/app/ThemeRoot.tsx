import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppRoot } from '@dynatrace/strato-components/core';
import { getTheme } from '@dynatrace-sdk/user-preferences';
import { resolveTheme } from './theme';

const ThemeContext = createContext<'light' | 'dark'>('light');
export const usePlatformTheme = () => useContext(ThemeContext);

export function ThemeRoot({ children }: { children: ReactNode }) {
  const media = useRef(window.matchMedia('(prefers-color-scheme: dark)'));
  const [theme, setTheme] = useState(() => resolveTheme(getTheme(), media.current.matches));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => setTheme(resolveTheme(getTheme(), media.current.matches));
    // The SDK getter is local. Polling does not issue network requests and only
    // changes React state when the effective theme changes.
    const timer = window.setInterval(sync, 1000);
    media.current.addEventListener('change', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    const query = media.current;
    return () => { window.clearInterval(timer); query.removeEventListener('change', sync); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useLayoutEffect(() => {
    // AppRoot 3.15 caches the initial SDK preference. Keep its public theme
    // attributes in sync without remounting the app or losing selected scope.
    document.documentElement.setAttribute('data-theme', theme);
    root.current?.setAttribute('data-theme', theme);
  }, [theme]);
  return <ThemeContext.Provider value={theme}><AppRoot ref={root}>{children}</AppRoot></ThemeContext.Provider>;
}
