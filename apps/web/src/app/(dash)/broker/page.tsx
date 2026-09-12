import type { Metadata } from 'next';
import { BrokerView } from '@/components/broker/broker-view';

export const metadata: Metadata = { title: 'Broker' };

export default function Page() {
  return <BrokerView />;
}
