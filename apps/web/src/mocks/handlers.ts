/**
 * MSW handlers.
 *
 * Mirrors both surfaces the frontend talks to:
 *   /api/*           the Next.js platform routes
 *   ENGINE_URL/*     the FastAPI engine
 *
 * Everything is answered from the same deterministic market engine that drives
 * the live tick loop, so a component that fetches and a component that reads
 * the store see the same market. Responses satisfy the types in
 * @sunshare/shared — if a mock and the real endpoint disagree, the type treaty
 * wins and the mock gets fixed.
 */
import { http, HttpResponse } from 'msw';
import { DEFAULT_TARIFF, type MatchRequest } from '@sunshare/shared';
import { BENEFICIARIES, SESSIONS } from '@/lib/seed';
import {
  DEFAULT_DONATION,
  DEFAULT_START_MIN,
  historyUpTo,
  marketStateAt,
  matchSlot,
  ordersForSlot,
  settledSlot,
  simIso,
  slotIndexFor,
  tickAt,
  topologyAt,
} from '@/lib/mock/market-engine';
import { parseGoal } from '@/lib/mock/broker';

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

/**
 * The mock clock.
 *
 * MSW has no access to the store, so it keeps its own clock advancing at the
 * same one-simulated-minute-per-second rate the tick loop uses. Both are pure
 * functions of the same seed, so they agree.
 */
const bootedAt = Date.now();
function nowMin(): number {
  return DEFAULT_START_MIN + (Date.now() - bootedAt) / 1000;
}

function currentSlot() {
  return slotIndexFor(nowMin());
}

