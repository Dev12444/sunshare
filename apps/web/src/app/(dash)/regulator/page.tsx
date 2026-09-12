import type { Metadata } from 'next';
import { RegulatorView } from '@/components/ops/regulator-view';

export const metadata: Metadata = { title: 'Market Oversight' };

export default function Page() {
  return <RegulatorView />;
}
