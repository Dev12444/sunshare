import type { Metadata } from 'next';
import { DiscomView } from '@/components/ops/discom-view';

export const metadata: Metadata = { title: 'Network' };

export default function Page() {
  return <DiscomView />;
}
