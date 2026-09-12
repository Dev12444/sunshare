import type { Metadata } from 'next';
import { ProsumerDashboard } from '@/components/prosumer/prosumer-dashboard';

export const metadata: Metadata = { title: 'Overview' };

export default function Page() {
  return <ProsumerDashboard />;
}
