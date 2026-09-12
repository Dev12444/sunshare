'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

export interface ChartTheme {
  solar: string;
  solarWash: string;
  up: string;
  down: string;
  mains: string;
  warn: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  surface: string;
  sunken: string;
}

const VARS: Record<keyof ChartTheme, string> = {
  solar: '--solar',
  solarWash: '--solar-wash',
  up: '--up',
  down: '--down',
  mains: '--mains',
  warn: '--warn',
  ink: '--ink',
  ink2: '--ink-2',
  ink3: '--ink-3',
  rule: '--rule',
  surface: '--surface',
  sunken: '--sunken',
};

const FALLBACK: ChartTheme = {
  solar: 'rgb(224,138,12)',
  solarWash: 'rgb(251,236,209)',
  up: 'rgb(27,107,69)',
  down: 'rgb(163,51,36)',
  mains: 'rgb(42,92,122)',
  warn: 'rgb(168,115,11)',
  ink: 'rgb(26,23,19)',
  ink2: 'rgb(92,84,74)',
  ink3: 'rgb(138,128,117)',
  rule: 'rgb(26,23,19)',
  surface: 'rgb(253,251,247)',
  sunken: 'rgb(241,237,229)',
};

/**
 * Recharts takes colours as attribute strings, and `var()` does not resolve in
 * SVG presentation attributes. So the token values are read off the document
 * once per theme change and handed to the charts as concrete colours — the
 * charts stay on the same palette as the rest of the interface without
 * duplicating a single hex value into component code.
 */
export function useChartTheme(): ChartTheme {
  const theme = useStore((s) => s.theme);
  const [value, setValue] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const next = {} as ChartTheme;
    for (const [key, cssVar] of Object.entries(VARS) as [keyof ChartTheme, string][]) {
      const raw = styles.getPropertyValue(cssVar).trim();
      next[key] = raw ? `rgb(${raw.replace(/\s+/g, ' ')})` : FALLBACK[key];
    }
    setValue(next);
  }, [theme]);

  return value;
}

/** Shared axis styling, so every chart in the product shares one voice. */
export function axisProps(theme: ChartTheme) {
  return {
    stroke: theme.ink3,
    tick: { fill: theme.ink3, fontSize: 10, fontFamily: 'var(--font-mono)' },
    tickLine: false,
    axisLine: { stroke: theme.ink3, strokeOpacity: 0.25 },
  } as const;
}
