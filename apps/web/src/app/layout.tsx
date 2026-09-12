import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

/**
 * Two faces, each with a job.
 *
 * Plex Sans carries the interface: it is a grotesk drawn for technical
 * documentation, so it holds up at 11px in a table header without the
 * anonymity of the usual UI sans. Plex Mono carries every number, ID, hash and
 * timestamp — anything that has to align in a column or be read aloud in a
 * control room.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SunShare — Local Solar Marketplace',
    template: '%s · SunShare',
  },
  description:
    'Peer-to-peer rooftop solar trading for Sector 21, Gandhinagar. Local clearing prices, grid-aware matching and settled records.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SunShare',
  appleWebApp: { capable: true, title: 'SunShare', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#12110e' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Set the theme before first paint so a dark-mode user never sees a
            white flash on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sunshare-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:border focus:border-rule/25 focus:bg-surface focus:px-3 focus:py-1.5 focus:text-sm"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