export const handlers = [
  /* ------------------------------------------------------------ platform */

  http.get('/api/session', () => HttpResponse.json(SESSIONS.PROSUMER)),

  http.post('/api/session', async ({ request }) => {
    const body = (await request.json()) as { role?: keyof typeof SESSIONS };
    return HttpResponse.json(SESSIONS[body.role ?? 'PROSUMER']);
  }),

  http.get('/api/meters', () => {
    const { tick } = tickAt(nowMin(), 0, 1, [], null, DEFAULT_DONATION);
    return HttpResponse.json(tick.meters);
  }),

  http.get('/api/market', () => {
    const minutes = nowMin();
    return HttpResponse.json(
      marketStateAt(minutes, topologyAt(minutes), null, DEFAULT_DONATION),
    );
  }),

  http.get('/api/listings', () =>
    HttpResponse.json(ordersForSlot(currentSlot(), null).listings),
  ),

  http.post('/api/listings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const slot = ordersForSlot(currentSlot(), null);
    return HttpResponse.json(
      {
        id: `L-API-${Date.now().toString(36).toUpperCase()}`,
        status: 'OPEN',
        slotId: slot.slotId,
        brokerPolicyId: null,
        ...body,
      },
      { status: 201 },
    );
  }),

  http.get('/api/bids', () => HttpResponse.json(ordersForSlot(currentSlot(), null).bids)),

  http.post('/api/bids', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const slot = ordersForSlot(currentSlot(), null);
    return HttpResponse.json(
      {
        id: `B-API-${Date.now().toString(36).toUpperCase()}`,
        status: 'OPEN',
        slotId: slot.slotId,
        ...body,
      },
      { status: 201 },
    );
  }),

  http.post('/api/settle', async ({ request }) => {
    const body = (await request.json()) as { tradeId?: string };
    const slot = settledSlot(currentSlot() - 1, null, DEFAULT_DONATION);
    const receipt =
      slot.receipts.find((r) => r.tradeId === body.tradeId) ?? slot.receipts[0] ?? null;
    return receipt
      ? HttpResponse.json(receipt)
      : HttpResponse.json({ error: 'no settlement for that trade' }, { status: 404 });
  }),

  http.get('/api/carbon', () => {
    const history = historyUpTo(nowMin(), null, DEFAULT_DONATION);
    const localKwh = history.reduce(
      (s, slot) => s + slot.trades.reduce((t, x) => t + x.deliveredKwh, 0),
      0,
    );
    const co2 = history.reduce(
      (s, slot) => s + slot.trades.reduce((t, x) => t + x.co2AvoidedKg, 0),
      0,
    );
    return HttpResponse.json({
      summary: {
        userId: 'U-01',
        periodStart: simIso(0),
        periodEnd: simIso(Math.floor(nowMin())),
        localKwh,
        co2AvoidedKg: co2,
        treeEquivalent: co2 / 21,
        gridComparisonKg: localKwh * 0.71,
        rank: 2,
      },
      badges: [],
    });
  }),

  http.get('/api/community', () => {
    const history = historyUpTo(nowMin(), null, DEFAULT_DONATION);
    return HttpResponse.json({
      beneficiaries: BENEFICIARIES,
      donations: history.flatMap((s) => s.donations),
    });
  }),

  http.post('/api/community', () => HttpResponse.json({ ok: true }, { status: 201 })),

  http.get('/api/broker', () => HttpResponse.json({ policy: null, activity: [] })),

  http.post('/api/broker', async ({ request }) => {
    const body = (await request.json()) as { userId?: string; goal?: string };
    return HttpResponse.json(
      parseGoal(body.userId ?? 'U-01', body.goal ?? '', nowMin()),
    );
  }),

  http.post('/api/slot/run', () => {
    const slot = settledSlot(currentSlot() - 1, null, DEFAULT_DONATION);
    return HttpResponse.json({
      slotId: slot.slotId,
      clearingPricePaise: slot.clearingPricePaise,
      trades: slot.trades,
      donations: slot.donations,
      receipts: slot.receipts,
    });
  }),

  http.get('/api/regulator/export', ({ request }) => {
    const dataset = new URL(request.url).searchParams.get('dataset') ?? 'trades';
    const history = historyUpTo(nowMin(), null, DEFAULT_DONATION);
    const csv =
      dataset === 'donations'
        ? [
            'donation_id,slot_id,donor_id,beneficiary_id,kwh,value_paise,created_at',
            ...history.flatMap((s) =>
              s.donations.map(
                (d) =>
                  `${d.id},${d.slotId},${d.donorId},${d.beneficiaryId},${d.kwh},${d.valuePaise},${d.createdAt}`,
              ),
            ),
          ].join('\n')
        : [
            'trade_id,slot_id,seller_id,buyer_id,kwh,delivered_kwh,price_paise,wheeling_fee_paise,status,created_at',
            ...history.flatMap((s) =>
              s.trades.map(
                (t) =>
                  `${t.id},${t.slotId},${t.sellerId},${t.buyerId},${t.kwh},${t.deliveredKwh},${t.pricePaise},${t.wheelingFeePaise},${t.status},${t.createdAt}`,
              ),
            ),
          ].join('\n');

    return new HttpResponse(csv, {
      headers: {
        'content-type': 'text/csv;charset=utf-8',
        'content-disposition': `attachment; filename="sunshare-${dataset}.csv"`,
      },
    });
  }),

  http.post('/api/push', () => HttpResponse.json({ ok: true })),

  /* -------------------------------------------------------------- engine */

  http.get(`${ENGINE}/health`, () =>
    HttpResponse.json({
      status: 'mock',
      simSpeed: 1,
      seed: 2026,
      simTime: simIso(Math.floor(nowMin())),
      slotId: ordersForSlot(currentSlot(), null).slotId,
      brokerLlm: false,
    }),
  ),

  http.get(`${ENGINE}/market/state`, () => {
    const minutes = nowMin();
    return HttpResponse.json(
      marketStateAt(minutes, topologyAt(minutes), null, DEFAULT_DONATION),
    );
  }),

  http.get(`${ENGINE}/meters`, () => {
    const { tick } = tickAt(nowMin(), 0, 1, [], null, DEFAULT_DONATION);
    return HttpResponse.json(tick.meters);
  }),

  http.get(`${ENGINE}/grid/topology`, () => HttpResponse.json(topologyAt(nowMin()))),

  http.post(`${ENGINE}/match`, async ({ request }) => {
    const body = (await request.json()) as MatchRequest;
    const index = currentSlot();
    const orders = {
      slotId: body.slotId,
      slotIndex: index,
      listings: body.listings ?? [],
      bids: body.bids ?? [],
    };
    return HttpResponse.json(matchSlot(index, orders));
  }),

  http.post(`${ENGINE}/broker/policy`, async ({ request }) => {
    const body = (await request.json()) as { userId?: string; goal?: string };
    return HttpResponse.json(parseGoal(body.userId ?? 'U-01', body.goal ?? '', nowMin()));
  }),

  http.get(`${ENGINE}/carbon/:userId`, ({ params, request }) => {
    const localKwh = Number(new URL(request.url).searchParams.get('local_kwh') ?? 0);
    const co2 = localKwh * 0.7839;
    return HttpResponse.json({
      userId: String(params.userId),
      periodStart: simIso(0),
      periodEnd: simIso(Math.floor(nowMin())),
      localKwh,
      co2AvoidedKg: co2,
      treeEquivalent: co2 / 21,
      gridComparisonKg: localKwh * 0.71,
      rank: null,
    });
  }),

  http.post(`${ENGINE}/sim/control`, () => HttpResponse.json({ ok: true })),

  /** The corridor is enforced server-side too; expose it for parity checks. */
  http.get(`${ENGINE}/tariff`, () => HttpResponse.json(DEFAULT_TARIFF)),
];
