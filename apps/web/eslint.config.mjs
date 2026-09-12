/**
 * ESLint flat config — the repo shipped a `lint` script with no ESLint behind
 * it, so `npm run lint` dropped into Next's interactive setup prompt and
 * exited 1. This is that missing config.
 *
 * `next lint` is deprecated in Next 15, so the script calls the ESLint CLI
 * directly and this file is the flat config that CLI expects.
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      '.next/**',
      'public/sw.js',
      'public/workbox-*.js',
      'public/mockServiceWorker.js',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // `const { name, ...rest } = x` is how this codebase drops fields from a
      // payload. The omitted names are the point of the expression, not dead
      // bindings, so they must not be reported.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
