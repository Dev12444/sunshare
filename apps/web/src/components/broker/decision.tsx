'use client';

import type { BrokerAction, BrokerDecision } from '@sunshare/shared';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/states';
import type { Tone } from '@/lib/domain';
import { durationMinutes, kwh, pct, rupees, simClock } from '@/lib/format';
import { cn } from '@/lib/utils';

const ACTION_TONE: Record<BrokerAction, Tone> = {
  LIST: 'up',
  REPRICE: 'solar',
  HOLD: 'neutral',
  WITHDRAW: 'warn',
  DONATE: 'mains',
};

const ACTION_COPY: Record<BrokerAction, string> = {
  LIST: 'SELL',
  REPRICE: 'REPRICE',
  HOLD: 'HOLD',
  WITHDRAW: 'WITHDRAW',
  DONATE: 'DONATE',
};

/**
 * The current decision.
 *
 * Every decision has to survive being read aloud: what it did, on what
 * numbers, and why. The inputs are shown next to the verdict rather than
 * behind a disclosure, because "the broker held" is only trustworthy if you
 * can see the price it was looking at when it held.
 */
export function DecisionPanel({
  decision,
  className,
}: {
  decision: BrokerDecision;
  className?: string;
}) {
  const isTrade = decision.action === 'LIST' || decision.action === 'REPRICE';
  const revenue =
    decision.toPricePaise != null ? Math.round(decision.kwh * decision.toPricePaise) : null;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3.5 pt-3">
        <div className="flex items-baseline gap-3">
          <span className="text-label font-semibold uppercase text-ink-3">Decision</span>
          <span
            className={cn(
              'font-mono text-2xl font-medium tracking-[-0.02em]',
              decision.action === 'LIST' && 'text-up',
              decision.action === 'REPRICE' && 'text-solar-deep',
              decision.action === 'WITHDRAW' && 'text-warn',
              decision.action === 'HOLD' && 'text-ink',
              decision.action === 'DONATE' && 'text-mains',
            )}
          >
            {ACTION_COPY[decision.action]}
          </span>
        </div>
        <time className="font-mono text-sm tabular-nums text-ink-3">
          {simClock(decision.tsSim)}
        </time>
      </div>

      {isTrade ? (
        <dl className="mt-3 grid grid-cols-3 border-y border-rule/[.13] hair-x">
          <Cell label="Energy" value={`${kwh(decision.kwh)} kWh`} />
          <Cell
            label="Price"
            value={decision.toPricePaise != null ? `${rupees(decision.toPricePaise)}` : '—'}
          />
          <Cell
            label="Expected revenue"
            value={revenue != null ? rupees(revenue) : '—'}
            tone="up"
          />
        </dl>
      ) : null}

      <div className="px-3.5 py-3">
        <p className="text-label font-semibold uppercase text-ink-3">Reason</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{decision.reason}</p>
      </div>

      <dl className="grid grid-cols-2 border-t border-rule/[.13] hair-x sm:grid-cols-5">
        <Cell label="Surplus" value={`${kwh(decision.inputs.surplusKwh)} kWh`} small />
        <Cell
          label="To sunset"
          value={durationMinutes(decision.inputs.minutesToSunset)}
          small
        />
        <Cell label="Cloud" value={pct(decision.inputs.forecastCloudPct, 0)} small />
        <Cell label="Market" value={rupees(decision.inputs.marketPricePaise)} small />
        <Cell
          label="Congestion"
          value={pct(decision.inputs.congestionIndex * 100, 0)}
          small
        />
      </dl>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: 'up';
  small?: boolean;
}) {
  return (
    <div className={small ? 'px-3 py-2' : 'px-3.5 py-2.5'}>
      <dt className="text-label font-semibold uppercase text-ink-3">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-mono tabular-nums',
          small ? 'text-sm' : 'text-md',
          tone === 'up' ? 'text-up' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Decision history. One row per evaluation that changed something. */
export function DecisionHistory({
  decisions,
  onSelect,
  selectedId,
  maxHeight,
}: {
  decisions: BrokerDecision[];
  onSelect?: (d: BrokerDecision) => void;
  selectedId?: string | null;
  maxHeight?: number;
}) {
  const columns: Column<BrokerDecision>[] = [
    {
      key: 'time',
      header: 'Time',
      width: '60px',
      cell: (d) => <Num tone="muted">{simClock(d.tsSim)}</Num>,
    },
    {
      key: 'action',
      header: 'Decision',
      width: '96px',
      cell: (d) => <Tag tone={ACTION_TONE[d.action]}>{ACTION_COPY[d.action]}</Tag>,
    },
    {
      key: 'kwh',
      header: 'kWh',
      align: 'right',
      width: '62px',
      cell: (d) => <Num tone={d.kwh > 0 ? undefined : 'muted'}>{kwh(d.kwh)}</Num>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '76px',
      hide: 'sm',
      cell: (d) => (
        <Num tone="muted">{d.toPricePaise != null ? rupees(d.toPricePaise) : '—'}</Num>
      ),
    },
    {
      key: 'market',
      header: 'Market',
      align: 'right',
      width: '76px',
      hide: 'lg',
      cell: (d) => <Num tone="muted">{rupees(d.inputs.marketPricePaise)}</Num>,
    },
    {
      key: 'reason',
      header: 'Reason',
      hide: 'xl',
      cell: (d) => <span className="text-sm text-ink-2">{d.reason}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={decisions}
      rowKey={(d) => d.id}
      onRowClick={onSelect}
      selectedKey={selectedId}
      dense
      maxHeight={maxHeight}
      caption="Broker decision history"
      empty={
        <EmptyState title="No decisions yet">
          The executor evaluates the policy every five simulated minutes. The first decision
          appears at the next evaluation.
        </EmptyState>
      }
    />
  );
}
