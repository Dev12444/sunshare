'use client';

/**
 * AI Energy Broker — Diya, H6.5–H9.
 *
 * The broker only ever produces a constrained policy from a natural-language
 * goal. POST /api/broker (Rahi) is the real path — engine policy, corridor
 * clamp, persisted decision log; lib/broker-rules is the browser-side stand-in
 * that answers in mock mode. Either way a separate deterministic function
 * (decide) reads live market state and returns HOLD/SELL, so the model never
 * lists, prices, or settles anything itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrokerDecision, BrokerPolicy } from '@sunshare/shared';
import { paiseToRupees } from '@sunshare/shared';
import { engine } from '@/lib/engine';
import { decide } from '@/lib/broker-rules';
import { useTickContext } from '@/hooks/tick-context';
import { useActivity } from '@/hooks/use-activity';
import { LifecycleRail } from '@/components/lifecycle-rail';
import { DEMO_USER_ID } from '@/mocks/scenario';
import { notify, requestNotificationPermission } from '@/lib/notifications';

const EXAMPLE_GOAL = 'Sell before sunset, but never below ₹4.50.';

export default function BrokerPage() {
  const [goal, setGoal] = useState('');
  const [policy, setPolicy] = useState<BrokerPolicy | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const { tick, connected } = useTickContext();
  const { events } = useActivity();

  const myMeter = tick?.meters.find((m) => m.userId === DEMO_USER_ID) ?? null;
  const marketPricePaise = tick?.market.indicativePricePaise ?? null;
  const availableKwh = myMeter ? Math.max(0, myMeter.surplusKw) : 0;

  const liveDecision = useMemo(() => {
    if (!policy || marketPricePaise === null) return null;
    return decide(policy, marketPricePaise, availableKwh);
  }, [policy, marketPricePaise, availableKwh]);

  const lastAction = useRef<'HOLD' | 'SELL' | null>(null);
  useEffect(() => {
    if (!liveDecision) return;
    if (lastAction.current === 'HOLD' && liveDecision.action === 'SELL') {
      notify('Broker reached minimum price', liveDecision.reason, 'broker-sell-trigger');
    }
    lastAction.current = liveDecision.action;
  }, [liveDecision]);

  async function submitGoal(text: string) {
    setStatus('loading');
    void requestNotificationPermission();
    try {
      // POST /api/broker (Rahi) is the real path: it validates the goal, calls
      // the engine, clamps the policy into the price corridor and persists it,
      // so the Agent Activity feed and this screen agree. In mock mode there is
      // no session or database behind it, so fall back to the engine client,
      // which MSW answers from lib/broker-rules.
      const res = await fetch('/api/broker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: text }),
      });

      if (res.ok) {
        const { policy: created } = (await res.json()) as { policy: BrokerPolicy };
        setPolicy(created);
      } else {
        setPolicy(await engine.brokerPolicy(DEMO_USER_ID, text));
      }
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  const feed = events
    .filter((e): e is Extract<typeof e, { type: 'broker' }> => e.type === 'broker')
    .map((e) => e.data)
    .slice()
    .reverse();

  const stage = !policy ? 'GENERATE' : liveDecision?.action === 'SELL' ? 'MATCH' : 'MARKET';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">AI Energy Broker</h1>
        <LifecycleRail current={stage} className="hidden sm:flex" />
      </div>

      <div className="tile border-l-2 border-l-sun-500 text-xs leading-relaxed text-grid-600 dark:text-grid-400">
        The broker only sets a constrained policy from your goal. A deterministic
        engine — not the model — checks market price against that policy and
        executes. No AI agent ever touches money, assets, or settlement directly.
      </div>

      {!connected && (
        <div className="chip-neutral">Connecting to live market feed…</div>
      )}

      <div className="tile space-y-3">
        <label htmlFor="broker-goal" className="text-sm font-medium">
          Tell the broker what you want
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="broker-goal"
            className="flex-1 rounded border border-black/10 bg-transparent px-3 py-2 text-sm
                       outline-none focus-visible:ring-2 focus-visible:ring-sun-500
                       dark:border-white/10"
            placeholder={EXAMPLE_GOAL}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goal.trim() && void submitGoal(goal.trim())}
          />
          <button
            type="button"
            disabled={!goal.trim() || status === 'loading'}
            onClick={() => void submitGoal(goal.trim())}
            className="rounded border border-sun-600/40 px-4 py-2 text-sm font-medium text-sun-600
                       hover:bg-sun-500/10 disabled:opacity-40 dark:text-sun-400"
          >
            {status === 'loading' ? 'Setting policy…' : 'Set policy'}
          </button>
        </div>
        {status === 'error' && (
          <p className="text-xs text-congestion-critical">
            Could not reach the broker engine. Try again in a moment.
          </p>
        )}
        <button
          type="button"
          onClick={() => setGoal(EXAMPLE_GOAL)}
          className="text-xs text-grid-400 underline decoration-dotted underline-offset-2 hover:text-sun-600"
        >
          Use example: “{EXAMPLE_GOAL}”
        </button>
      </div>

      {policy && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="tile">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
              Active policy
            </h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="Objective" value={policy.objective.replace('_', ' ')} />
              <Row label="Minimum price" value={`${paiseToRupees(policy.minPricePaise)}/kWh`} />
              <Row label="Urgency" value={`${Math.round(policy.urgency * 100)}%`} />
              <Row label="Reserve" value={`${policy.reserveKwh.toFixed(1)} kWh`} />
              <Row label="Community donation" value={`${policy.communityDonationPct}%`} />
              <Row
                label="Valid until"
                value={new Date(policy.validUntilSim).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              />
            </dl>
            <p className="mt-3 border-t border-black/5 pt-2 text-xs text-grid-400 dark:border-white/5">
              {policy.rationale}
            </p>
          </div>

          <div className="tile flex flex-col justify-between">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
              Live decision
            </h2>
            {liveDecision ? (
              <div>
                <div
                  className={
                    liveDecision.action === 'SELL'
                      ? 'chip-live text-sm'
                      : 'chip-neutral text-sm'
                  }
                >
                  {liveDecision.action}
                </div>
                <p className="mt-2 text-sm text-grid-600 dark:text-grid-300">{liveDecision.reason}</p>
              </div>
            ) : (
              <p className="text-sm text-grid-400">Waiting for market data…</p>
            )}
            <dl className="mt-3 space-y-1 border-t border-black/5 pt-2 text-xs dark:border-white/5">
              <Row label="Market price" value={marketPricePaise !== null ? `${paiseToRupees(marketPricePaise)}/kWh` : '—'} />
              <Row label="Your exportable surplus" value={`${availableKwh.toFixed(2)} kW`} />
            </dl>
          </div>
        </div>
      )}

      <div className="tile">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grid-400">
          Agent activity
        </h2>
        {feed.length === 0 ? (
          <p className="py-4 text-center text-sm text-grid-400">
            No broker activity yet today.
          </p>
        ) : (
          <ol className="max-h-96 space-y-0 overflow-y-auto">
            {feed.map((d) => (
              <ActivityRow key={d.id} decision={d} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-grid-400">{label}</dt>
      <dd className="figure font-medium">{value}</dd>
    </div>
  );
}

function ActivityRow({ decision }: { decision: BrokerDecision }) {
  const time = new Date(decision.tsSim).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const label =
    decision.action === 'HOLD'
      ? 'MARKET BELOW MINIMUM — held'
      : decision.action === 'LIST'
        ? 'PRICE THRESHOLD REACHED'
        : decision.action === 'DONATE'
          ? 'COMMUNITY DONATION ROUTED'
          : decision.action === 'REPRICE'
            ? 'SETTLEMENT CONFIRMED'
            : decision.action;

  return (
    <li className="divider-row flex items-start gap-3 py-2 text-sm">
      <span className="figure w-14 shrink-0 text-xs text-grid-400">{time}</span>
      <div className="min-w-0">
        <span className="font-medium">{label}</span>
        <p className="text-xs text-grid-400">{decision.reason}</p>
      </div>
    </li>
  );
}
