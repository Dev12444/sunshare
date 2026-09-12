import type { Metadata } from 'next';
import { GridView } from '@/components/gridview/grid-view';

export const metadata: Metadata = { title: 'Grid' };

export default function Page() {
  return <GridView />;
}
