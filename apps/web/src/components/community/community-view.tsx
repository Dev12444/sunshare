'use client';

import { useMemo, useState } from 'react';
import type { CommunityDonation } from '@sunshare/shared';
import { Button, Field, Input, Toggle } from '@/components/ui/controls';
import { DataRow, Metric, MetricCell, MetricRow } from '@/components/ui/metric';
import { PageHead, Panel, PanelBody, PanelHead, SectionLabel } from '@/components/ui/panel';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { MeterBar, Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/states';
import { kwh, rupees, simClock } from '@/lib/format';
import {
  BENEFICIARIES,
  BENEFICIARY_KIND_LABEL,
  NODE_BY_ID,
  displayName,
  feederOf,
} from '@/lib/seed';
import { allDonations, logActivity, setState, useStore } from '@/lib/store';
import { refreshDerived } from '@/lib/transport';
import { useMyReading } from '@/hooks/use-derived';

/**
 * Month-to-date allocations carried in from before the simulated day.
 *
 * The pool did not start this morning — a page that showed only today would
 * make a standing programme look like a demo. These are the recorded totals
 * for September to date, and today's allocations are added on top.
 */
const MONTH_TO_DATE_KWH: Record<string, number> = {
  'B-01': 148.6,
  'B-02': 96.2,
  'B-03': 61.4,
  'B-04': 39.8,
};

/** Households already enrolled in the pool before this session. */
const STANDING_DONORS: Record<string, number> = {
  'U-02': 4,
  'U-04': 8,
  'U-07': 3,
  'U-08': 6,
  'U-11': 10,
};

/**
 * Community pool.
 *
 * The point of this page is that an allocation is a real transfer with a named
 * recipient, a verifying authority and a settled record — not a badge. So the
 * beneficiaries are a register with verification status, and the donor list is
 * a ledger, not a scoreboard with trophies.
 */
export function CommunityView() {
  const history = useStore((s) => s.history);
  const user = useStore((s) => s.user);
  const role = useStore((s) => s.role);
  const donation = useStore((s) => s.donation);
  const policy = useStore((s) => s.policy);

  const reading = useMyReading();
  const donations = useMemo(() => allDonations({ history }), [history]);

  const [pct, setPct] = useState(String(donation.donationPct));
  const [threshold, setThreshold] = useState(String(donation.dailyThresholdKwh));
  const [enrolled, setEnrolled] = useState(false);

  const byBeneficiary = useMemo(() => {
    const map = new Map<string, { today: number; value: number; last: string | null }>();
    for (const b of BENEFICIARIES) map.set(b.id, { today: 0, value: 0, last: null });
    for (const d of donations) {
      const entry = map.get(d.beneficiaryId);
      if (!entry) continue;
      entry.today += d.kwh;
      entry.value += d.valuePaise;
      entry.last = d.createdAt;
    }
    return map;
  }, [donations]);

  const donors = useMemo(() => {
    const map = new Map<string, { kwh: number; value: number; count: number }>();
    for (const d of donations) {
      const entry = map.get(d.donorId) ?? { kwh: 0, value: 0, count: 0 };
      entry.kwh += d.kwh;
      entry.value += d.valuePaise;
      entry.count += 1;
      map.set(d.donorId, entry);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.kwh - a.kwh);
  }, [donations]);

  const todayKwh = donations.reduce((s, d) => s + d.kwh, 0);
  const todayValue = donations.reduce((s, d) => s + d.valuePaise, 0);
  const monthKwh =
    Object.values(MONTH_TO_DATE_KWH).reduce((s, v) => s + v, 0) + todayKwh;
  const donorCount = new Set([...donors.map((d) => d.id), ...Object.keys(STANDING_DONORS)]).size;

  const canConfigure = role === 'PROSUMER';
  const currentPct = policy?.communityDonationPct ?? donation.donationPct;
  const dayGeneration = reading?.dayGenerationKwh ?? 0;
  const thresholdMet = dayGeneration >= donation.dailyThresholdKwh;

  const donationColumns: Column<CommunityDonation>[] = [
    {
      key: 'time',
      header: 'Time',
      width: '62px',
      cell: (d) => <Num tone="muted">{simClock(d.createdAt)}</Num>,
    },
    {
      key: 'donor',
      header: 'Donor',
      cell: (d) => (
        <span className="text-sm text-ink">
          {d.donorId === user.id ? 'You' : displayName(d.donorId)}
        </span>
      ),
    },
    {
      key: 'beneficiary',
      header: 'Beneficiary',
      hide: 'sm',
      cell: (d) => <span className="truncate text-sm text-ink-2">{d.beneficiaryName}</span>,
    },
    {
      key: 'kwh',
      header: 'Energy',
      align: 'right',
      width: '84px',
      cell: (d) => <Num unit="kWh">{kwh(d.kwh)}</Num>,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      width: '78px',
      hide: 'md',
      cell: (d) => <Num tone="muted">{rupees(d.valuePaise)}</Num>,
    },
    {
      key: 'slot',
      header: 'Slot',
      align: 'right',
      width: '62px',
      hide: 'lg',
      cell: (d) => <Num tone="muted">{d.slotId.slice(11)}</Num>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHead
        title="Community Pool"
        subtitle="A configured share of each cleared sale is routed to verified local beneficiaries"
        aside={
          <span className="text-xs text-ink-3">
            <span className="font-mono tabular-nums text-ink-2">{BENEFICIARIES.length}</span>{' '}
            verified beneficiaries · September
          </span>
        }
      />

      <Panel>
        <MetricRow>
          <MetricCell>
            <Metric
              label="Allocated today"
              value={kwh(todayKwh)}
              unit="kWh"
              tone="solar"
              flash={todayKwh}
              hint={`${rupees(todayValue)} at clearing prices`}
            />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Month to date"
              value={kwh(monthKwh)}
              unit="kWh"
              hint="1–12 September"
            />
          </MetricCell>
          <MetricCell>
            <Metric label="Donors" value={String(donorCount)} unit="households" hint="Enrolled in the pool" />
          </MetricCell>
          <MetricCell>
            <Metric
              label="Allocations today"
              value={String(donations.length)}
              hint="One per cleared sale with a share configured"
            />
          </MetricCell>
        </MetricRow>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Beneficiaries" meta="Register" />
            <ul className="hair-y">
              {BENEFICIARIES.map((b) => {
                const stats = byBeneficiary.get(b.id);
                const month = (MONTH_TO_DATE_KWH[b.id] ?? 0) + (stats?.today ?? 0);
                const node = NODE_BY_ID.get(b.nodeId);
                const share = monthKwh > 0 ? month / monthKwh : 0;
                return (
                  <li key={b.id} className="px-3.5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-md font-medium text-ink">{b.name}</span>
                          <Tag tone="up" dot>
                            Verified
                          </Tag>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-3">
                          {BENEFICIARY_KIND_LABEL[b.kind]} · {node?.name ?? b.nodeId} ·{' '}
                          {feederOf(b.nodeId)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-md tabular-nums text-ink">
                          {kwh(month)}
                          <span className="ml-1 font-sans text-xs text-ink-3">kWh</span>
                        </div>
                        <div className="text-xs text-ink-3">
                          {stats && stats.today > 0 ? `+${kwh(stats.today)} today` : 'none today'}
                        </div>
                      </div>
                    </div>
                    <MeterBar value={share} tone="solar" className="mt-2" ariaLabel="Share of pool" />
                    <p className="mt-1.5 text-xs text-ink-3">
                      Verified by {b.verifiedBy} on {b.verifiedAt.slice(8, 10)}/
                      {b.verifiedAt.slice(5, 7)} · wallet{' '}
                      <span className="font-mono">{b.walletAddress.slice(0, 8)}…</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHead title="Allocations today" meta={`${donations.length} transfers`} />
            <DataTable
              columns={donationColumns}
              rows={donations.slice(0, 40)}
              rowKey={(d) => d.id}
              dense
              maxHeight={300}
              caption="Community pool allocations"
              empty={
                <EmptyState title="No allocations yet today">
                  Allocations are created when a sale clears for a household that has configured a
                  share. Nothing has cleared with a share set today.
                </EmptyState>
              }
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelHead title="Your contribution" />
            {canConfigure ? (
              <PanelBody className="space-y-3.5">
                <Toggle
                  checked={enrolled || currentPct > 0}
                  onChange={(v) => {
                    setEnrolled(v);
                    const next = v ? Number(pct) || 5 : 0;
                    setState({
                      donation: { donationPct: next, dailyThresholdKwh: Number(threshold) || 0 },
                    });
                    refreshDerived();
                  }}
                  label="Route a share to the pool"
                  description="Applied to each of your sales after it clears"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Share"
                    htmlFor="donation-pct"
                    hint="Of each cleared sale"
                  >
                    <Input
                      id="donation-pct"
                      inputMode="decimal"
                      value={pct}
                      onChange={(e) => setPct(e.target.value)}
                      suffix="%"
                    />
                  </Field>
                  <Field
                    label="Daily threshold"
                    htmlFor="donation-threshold"
                    hint="Donate only past this"
                  >
                    <Input
                      id="donation-threshold"
                      inputMode="decimal"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      suffix="kWh"
                    />
                  </Field>
                </div>

                <dl>
                  <DataRow label="Generated today">{kwh(dayGeneration)} kWh</DataRow>
                  <DataRow label="Threshold" tone={thresholdMet ? 'up' : 'neutral'}>
                    {thresholdMet ? 'met' : `${kwh(Math.max(0, donation.dailyThresholdKwh - dayGeneration))} kWh to go`}
                  </DataRow>
                  <DataRow label="Allocated today" tone="solar">
                    {kwh(donations.filter((d) => d.donorId === user.id).reduce((s, d) => s + d.kwh, 0))} kWh
                  </DataRow>
                </dl>

                <Button
                  variant="primary"
                  onClick={() => {
                    const next = {
                      donationPct: Math.max(0, Math.min(100, Number(pct) || 0)),
                      dailyThresholdKwh: Math.max(0, Number(threshold) || 0),
                    };
                    setState({ donation: next });
                    logActivity({
                      tsSim: '',
                      channel: 'community',
                      text: `Community share set to ${next.donationPct}% above ${next.dailyThresholdKwh} kWh of daily generation.`,
                    });
                    refreshDerived();
                  }}
                >
                  Save allocation rule
                </Button>

                <p className="text-xs leading-relaxed text-ink-3">
                  The share comes out of energy you have already sold, at the price it cleared at.
                  It never changes what a buyer pays and never pushes a trade outside the corridor.
                </p>
              </PanelBody>
            ) : (
              <EmptyState title="Prosumer setting">
                Allocation rules are configured by households that sell surplus. Switch to the
                prosumer role to set a share.
              </EmptyState>
            )}
          </Panel>

          <Panel>
            <PanelHead title="Donors" meta="Today, by energy" />
            {donors.length === 0 ? (
              <EmptyState title="No allocations today">
                Standing donors:{' '}
                {Object.keys(STANDING_DONORS)
                  .map((id) => displayName(id))
                  .join(', ')}
                .
              </EmptyState>
            ) : (
              <ol className="hair-y">
                {donors.slice(0, 8).map((d, i) => (
                  <li
                    key={d.id}
                    className="flex items-baseline gap-3 px-3.5 py-2"
                  >
                    <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-ink-3">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {d.id === user.id ? 'You' : displayName(d.id)}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
                      {kwh(d.kwh)}
                      <span className="ml-1 font-sans text-micro text-ink-3">kWh</span>
                    </span>
                    <span className="hidden w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink-3 sm:block">
                      {rupees(d.value)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHead title="How allocation works" />
            <PanelBody>
              <SectionLabel>Order of operations</SectionLabel>
              <ol className="mt-2 space-y-2 text-xs leading-relaxed text-ink-2">
                <li>
                  <span className="font-mono text-ink-3">1</span> A sale clears at the uniform
                  price and the wheeling charge is deducted.
                </li>
                <li>
                  <span className="font-mono text-ink-3">2</span> The configured share of the
                  delivered energy is transferred to the next beneficiary in the rotation.
                </li>
                <li>
                  <span className="font-mono text-ink-3">3</span> The transfer settles on the same
                  slot commitment as the trade, so it appears in the ledger with its own hash.
                </li>
              </ol>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
