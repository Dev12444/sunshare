/**
 * MSW browser worker. Started from a client component when
 * NEXT_PUBLIC_USE_MOCKS === 'true'.
 *
 * Setup (once, Diya): npx msw init ../../public --save
 */
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

export async function startMocks() {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') return;
  await worker.start({ onUnhandledRequest: 'bypass' });
}
