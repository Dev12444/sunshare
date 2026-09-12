import type { Metadata } from 'next';
import { MapView } from '@/components/mapview/map-view';

export const metadata: Metadata = { title: 'Energy Map' };

export default function Page() {
  return <MapView />;
}
