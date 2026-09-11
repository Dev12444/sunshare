import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SunShare — Local Solar Marketplace',
  description: 'Trade surplus rooftop solar with your neighbours.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SunShare', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#f59e0b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
