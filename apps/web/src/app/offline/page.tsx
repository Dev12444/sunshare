import type { Metadata } from 'next';
import { OfflineSnapshot } from '@/components/shell/offline-snapshot';

export const metadata: Metadata = { title: 'Offline' };

/**
 * Offline fallback, served by the service worker when a navigation fails.
 *
 * It never shows an empty screen. The last market state this device received
 * is kept in IndexedDB and painted here behind an "as of" line, because a
 * household deciding whether to run the washing machine is better served by a
 * fifteen-minute-old clearing price than by an apology.
 */
export default function OfflinePage() {
  return <OfflineSnapshot />;
}
