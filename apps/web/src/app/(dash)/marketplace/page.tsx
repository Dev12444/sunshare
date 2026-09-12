import type { Metadata } from 'next';
import { MarketplaceView } from '@/components/market/marketplace-view';

export const metadata: Metadata = { title: 'Marketplace' };

export default function Page() {
  return <MarketplaceView />;
}
