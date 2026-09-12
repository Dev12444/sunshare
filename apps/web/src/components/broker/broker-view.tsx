'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BrokerDecision } from '@sunshare/shared';
import { Button } from '@/components/ui/controls';
import { DRAWER, Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { PriceCorridor } from '@/components/market/corridor';
import { SIM_DAY_OF_YEAR, remainingSurplusKwh } from '@/lib/mock/market-engine';
import { minutesToSunset } from '@/lib/solar';
import { durationMinutes, kwh, pct, rupees, simClock } from '@/lib/format';
import { logActivity, setState, useStore } from '@/lib/store';
import { useTariff } from '@/hooks/use-derived';
import { ActivityFeed } from './activity-feed';
import { DecisionHistory, DecisionPanel } from './decision';
import { GoalInput } from './goal-input';
import { ExecutionModel, PolicyCard } from './policy-card';

/**
 * Energy broker.
 *
 * Laid out as a control surface: the standing instruction on the left, what
 * the executor did with it in the middle of the reading order, and the market
 * it is reacting to on the right. The conversational part is one field at the
 * top — it is an input to the system, not the system itself.
 */
export function BrokerView() {
  const policy = useStore((s) => s.policy);
  const paused = useStore((s) => s.brokerPaused);
  const decisions = useStore((s) => s.decisions);
  const market = useStore((s) => s.market);
  const simMinutes = useStore((s) => s.simMinutes);
  const tick = useStore((s) => s.tick);
  const myListings = useStore((s) => s.myListings);

  const tariff = useTariff();
  const [selected, setSelected] = useState<BrokerDecision | null>(null);
  const [editing, setEditing] = useState(false);

  const latest = decisions[0] ?? null;
  const clearing = market?.lastClearingPricePaise ?? null;
  const marketPrice = clearing ?? market?.indicativePricePaise ?? 0;
  const toSunset = minutesToSunset(simMinutes / 60, SIM_DAY_OF_YEAR);
  const remainingKwh = policy ? remainingSurplusKwh(policy.userId, simMinutes) : 0;
  const brokerListing = myListings.find(
    (l) => l.brokerPolicyId === policy?.id && l.status === 'OPEN',
  );
  const belowFloor = policy ? marketPrice < policy.minPricePaise : false;

  function cancelPolicy() {
    const id = policy?.id;
    setState((s) => ({
      policy: null,
      brokerPaused: false,
      myListings: s.myListings.map((l) =>
        l.brokerPolicyId === id && l.status === 'OPEN' ? { ...l, status: 'WITHDRAWN' as const } : l,
      ),
    }));
    logActivity({
      tsSim: tick?.tsSim ?? '',
      channel: 'policy',
      text: 'Policy cancelled by the user. Any broker listing withdrawn.',
    });
  }

  return (
    <div className="space-y-4">
      <PageHead
        title="Energy Broker"
        subtitle="A goal in plain language becomes a constrained policy. A deterministic executor trades against it."
        aside={
          policy ? (
            <div className="flex items-center gap-2">
              <Tag tone={paused ? 'neutral' : 'up'} dot>
                {paused ? 'Paused' : 'Running'}
              </Tag>
              <Button
                size="sm"
                onClick={() => {
                  setState({ brokerPaused: !paused });
                  logActivity({
                    tsSim: tick?.tsSim ?? '',
                    channel: 'policy',
                    text: paused ? 'Broker resumed.' : 'Broker paused by the user.',
                  });
                }}
              >
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit policy
              </Button>
              <Button size="sm" variant="danger" onClick={cancelPolicy}>
                Cancel
              </Button>
            </div>
          ) : null
        }
      />

      {policy ? (
        <Panel>
          <MetricRow>
            <MetricCell>
              <Metric
                label="Market price"
                value={rupees(marketPrice)}
                unit="/kWh"
                tone="solar"
                flash={marketPrice}
                hint={clearing ? 'Last cleared slot' : 'Indicative'}
              />
            </MetricCell>
            <MetricCell>
              <Metric
                label="Your floor"
                value={rupees(policy.minPricePaise)}
                unit="/kWh"
                tone={belowFloor ? 'down' : 'up'}
                hint={
                  belowFloor
                    ? `${rupees(policy.minPricePaise - marketPrice)} below floor`
                    : `${rupees(marketPrice - policy.minPricePaise)} of headroom`
                }
              />
            </MetricCell>
            <MetricCell>
              <Metric
                label="Sellable surplus"
                value={kwh(Math.max(0, remainingKwh - policy.reserveKwh))}
                unit="kWh"
                hint={`${kwh(remainingKwh)} kWh left today, ${policy.reserveKwh} reserved`}
              />
            </MetricCell>
            <MetricCell>
              <Metric
                label="Generation ends"
                value={durationMinutes(toSunset)}
                hint="Until solar elevation reaches zero"
              />
            </MetricCell>
            <MetricCell>
              <Metric
                label="Policy expires"
                value={simClock(policy.validUntilSim)}
                hint={
                  clockMinutes(policy.validUntilSim) > simMinutes
                    ? `${durationMinutes(clockMinutes(policy.validUntilSim) - simMinutes)} remaining`
                    : 'Expired'
                }
              />
            </MetricCell>
            <MetricCell>
              <Metric
                label="Decisions"
                value={String(decisions.length)}
                hint={brokerListing ? 'Listing live' : 'No live listing'}
              />
            </MetricCell>
          </MetricRow>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title={policy ? 'Active policy' : 'New policy'} />
            <PanelBody>
              {policy && !editing ? (
                <PolicyCard policy={policy} tariff={tariff} clearingPricePaise={clearing} />
              ) : (
                <GoalInput onCreated={() => setEditing(false)} />
              )}
            </PanelBody>
            {policy && editing ? (
              <div className="border-t border-rule/[.13] px-3.5 py-2.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Keep current policy
                </Button>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHead title="How this works" />
            <ExecutionModel />
            <p className="border-t border-rule/[.13] px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
              The model never holds funds, never signs a settlement and cannot place an order
              outside the price corridor. Cancelling the policy withdraws anything it has offered.
            </p>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {policy ? (
            <Panel>
              <PanelHead
                title="Broker decision"
                meta={latest ? `Evaluated ${simClock(latest.tsSim)}` : 'Awaiting first evaluation'}
              />
              {latest ? (
                <DecisionPanel decision={latest} />
              ) : (
                <EmptyState title="No decision yet">
                  The executor evaluates every five simulated minutes. It will act only when the
                  market is at or above {rupees(policy.minPricePaise)} and there is surplus beyond
                  your {policy.reserveKwh} kWh reserve.
                </EmptyState>
              )}
            </Panel>
          ) : (
            <Panel>
              <PanelHead title="Broker decision" />
              <EmptyState
                title="No policy configured"
                action={
                  <span className="text-xs text-ink-3">
                    Write a goal on the left, or pick one of the examples.
                  </span>
                }
              >
                Without a policy the broker does nothing at all. Your surplus is exported to the
                DISCOM at the {rupees(tariff.feedInTariffPaise)} feed-in tariff unless you list it
                yourself on the{' '}
                <Link href="/marketplace" className="underline underline-offset-2">
                  marketplace
                </Link>
                .
              </EmptyState>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Market context" />
              <PanelBody className="space-y-3">
                <PriceCorridor
                  tariff={tariff}
                  clearingPricePaise={clearing}
                  indicativePricePaise={market?.indicativePricePaise ?? null}
                  askPricePaise={policy?.minPricePaise ?? null}
                  height="sm"
                />
                <dl>
                  <DataRow label="Supply offered">{kwh(market?.totalSupplyKwh ?? 0)} kWh</DataRow>
                  <DataRow label="Demand bid">{kwh(market?.totalDemandKwh ?? 0)} kWh</DataRow>
                  <DataRow label="Cloud cover">{pct(tick?.weather.cloudCoverPct ?? 0, 0)}</DataRow>
                  <DataRow label="Congestion">
                    {pct((market?.congestionIndex ?? 0) * 100, 0)}
                  </DataRow>
                  {brokerListing ? (
                    <DataRow label="Broker listing" tone="solar">
                      {kwh(brokerListing.kwh)} kWh @ {rupees(brokerListing.askPricePaise)}
                    </DataRow>
                  ) : null}
                </dl>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHead
                title="Agent activity"
                meta="Operational log"
                actions={
                  <span className="font-mono text-xs tabular-nums text-ink-3">
                    {decisions.length}
                  </span>
                }
              />
              <ActivityFeed
                channels={['policy', 'broker', 'match', 'settlement', 'community']}
                maxHeight={252}
                emptyNote="Create a policy to start the log."
              />
            </Panel>
          </div>

          <Panel>
            <PanelHead title="Decision history" meta={`${decisions.length} evaluations`} />
            <DecisionHistory
              decisions={decisions}
              onSelect={setSelected}
              selectedId={selected?.id}
              maxHeight={300}
            />
          </Panel>
        </div>
      </div>

      <Inspector
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow="Broker decision"
        title={selected ? simClock(selected.tsSim) : ''}
        className={DRAWER}
      >
        {selected ? (
          <div className="-mx-3.5 -my-3">
            <DecisionPanel decision={selected} />
          </div>
        ) : null}
      </Inspector>
    </div>
  );
}

function clockMinutes(iso: string): number {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
