import { redirect } from 'next/navigation';

/** No landing page. The product opens on the market. */
export default function Home() {
  redirect('/prosumer');
}
