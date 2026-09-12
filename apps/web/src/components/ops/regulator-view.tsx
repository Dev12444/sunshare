'use client';

import { useMemo, useState } from 'react';
import { PriceChart } from '@/components/charts/price-chart';
import { Button, SegmentedControl, Select } from '@/components/ui/controls';
import { Inspector } from '@/components/ui/inspector';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead } from '@/components/ui/panel';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { MeterBar, Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/states';
import { corridorPosition } from '@/lib/domain';
import { kgCo2, kwh, pct, rupees } from '@/lib/format';
import { priceSeries } from '@/lib/mock/market-engine';
import type { SettledSlot } from '@/lib/mock/state-defaults';
import { useStore } from '@/lib/store';
import { useNetworkLedger, useTariff } from '@/hooks/use-derived';
import { useRoleSurface } from '@/hooks/use-role-surface';

type Window = 'all' | 'morning' | 'midday' | 'evening';
type Dataset = 'trades' | 'donations';

const WINDOWS: Record<Window, [number, number]> = {
  all: [0, 24],
  morning: [6, 11],
  midday: [11, 16],
  evening: [16, 24],
};

/**
 * Market oversight.
 *
 * A regulator's questions are compliance questions, so the screen leads with
 * the corridor invariant rather than with volume: every cleared slot, was the
 * price inside the band, and can that be exported and checked offline. The
 * slot table is the audit unit because the corridor is enforced per slot.
 */
export function RegulatorView() {
  useRoleSurface('REGULATOR');
  const history = useStore((s) => s.history);
  const topology = useStore((s) => s.topology);
  const mocked = useStore((s) => s.mocked);
  const network = useNetworkLedger();
  const tariff = useTariff();

  const [window, setWindow] = useState<Window>('all');
  const [dataset, setDataset] = useState<Dataset>('trades');
  const [selected, setSelected] = useState<SettledSlot | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'done' | 'error'>('idle');

  const slots = useMemo(() => {
    const [from, to] = WINDOWS[window];
    return history
      .filter((s) => {
        const hour = Number(s.slotId.slice(11, 13));
        return hour >= from && hour < to;
      })
      .slice()
      .reverse();
  }, [history, window]);

  const compliance = useMemo(() => {
    const cleared = slots.filter((s) => s.volumeKwh > 0);
    const breaches = cleared.filter(
      (s) =>
        s.clearingPricePaise < tariff.feedInTariffPaise ||
        s.clearingPricePaise > tariff.retailTariffPaise,
    );
    return {
      cleared: cleared.length,
      breaches: breaches.length,
      rate: cleared.length ? ((cleared.length - breaches.length) / cleared.length) * 100 : 100,
    };
  }, [slots, tariff]);

  const volume = slots.reduce((s, x) => s + x.volumeKwh, 0);
  const value = slots.reduce(
    (sum, s) => sum + s.trades.reduce((t, x) => t + (x.status === 'FAILED' ? 0 : x.grossPaise), 0),
    0,
  );
  const wheeling = slots.reduce(
    (sum, s) =>
      sum + s.trades.reduce((t, x) => t + (x.status === 'FAILED' ? 0 : x.wheelingFeePaise), 0),
    0,
  );
  const tradeCount = slots.reduce((s, x) => s + x.trades.length, 0);
  const avgPrice = compliance.cleared
    ? Math.round(
        slots.filter((s) => s.volumeKwh > 0).reduce((sum, s) => sum + s.clearingPricePaise, 0) /
          compliance.cleared,
      )
    : null;

  async function exportCsv() {
    try {
      if (!mocked) {
        const res = await fetch(`/api/regulator/export?dataset=${dataset}`);
        if (!res.ok) throw new Error(String(res.status));
        download(await res.text(), `sunshare-${dataset}-2026-09-12.csv`);
        setExportState('done');
        setTimeout(() => setExportState('idle'), 2600);
        return;
      }

      const csv =
        dataset === 'trades'
          ? toCsv(
              [
                'trade_id',
                'slot_id',
                'seller_id',
                'buyer_id',
                'kwh',
                'delivered_kwh',
                'price_paise',
                'gross_paise',
                'wheeling_fee_paise',
                'net_to_seller_paise',
                'efficiency_pct',
                'co2_avoided_kg',
                'status',
                'created_at',
              ],
              slots.flatMap((s) =>
                s.trades.map((t) => [
                  t.id,
                  t.slotId,
                  t.sellerId,
                  t.buyerId,
                  t.kwh,
                  t.deliveredKwh,
                  t.pricePaise,
                  t.grossPaise,
                  t.wheelingFeePaise,
                  t.netToSellerPaise,
                  t.efficiencyPct,
                  t.co2AvoidedKg,
                  t.status,
                  t.createdAt,
                ]),
              ),
            )
          : toCsv(
              [
                'donation_id',
                'slot_id',
                'donor_id',
                'beneficiary_id',
                'beneficiary_name',
                'kwh',
                'value_paise',
                'tx_hash',
                'created_at',
              ],
              slots.flatMap((s) =>
                s.donations.map((d) => [
                  d.id,
                  d.slotId,
                  d.donorId,
                  d.beneficiaryId,
                  d.beneficiaryName,
                  d.kwh,
                  d.valuePaise,
                  d.txHash ?? '',
                  d.createdAt,
                ]),
              ),
            );

      download(csv, `sunshare-${dataset}-2026-09-12.csv`);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 2600);
    } catch {
      setExportState('error');
    }
  }

  const columns: Column<SettledSlot>[] = [
    {
      key: 'slot',
      header: 'Slot',
      width: '68px',
      cell: (s) => <Num className="text-ink">{s.slotId.slice(11)}</Num>,
    },
    {
      key: 'price',
      header: 'Clearing',
      align: 'right',
      width: '86px',
      cell: (s) => (
        <Num tone={s.volumeKwh > 0 ? undefined : 'muted'}>{rupees(s.clearingPricePaise)}</Num>
      ),
    },
    {
      key: 'corridor',
      header: 'Position in corridor',
      width: '150px',
      hide: 'md',
      cell: (s) => (
        <div className="flex items-center gap-2">
          <MeterBar
            value={corridorPosition(s.clearingPricePaise, tariff)}
            tone="solar"
            className="w-20"
            ariaLabel="Position in corridor"
          />
          <span className="font-mono text-xs tabular-nums text-ink-3">
            {pct(corridorPosition(s.clearingPricePaise, tariff) * 100, 0)}
          </span>
        </div>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      width: '84px',
      cell: (s) => <Num unit="kWh">{kwh(s.volumeKwh)}</Num>,
    },
    {
      key: 'trades',
      header: 'Trades',
      align: 'right',
      width: '68px',
      hide: 'sm',
      cell: (s) => <Num tone="muted">{s.trades.length}</Num>,
    },
    {
      key: 'loss',
      header: 'Loss',
      align: 'right',
      width: '76px',
      hide: 'lg',
      cell: (s) => <Num tone="muted">{kwh(s.match.totalLossKwh)}</Num>,
    },
    {
      key: 'backfill',
      header: 'Backfill',
      align: 'right',
      width: '84px',
      hide: 'xl',
      cell: (s) => (
        <Num tone={s.match.gridBackfillKwh > 0 ? undefined : 'muted'}>
          {kwh(s.match.gridBackfillKwh)}
        </Num>
      ),
    },
    {
      key: 'compliance',
      header: 'Corridor',
      align: 'right',
      width: '96px',
      cell: (s) => {
        const inside =
          s.clearingPricePaise >= tariff.feedInTariffPaise &&
          s.clearingPricePaise <= tariff.retailTariffPaise;
        return <Tag tone={inside ? 'up' : 'down'}>{inside ? 'Compliant' : 'Breach'}</Tag>;
      },
    },
  ];

  const utilisationAvg =
    topology.edges.length > 0
      ? topology.edges.reduce(
          (s, e) => s + (e.capacityKw > 0 ? e.currentLoadKw / e.capacityKw : 0),
          0,
        ) / topology.edges.length
      : 0;

  return (
    <div className="space-y-4">
      <PageHead
        title="Market Oversight"
        subtitle="State Electricity Commission · Sector 21 pilot · 12 September 2026"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Export dataset"
              value={dataset}
              onChange={(e) => setDataset((e.target as HTMLSelectElement).value as Dataset)}
              className="h-[34px] w-auto text-sm"
            >
              <option value="trades">Trades</option>
              <option value="donations">Community allocations</option>
            </Select>
            <Button variant="primary" onClick={exportCsv}>
              {exportState === 'done' ? 'CSV saved' : 'Export CSV'}
            </Button>
          </div>
        }
      />

      {exportState === 'error' ? (
        <p className="border-l-2 border-down bg-down-wash/40 px-3.5 py-2 text-sm text-ink-2">
          Export service unavailable. The table below is unaffected and can be read on screen.
        </p>
      ) : null}

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Corridor compliance"
              value={pct(compliance.rate, 1)}
              tone={compliance.breaches === 0 ? 'up' : 'down'}
              size="lg"
              hint={`${compliance.cleared - compliance.breaches} of ${compliance.cleared} cleared slots inside the band`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Average clearing price"
              value={avgPrice != null ? rupees(avgPrice) : '—'}
              unit="/kWh"
              hint={`Corridor ${rupees(tariff.feedInTariffPaise)}–${rupees(tariff.retailTariffPaise)}`}
            />
          </MetricCell>
          <MetricCell>
            <Metric label="Market volume" value={kwh(volume)} unit="kWh" hint={`${slots.length} slots`} />
          </MetricCell>
          <MetricCell>
            <Metric label="Market value" value={rupees(value)} hint={`${tradeCount} trades`} />
          </MetricCell>
          <MetricCell>
            <Metric label="Wheeling charges" value={rupees(wheeling)} tone="mains" hint="Collected by the DISCOM" />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Community allocation"
              value={kwh(network.donatedKwh)}
              unit="kWh"
              tone="solar"
              hint={`${network.donations.length} transfers`}
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/[.13] px-3.5 py-2.5">
              <span className="text-label font-semibold uppercase text-ink-2">Cleared slots</span>
              <SegmentedControl
                size="sm"
                label="Time window"
                value={window}
                onChange={setWindow}
                options={[
                  { value: 'all', label: 'All day' },
                  { value: 'morning', label: '06–11' },
                  { value: 'midday', label: '11–16' },
                  { value: 'evening', label: '16–24' },
                ]}
              />
            </div>
            <DataTable
              columns={columns}
              rows={slots}
              rowKey={(s) => s.slotId}
              onRowClick={setSelected}
              selectedKey={selected?.slotId}
              dense
              maxHeight={420}
              caption="Cleared market slots with corridor compliance"
              empty={
                <EmptyState title="No slots in this window">
                  The market has not cleared a slot in the selected hours yet.
                </EmptyState>
              }
            />
          </Panel>

          <Panel>
            <PanelHead title="Clearing price against the corridor" meta={`${history.length} slots today`} />
            <PanelBody>
              <PriceChart data={priceSeries(history)} tariff={tariff} height={196} />
            </PanelBody>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <Inspector
              open
              onClose={() => setSelected(null)}
              eyebrow="Slot"
              title={selected.slotId.slice(11)}
            >
              <SlotDetail slot={selected} />
            </Inspector>
          ) : (
            <Panel>
              <PanelHead title="Slot inspector" />
              <PanelBody>
                <p className="text-sm text-ink-3">
                  Select a slot to see its clearing price, matched pairs, losses, backfill and the
                  order-book commitment recorded for it.
                </p>
              </PanelBody>
            </Panel>
          )}

          <Panel>
            <PanelHead title="Settlement activity" meta="Today" />
            <PanelBody>
              <dl>
                <DataRow label="Trades settled" tone="up">
                  {network.trades - network.failed}
                </DataRow>
                <DataRow label="Failed" tone={network.failed > 0 ? 'down' : 'neutral'}>
                  {network.failed}
                </DataRow>
                <DataRow label="Energy delivered">{kwh(network.deliveredKwh)} kWh</DataRow>
                <DataRow label="Line losses">{kwh(network.lossKwh)} kWh</DataRow>
                <DataRow label="Grid backfill">{kwh(network.backfillKwh)} kWh</DataRow>
                <DataRow label="CO₂ avoided" tone="up">
                  {kgCo2(network.co2Kg)}
                </DataRow>
              </dl>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Grid utilisation" meta="Mean across all spans" />
            <PanelBody className="space-y-2">
              <Metric
                label="Average span utilisation"
                value={pct(utilisationAvg * 100, 1)}
                size="sm"
              />
              <MeterBar value={utilisationAvg} tone="mains" />
              <p className="text-xs leading-relaxed text-ink-2">
                Local matching keeps energy on the low-voltage network, which is why average span
                utilisation stays well below the substation tie. Peak utilisation, not the mean, is
                the binding constraint — it is shown per span on the grid page.
              </p>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Tariff basis" />
            <PanelBody>
              <dl>
                <DataRow label="Feed-in tariff">{rupees(tariff.feedInTariffPaise)}/kWh</DataRow>
                <DataRow label="Retail tariff">{rupees(tariff.retailTariffPaise)}/kWh</DataRow>
                <DataRow label="Wheeling charge">{rupees(tariff.wheelingChargePaise)}/kWh</DataRow>
                <DataRow label="Slot length">15 min</DataRow>
                <DataRow label="Mechanism" mono={false}>
                  Uniform-price double auction
                </DataRow>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                Tariff figures are illustrative for the pilot and must be re-derived against the
                state tariff order before any determination relies on them.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SlotDetail({ slot }: { slot: SettledSlot }) {
  const tariff = useTariff();
  const inside =
    slot.clearingPricePaise >= tariff.feedInTariffPaise &&
    slot.clearingPricePaise <= tariff.retailTariffPaise;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tag tone={inside ? 'up' : 'down'} dot>
          {inside ? 'Corridor compliant' : 'Corridor breach'}
        </Tag>
        <span className="font-mono text-xs tabular-nums text-ink-3">{slot.slotId}</span>
      </div>

      <dl>
        <DataRow label="Clearing price">{rupees(slot.clearingPricePaise)}/kWh</DataRow>
        <DataRow label="Matched volume">{kwh(slot.match.totalMatchedKwh)} kWh</DataRow>
        <DataRow label="Delivered">{kwh(slot.match.totalDeliveredKwh)} kWh</DataRow>
        <DataRow label="Line loss">{kwh(slot.match.totalLossKwh)} kWh</DataRow>
        <DataRow label="Average efficiency">{pct(slot.match.avgEfficiencyPct)}</DataRow>
        <DataRow label="Unmatched supply">{kwh(slot.match.unmatchedSupplyKwh)} kWh</DataRow>
        <DataRow label="Grid backfill">{kwh(slot.match.gridBackfillKwh)} kWh</DataRow>
        <DataRow label="Listings">{slot.orders.listings.length}</DataRow>
        <DataRow label="Bids">{slot.orders.bids.length}</DataRow>
        <DataRow label="Algorithm">{slot.match.algorithm}</DataRow>
      </dl>

      {slot.receipts[0]?.merkleRoot ? (
        <div>
          <p className="text-label font-semibold uppercase text-ink-3">Order-book commitment</p>
          <p className="mt-1 break-all font-mono text-xs text-ink-2">
            {slot.receipts[0].merkleRoot}
          </p>
          <p className="mt-1.5 text-xs text-ink-3">
            Merkle root of the slot&apos;s order book, committed before matching so the book cannot
            be rewritten after the fact.
          </p>
        </div>
      ) : null}

      {slot.match.pairs.length > 0 ? (
        <div>
          <p className="text-label font-semibold uppercase text-ink-3">Matched pairs</p>
          <ul className="mt-1.5 space-y-1">
            {slot.match.pairs.map((p, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-ink-2">
                  {p.sellerId} → {p.buyerId}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-ink-3">
                  {kwh(p.deliveredKwh)} kWh · {pct(p.efficiencyPct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-ink-3">
          No pair crossed in this slot. All demand was met by grid backfill.
        </p>
      )}
    </div>
  );
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
