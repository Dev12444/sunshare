import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

// Diya: PWA service worker. Disabled in dev so hot reload isn't fighting a cache.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The shared package is consumed as TypeScript source, not a build artifact.
  transpilePackages: ['@sunshare/shared'],
};

export default withSerwist(nextConfig);
