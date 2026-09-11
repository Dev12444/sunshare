import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Maansi owns this palette — solar warm against grid cool.
        sun: {
          50: '#fffaeb',
          200: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        grid: {
          400: '#64748b',
          600: '#475569',
          800: '#1e293b',
          900: '#0f172a',
        },
        leaf: {
          400: '#4ade80',
          600: '#16a34a',
        },
        congestion: {
          normal: '#16a34a',
          high: '#f59e0b',
          critical: '#dc2626',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
