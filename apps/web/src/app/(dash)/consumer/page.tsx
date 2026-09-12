import type { Metadata } from 'next';
import { ConsumerDashboard } from '@/components/consumer/consumer-dashboard';

export const metadata: Metadata = { title: 'Overview' };

export default function Page() {
  return <ConsumerDashboard />;
}
