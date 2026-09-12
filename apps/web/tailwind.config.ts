import type { Config } from 'tailwindcss';

/**
 * SunShare design tokens.
 *
 * The palette is a warm-neutral / charcoal foundation with a single solar
 * accent. Colour is a signal, not decoration: amber means solar energy, green
 * and rust mean market direction, slate means grid import, and the congestion
 * ramp is the only place a third hue is allowed. Everything else is ink on
 * paper.
 *
 * All values resolve to CSS variables declared in globals.css so the light
 * (warm paper) and dark (control room) themes share one component layer.
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',

        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--ink-3) / <alpha-value>)',

        rule: 'rgb(var(--rule) / <alpha-value>)',
        'rule-strong': 'rgb(var(--rule-strong) / <alpha-value>)',

        forest: {
          DEFAULT: 'rgb(var(--forest) / <alpha-value>)',
          2: 'rgb(var(--forest-2) / <alpha-value>)',
          3: 'rgb(var(--forest-3) / <alpha-value>)',
          ink: 'rgb(var(--forest-ink) / <alpha-value>)',
          'ink-2': 'rgb(var(--forest-ink-2) / <alpha-value>)',
        },

        solar: {
          wash: 'rgb(var(--solar-wash) / <alpha-value>)',
          line: 'rgb(var(--solar-line) / <alpha-value>)',
          DEFAULT: 'rgb(var(--solar) / <alpha-value>)',
          deep: 'rgb(var(--solar-deep) / <alpha-value>)',
        },
        up: {
          wash: 'rgb(var(--up-wash) / <alpha-value>)',
          DEFAULT: 'rgb(var(--up) / <alpha-value>)',
        },
        down: {
          wash: 'rgb(var(--down-wash) / <alpha-value>)',
          DEFAULT: 'rgb(var(--down) / <alpha-value>)',
        },
        /** Grid import / utility infrastructure. Cool, desaturated, never hero. */
        mains: {
          wash: 'rgb(var(--mains-wash) / <alpha-value>)',
          DEFAULT: 'rgb(var(--mains) / <alpha-value>)',
        },
        congestion: {
          normal: 'rgb(var(--up) / <alpha-value>)',
          high: 'rgb(var(--warn) / <alpha-value>)',
          critical: 'rgb(var(--down) / <alpha-value>)',
        },
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // A deliberately narrow scale. Hierarchy comes from weight, colour and
        // rules — not from making every heading enormous.
        micro: ['10px', { lineHeight: '13px', letterSpacing: '0.06em' }],
        label: ['10.5px', { lineHeight: '14px', letterSpacing: '0.085em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '18px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        md: ['15px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '24px' }],
        xl: ['21px', { lineHeight: '26px', letterSpacing: '-0.015em' }],
        '2xl': ['27px', { lineHeight: '30px', letterSpacing: '-0.02em' }],
        '3xl': ['34px', { lineHeight: '36px', letterSpacing: '-0.025em' }],
      },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '3px', lg: '4px', xl: '5px' },
      spacing: { 4.5: '1.125rem', 13: '3.25rem', 15: '3.75rem', 18: '4.5rem' },
      transitionDuration: { 120: '120ms', 180: '180ms' },
      keyframes: {
        'sweep': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(300%)' } },
        'pulse-dot': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        sweep: 'sweep 1.4s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
