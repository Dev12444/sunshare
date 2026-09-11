/**
 * MSW handlers — Diya, H3–H5.
 *
 * Mirrors both surfaces the frontend talks to:
 *   /api/*           Rahi's Next.js routes
 *   ENGINE_URL/*     Dev's FastAPI engine
 *
 * Responses must satisfy the types in @sunshare/shared. If a mock and the real
 * endpoint ever disagree, the type treaty wins and the mock gets fixed.
 */
import { http, HttpResponse } from 'msw';
import ticks from './fixtures/ticks.json';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';
const latest = (ticks as unknown as { market: unknown }[]).at(-1);

export const handlers = [
  http.get('/api/market', () => HttpResponse.json(latest?.market ?? {})),

  http.get('/api/listings', () => HttpResponse.json([])),
  http.get('/api/bids', () => HttpResponse.json([])),
  http.get('/api/meters', () => HttpResponse.json([])),
  http.get('/api/carbon', () => HttpResponse.json({})),
  http.get('/api/community', () => HttpResponse.json({ beneficiaries: [], donations: [] })),

  http.post('/api/bids', () => HttpResponse.json({ ok: true }, { status: 201 })),
  http.post('/api/listings', () => HttpResponse.json({ ok: true }, { status: 201 })),
  http.post('/api/settle', () =>
    HttpResponse.json({ txHash: '0xmock', mode: 'simulated' }),
  ),

  http.get(`${ENGINE}/health`, () =>
    HttpResponse.json({ status: 'mock', simSpeed: 60 }),
  ),
  http.post(`${ENGINE}/match`, () => HttpResponse.json({ pairs: [] })),
  http.post(`${ENGINE}/broker/policy`, () => HttpResponse.json({})),

  // TODO(Diya): flesh these out from fixtures once Dev publishes real captures
  // at H4. Empty arrays are enough to build layout against, not enough to demo.
];
