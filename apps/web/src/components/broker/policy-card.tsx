'use client';

import type { BrokerPolicy, TariffContext } from '@sunshare/shared';
import { DataRow } from '@/components/ui/metric';
import { Tag } from '@/components/ui/tag';
import { PriceCorridor } from '@/components/market/corridor';
import { objectiveLabel } from '@/lib/mock/broker';
import { rupees, simClock } from '@/lib/format';

/**
 * The interpreted policy.
 *
 * This is the whole safety argument rendered as a screen: the language went in
 * at the top, and what came out is a fixed set of numbers the user can read,
 * check and cancel. If the interpretation is wrong, it is wrong *here*, before
 * anything has been offered to the market.
 */
export function PolicyCard({
  policy,
  tariff,
  clearingPricePaise,
}: {
  policy: BrokerPolicy;
  tariff: TariffContext;
  clearingPricePaise: number | null;
}) {
  const urgencyLabel =
    policy.urgency >= 0.7 ? 'High' : policy.urgency >= 0.4 ? 'Moderate' : 'Patient';

  return (
    <div className="space-y-3.5">
      <p className="border-l-2 border-rule/25 px-3 py-1 text-sm italic text-ink-2">
        “{policy.rawGoal}”
      </p>

      <dl>
        <DataRow label="Objective" mono={false}>
          {objectiveLabel(policy.objective)}
        </DataRow>
        <DataRow label="Minimum price" tone="solar">
          {rupees(policy.minPricePaise)}/kWh
        </DataRow>
        <DataRow label="Maximum price">{rupees(policy.maxPricePaise)}/kWh</DataRow>
        <DataRow label="Urgency" mono={false}>
          {urgencyLabel} · {policy.urgency.toFixed(2)}
        </DataRow>
        <DataRow label="Reserve">{policy.reserveKwh} kWh</DataRow>
        <DataRow label="Community donation">{policy.communityDonationPct}%</DataRow>
        <DataRow label="Valid until">{simClock(policy.validUntilSim)}</DataRow>
      </dl>

      <PriceCorridor
        tariff={tariff}
        clearingPricePaise={clearingPricePaise}
        askPricePaise={policy.minPricePaise}
        height="sm"
        showLegend={false}
      />
      <p className="text-xs text-ink-3">
        The dark marker is your floor; the amber marker is the market. The broker only acts when
        the market is at or above your floor.
      </p>

      <div className="border-t border-rule/[.13] pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label font-semibold uppercase text-ink-3">Interpretation</span>
          <Tag tone={policy.source === 'llm' ? 'solar' : 'neutral'}>
            {policy.source === 'llm' ? 'Language model' : 'Rule-based parser'}
          </Tag>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{policy.rationale}</p>
      </div>
    </div>
  );
}

/**
 * The division of responsibility, stated once, in the place where somebody
 * would reasonably worry about it.
 */
export function ExecutionModel() {
  const steps = [
    {
      label: 'Goal',
      body: 'Your sentence. Never sent to the market and never used as an instruction to trade.',
    },
    {
      label: 'Policy',
      body: 'Objective, price floor, reserve, donation share and an expiry. Schema-validated and clamped into the price corridor.',
    },
    {
      label: 'Executor',
      body: 'Ordinary deterministic code. It reads the policy and the order book, and places or withdraws orders. It is the only thing that touches the market.',
    },
  ];

  return (
    <ol className="hair-y">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3 px-3.5 py-2.5">
          <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-ink-3">{i + 1}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{s.label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-2">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
