'use client';

import { useEffect } from 'react';
import { setState, useStore } from '@/lib/store';
import { IconMoon, IconSun } from './icons';

const KEY = 'sunshare-theme';

/**
 * Light is warm paper, dark is the control room. Both are first-class — the
 * demo is given in a bright hall and judged again on a laptop at night.
 */
export function ThemeToggle() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) as
      | 'light'
      | 'dark'
      | null;
    const preferred =
      stored ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setState({ theme: preferred });
    document.documentElement.classList.toggle('dark', preferred === 'dark');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setState({ theme: next });
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage denied; the choice simply does not persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink"
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}
