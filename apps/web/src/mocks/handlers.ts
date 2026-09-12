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
import {
  DEMO_USER_ID,
  badgesFor,
  carbonSummaryFor,
  communityOverview,
  networkCo2AvoidedKg,
} from './scenario';
import { parseGoal } from '@/lib/broker-rules';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';
const latest = (ticks as unknown as { market: unknown }[]).at(-1);

export const handlers = [
  http.get('/api/market', () => HttpResponse.json(latest?.market ?? {})),

  http.get('/api/listings', () => HttpResponse.json([])),
  http.get('/api/bids', () => HttpResponse.json([])),
  http.get('/api/meters', () => HttpResponse.json([])),

  // Shapes below mirror Rahi's real routes exactly (apps/web/src/app/api/*).
  // If they ever diverge, the real endpoint wins and these get fixed.
  http.get('/api/carbon', ({ request }) => {
    const userId = new URL(request.url).searchParams.get('userId') ?? DEMO_USER_ID;
    return HttpResponse.json({
      summary: carbonSummaryFor(userId),
      badges: badgesFor(userId),
      networkCo2AvoidedKg: networkCo2AvoidedKg(),
    });
  }),

  http.get('/api/community', () => HttpResponse.json(communityOverview())),

  http.get('/api/broker', () => HttpResponse.json({ policies: [] })),
  http.post('/api/broker', async ({ request }) => {
    const { goal } = (await request.json()) as { goal: string };
    return HttpResponse.json({ policy: parseGoal(DEMO_USER_ID, goal) }, { status: 201 });
  }),

  http.post('/api/bids', () => HttpResponse.json({ ok: true }, { status: 201 })),
  http.post('/api/listings', () => HttpResponse.json({ ok: true }, { status: 201 })),
  http.post('/api/settle', () =>
    HttpResponse.json({ txHash: '0xmock', mode: 'simulated' }),
  ),

  http.get(`${ENGINE}/health`, () =>
    HttpResponse.json({ status: 'mock', simSpeed: 60 }),
  ),
  http.post(`${ENGINE}/match`, () => HttpResponse.json({ pairs: [] })),
  http.post(`${ENGINE}/broker/policy`, async ({ request }) => {
    const body = (await request.json()) as { userId: string; goal: string };
    return HttpResponse.json(parseGoal(body.userId, body.goal));
  }),
];
