'use client';

import { useMemo, useState } from 'react';
import type { TradeRecord } from '@sunshare/shared';
import { Button, Input, SegmentedControl, Select } from '@/components/ui/controls';
import { Inspector } from '@/components/ui/inspector';
import { Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel } from '@/components/ui/panel';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { HashValue } from '@/components/ui/hash';
import { TradeReceipt } from '@/components/market/trade-receipt';
import { TRADE_STATUS_COPY, tradeStatusTone } from '@/lib/domain';
import { kgCo2, kwh, rupees, simClock } from '@/lib/format';
import { displayName } from '@/lib/seed';
import { allDonations, allReceipts, allTrades, useStore } from '@/lib/store';
import { useTariff } from '@/hooks/use-derived';

type StatusFilter = 'all' | 'settled' | 'pending' | 'failed';
type ScopeFilter = 'all' | 'personal' | 'community';

/**
 * Transaction explorer.
 *
 * A ledger is a list of facts, so it is a table with filters and a detail
 * inspector — the same shape as any block explorer, because that is the shape
 * people already know how to read. Community allocations appear in the same
 * list as trades because they are settled the same way and a regulator should
 * not have to visit two screens to reconcile a slot.
 */
export function LedgerView() {
  const history = useStore((s) => s.history);
  const user = useStore((s) => s.user);
  const receipts = useStore(allReceipts);

  const trades = useMemo(() => allTrades({ history }), [history]);
  const donations = useMemo(() => allDonations({ history }), [history]);
  const tariff = useTariff();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [minKwh, setMinKwh] = useState('');
  const [fromClock, setFromClock] = useState('');
  const [selected, setSelected] = useState<TradeRecord | null>(null);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'time',
    direction: 'desc',
  });

  const donorIds = useMemo(() => new Set(donations.map((d) => `${d.slotId}:${d.donorId}`)), [donations]);

  const rows = useMemo(() => {
    const min = Number(minKwh);
    const filtered = trades.filter((t) => {
      if (status === 'settled' && t.status !== 'SETTLED') return false;
      if (status === 'failed' && t.status !== 'FAILED') return false;
      if (status === 'pending' && (t.status === 'SETTLED' || t.status === 'FAILED')) return false;
      if (scope === 'personal' && t.sellerId !== user.id && t.buyerId !== user.id) return false;
      if (scope === 'community' && !donorIds.has(`${t.slotId}:${t.sellerId}`)) return false;
      if (Number.isFinite(min) && minKwh !== '' && t.deliveredKwh < min) return false;
      if (fromClock && t.createdAt.slice(11, 16) < fromClock) return false;
      return true;
    });

    const value = (t: TradeRecord) =>
      sort.key === 'time'
        ? t.createdAt
        : sort.key === 'energy'
          ? t.deliveredKwh
          : sort.key === 'price'
            ? t.pricePaise
            : sort.key === 'fee'
              ? t.wheelingFeePaise
              : t.grossPaise;

    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [trades, status, scope, minKwh, fromClock, sort, user.id, donorIds]);

  const totals = useMemo(() => {
    const settled = rows.filter((t) => t.status === 'SETTLED');
    return {
      count: rows.length,
      energy: settled.reduce((s, t) => s + t.deliveredKwh, 0),
      value: settled.reduce((s, t) => s + t.grossPaise, 0),
      fees: settled.reduce((s, t) => s + t.wheelingFeePaise, 0),
      co2: settled.reduce((s, t) => s + t.co2AvoidedKg, 0),
      failed: rows.filter((t) => t.status === 'FAILED').length,
    };
  }, [rows]);

  const columns: Column<TradeRecord>[] = [
    {
      key: 'time',
      header: 'Time',
      width: '62px',
      sortable: true,
      cell: (t) => <Num tone="muted">{simClock(t.createdAt)}</Num>,
    },
    {
      key: 'trade',
      header: 'Trade',
      cell: (t) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-sm text-ink">
            <span className="truncate">{displayName(t.sellerId)}</span>
            <span aria-hidden className="text-ink-3">
              →
            </span>
            <span className="truncate">{displayName(t.buyerId)}</span>
          </span>
          <span className="font-mono text-xs text-ink-3">{t.id}</span>
        </span>
      ),
    },
    {
      key: 'energy',
      header: 'Energy',
      align: 'right',
      width: '84px',
      sortable: true,
      cell: (t) => <Num unit="kWh">{kwh(t.deliveredKwh)}</Num>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '78px',
      sortable: true,
      hide: 'sm',
      cell: (t) => <Num>{rupees(t.pricePaise)}</Num>,
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right',
      width: '72px',
      sortable: true,
      hide: 'lg',
      cell: (t) => <Num tone="muted">{rupees(t.wheelingFeePaise)}</Num>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      width: '84px',
      sortable: true,
      hide: 'md',
      cell: (t) => <Num>{rupees(t.grossPaise)}</Num>,
    },
    {
      key: 'tx',
      header: 'Transaction',
      width: '150px',
      hide: 'xl',
      cell: (t) => {
        const r = receipts.get(t.id);
        return r ? (
          <HashValue value={r.txHash} lead={6} tail={4} />
        ) : (
          <span className="text-xs text-ink-3">not submitted</span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      width: '92px',
      cell: (t) => <Tag tone={tradeStatusTone(t.status)}>{TRADE_STATUS_COPY[t.status]}</Tag>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHead
        title="Ledger"
        subtitle="Every matched, delivered and settled trade on the simulated day"
        aside={
          <span className="text-xs text-ink-3">
            Chain{' '}
            <span className="font-mono tabular-nums text-ink-2">31337</span> · local devnet
          </span>
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric label="Records" value={String(totals.count)} hint={`${trades.length} today`} />
          </MetricCell>
          <MetricCell>
            <Metric label="Energy settled" value={kwh(totals.energy)} unit="kWh" />
          </MetricCell>
          <MetricCell>
            <Metric label="Value" value={rupees(totals.value)} />
          </MetricCell>
          <MetricCell>
            <Metric label="Wheeling fees" value={rupees(totals.fees)} tone="mains" hint="To the DISCOM" />
          </MetricCell>
          <MetricCell>
            <Metric label="CO₂ avoided" value={kgCo2(totals.co2)} tone="up" />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Failed"
              value={String(totals.failed)}
              tone={totals.failed > 0 ? 'down' : 'neutral'}
              hint={totals.failed > 0 ? 'Retried next slot' : 'None'}
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-rule/[.13] px-3.5 py-2.5">
          <SegmentedControl
            size="sm"
            label="Settlement status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'settled', label: 'Settled' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Network' },
              { value: 'personal', label: 'Mine' },
              { value: 'community', label: 'Community' },
            ]}
          />
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            From
            <Input
              type="time"
              value={fromClock}
              onChange={(e) => setFromClock(e.target.value)}
              className="h-7 w-[104px]"
              aria-label="Filter from time"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-3">
            Min energy
            <Input
              inputMode="decimal"
              value={minKwh}
              onChange={(e) => setMinKwh(e.target.value)}
              placeholder="0.00"
              suffix="kWh"
              className="h-7 w-[104px]"
              aria-label="Minimum delivered energy"
            />
          </label>
          {(status !== 'all' || scope !== 'all' || minKwh || fromClock) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStatus('all');
                setScope('all');
                setMinKwh('');
                setFromClock('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          onRowClick={setSelected}
          selectedKey={selected?.id}
          sort={sort}
          onSortChange={(key) =>
            setSort((s) =>
              s.key === key
                ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' }
                : { key, direction: 'desc' },
            )
          }
          maxHeight={520}
          caption="Settlement ledger"
          empty={
            <EmptyState
              title="No records match"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setStatus('all');
                    setScope('all');
                    setMinKwh('');
                    setFromClock('');
                  }}
                >
                  Clear filters
                </Button>
              }
            >
              {trades.length === 0
                ? 'No slot has settled yet today. Records appear as each 15-minute slot clears.'
                : `${trades.length} records exist today but none match the current filters.`}
            </EmptyState>
          }
        />
      </Panel>

      <Inspector
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow="Settlement record"
        title={selected?.id ?? ''}
        className="lg:fixed lg:inset-y-0 lg:right-0 lg:z-50 lg:w-[400px] lg:border-l"
      >
        {selected ? (
          <TradeReceipt
            trade={selected}
            receipt={receipts.get(selected.id) ?? null}
            tariff={tariff}
            userId={user.id}
          />
        ) : null}
      </Inspector>
    </div>
  );
}
