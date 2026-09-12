'use client';

import Link from 'next/link';
import type { SettlementReceipt, TariffContext, TradeRecord } from '@sunshare/shared';
import { DataRow } from '@/components/ui/metric';
import { HashValue } from '@/components/ui/hash';
import { Tag } from '@/components/ui/tag';
import { SectionLabel } from '@/components/ui/panel';
import { TRADE_STATUS_COPY, tradeStatusTone } from '@/lib/domain';
import { kgCo2, kwh, pct, rupees, simClock } from '@/lib/format';
import { feederOf, fullName, substationOf } from '@/lib/seed';

/**
 * Trade receipt.
 *
 * Reads top to bottom as the money actually moves: what was contracted, what
 * arrived after line losses, what the buyer paid, what the DISCOM kept for the
 * wires, what the seller received — then the settlement record that proves it.
 */
export function TradeReceipt({
  trade,
  receipt,
  tariff,
  userId,
  nodeIds,
}: {
  trade: TradeRecord;
  receipt: SettlementReceipt | null;
  tariff: TariffContext;
  userId?: string;
  nodeIds?: { seller: string; buyer: string };
}) {
  const buyerSaving = Math.round(
    trade.deliveredKwh * (tariff.retailTariffPaise - trade.pricePaise),
  );
  const sellerGain = Math.round(
    trade.deliveredKwh * (trade.pricePaise - tariff.wheelingChargePaise - tariff.feedInTariffPaise),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Tag tone={tradeStatusTone(trade.status)} dot>
          {TRADE_STATUS_COPY[trade.status]}
        </Tag>
        <span className="font-mono text-xs tabular-nums text-ink-3">{trade.id}</span>
      </div>

      {trade.status === 'FAILED' ? (
        <p className="border-l-2 border-down bg-down-wash/40 px-3 py-2 text-xs text-ink-2">
          Energy was delivered but the settlement transaction reverted. The obligation is carried
          into the next slot and retried; no funds have moved.
        </p>
      ) : null}

      <dl>
        <DataRow label="Seller">{fullName(trade.sellerId)}</DataRow>
        <DataRow label="Buyer">{fullName(trade.buyerId)}</DataRow>
        <DataRow label="Slot">{trade.slotId.slice(11)}</DataRow>
        <DataRow label="Timestamp">{simClock(trade.createdAt)}</DataRow>
      </dl>

      <div>
        <SectionLabel>Energy</SectionLabel>
        <dl className="mt-1.5">
          <DataRow label="Contracted">{kwh(trade.kwh)} kWh</DataRow>
          <DataRow label="Delivered">{kwh(trade.deliveredKwh)} kWh</DataRow>
          <DataRow label="Transmission loss" tone={trade.efficiencyPct >= 98 ? 'neutral' : 'warn'}>
            {kwh(trade.kwh - trade.deliveredKwh)} kWh · {pct(100 - trade.efficiencyPct)}
          </DataRow>
          {nodeIds ? (
            <DataRow label="Path">
              {feederOf(nodeIds.seller)} → {substationOf(nodeIds.seller)} → {feederOf(nodeIds.buyer)}
            </DataRow>
          ) : null}
        </dl>
      </div>

      <div>
        <SectionLabel>Settlement</SectionLabel>
        <dl className="mt-1.5">
          <DataRow label="Clearing price">{rupees(trade.pricePaise)}/kWh</DataRow>
          <DataRow label="Gross value">{rupees(trade.grossPaise)}</DataRow>
          <DataRow label="Wheeling fee">−{rupees(trade.wheelingFeePaise)}</DataRow>
          <DataRow label="Net to seller" tone="up">
            {rupees(trade.netToSellerPaise)}
          </DataRow>
          <DataRow label="Buyer saving vs retail" tone="up">
            {rupees(buyerSaving)}
          </DataRow>
          <DataRow label="Seller gain vs feed-in" tone={sellerGain > 0 ? 'up' : 'neutral'}>
            {rupees(Math.max(0, sellerGain))}
          </DataRow>
        </dl>
      </div>

      <div>
        <SectionLabel>Record</SectionLabel>
        <dl className="mt-1.5">
          {receipt ? (
            <>
              <DataRow label="Transaction">
                <HashValue value={receipt.txHash} label="transaction hash" />
              </DataRow>
              {/* Chain figures are not currency — Indian digit grouping on a
                  block height reads as a typo, so they stay ungrouped. */}
              <DataRow label="Block">{receipt.blockNumber}</DataRow>
              <DataRow label="Chain">{receipt.chainId}</DataRow>
              <DataRow label="Gas used">{receipt.gasUsed}</DataRow>
              {receipt.merkleRoot ? (
                <DataRow label="Order-book root">
                  <HashValue value={receipt.merkleRoot} lead={6} tail={4} label="merkle root" />
                </DataRow>
              ) : null}
              <DataRow label="Settled at">{simClock(receipt.settledAt)}</DataRow>
              <DataRow label="Mode">{receipt.mode}</DataRow>
            </>
          ) : (
            <p className="py-2 text-xs text-ink-3">
              Settlement has not been submitted for this trade yet.
            </p>
          )}
        </dl>
      </div>

      <div>
        <SectionLabel>Carbon</SectionLabel>
        <dl className="mt-1.5">
          <DataRow label="CO₂ avoided" tone="up">
            {kgCo2(trade.co2AvoidedKg)}
          </DataRow>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/ledger"
          className="text-xs font-medium text-ink underline decoration-rule/40 underline-offset-2 hover:decoration-ink"
        >
          Open in ledger
        </Link>
        <Link
          href="/map"
          className="text-xs font-medium text-ink underline decoration-rule/40 underline-offset-2 hover:decoration-ink"
        >
          Show matched grid path
        </Link>
      </div>
      {userId && trade.sellerId !== userId && trade.buyerId !== userId ? (
        <p className="text-xs text-ink-3">You are not a party to this trade.</p>
      ) : null}
    </div>
  );
}
