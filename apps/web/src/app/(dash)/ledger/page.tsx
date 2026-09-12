'use client';

/**
 * Trade Ledger — Diya, H16–H18.
 * A settlement explorer, not a crypto explorer: every row is an energy trade
 * with a wheeling fee and a CO2 line, not a speculative asset.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SettlementReceipt, TradeRecord } from '@sunshare/shared';
import { paiseToRupees } from '@sunshare/shared';
import { useActivity } from '@/hooks/use-activity';
import { LifecycleRail } from '@/components/lifecycle-rail';

type Row = { trade: TradeRecord; receipt: SettlementReceipt | null };

function statusOf(row: Row): 'MATCHED' | 'SETTLEMENT PENDING' | 'SETTLEMENT VERIFIED' {
  if (row.receipt) return 'SETTLEMENT VERIFIED';
  if (row.trade.status === 'MATCHED' || row.trade.status === 'COMMITTED') return 'MATCHED';
  return 'SETTLEMENT PENDING';
}

export default function LedgerPage() {
  const { events, connected } = useActivity();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const trades = new Map<string, TradeRecord>();
    const receipts = new Map<string, SettlementReceipt>();
    for (const e of events) {
      if (e.type === 'trade') trades.set(e.data.id, e.data);
      if (e.type === 'settlement') receipts.set(e.data.tradeId, e.data);
    }
    return [...trades.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((trade) => ({ trade, receipt: receipts.get(trade.id) ?? null }));
  }, [events]);

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.trade.id.toLowerCase().includes(q) ||
      r.trade.sellerId.toLowerCase().includes(q) ||
      r.trade.buyerId.toLowerCase().includes(q)
    );
  });

  const selectedRow = rows.find((r) => r.trade.id === selected) ?? null;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Energy Ledger</h1>
        <LifecycleRail current="SETTLE" className="hidden sm:flex" />
      </div>

      {!connected && rows.length === 0 && (
        <div className="chip-neutral">Loading settlement history…</div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search trade ID, seller, buyer…"
          className="w-full max-w-xs rounded border border-black/10 bg-transparent px-3 py-1.5
                     text-sm outline-none focus-visible:ring-2 focus-visible:ring-sun-500 dark:border-white/10"
          aria-label="Search trades"
        />
        <span className="text-xs text-grid-400">{filtered.length} trades</span>
      </div>

      <div className="tile overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-grid-400">
            No settled trades yet — the ledger fills in as the market clears.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="divider-row text-[11px] uppercase tracking-wide text-grid-400">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Trade</th>
                <th className="px-3 py-2 font-medium">Energy</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Fee</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.trade.id}
                  onClick={() => setSelected(r.trade.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(r.trade.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View trade ${r.trade.id} details`}
                  className="divider-row cursor-pointer hover:bg-sun-500/5 focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-sun-500 focus-visible:ring-inset"
                >
                  <td className="figure px-3 py-2 text-xs text-grid-400">
                    {new Date(r.trade.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="figure px-3 py-2">{r.trade.id}</td>
                  <td className="figure px-3 py-2">{r.trade.kwh.toFixed(2)} kWh</td>
                  <td className="figure px-3 py-2">{paiseToRupees(r.trade.pricePaise)}</td>
                  <td className="figure px-3 py-2">{paiseToRupees(r.trade.wheelingFeePaise)}</td>
                  <td className="px-3 py-2">
                    <span className={statusOf(r) === 'SETTLEMENT VERIFIED' ? 'chip-live' : 'chip-stale'}>
                      {statusOf(r)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedRow && (
        <TradeDrawer row={selectedRow} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function TradeDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const { trade, receipt } = row;
  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <button
        aria-label="Close trade detail"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="tile relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-b-none sm:max-w-md sm:rounded-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="figure text-sm font-semibold">{trade.id}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-2 text-grid-400 hover:text-grid-900 focus-visible:ring-2
                       focus-visible:ring-sun-500 dark:hover:text-white"
          >
            ✕
          </button>
        </div>
        <dl className="space-y-1.5 text-sm">
          <DetailRow label="Seller" value={trade.sellerId} />
          <DetailRow label="Buyer" value={trade.buyerId} />
          <DetailRow label="Energy contracted" value={`${trade.kwh.toFixed(2)} kWh`} />
          <DetailRow label="Energy delivered" value={`${trade.deliveredKwh.toFixed(3)} kWh`} />
          <DetailRow label="Efficiency" value={`${trade.efficiencyPct.toFixed(1)}%`} />
          <DetailRow label="Clearing price" value={paiseToRupees(trade.pricePaise) + '/kWh'} />
          <DetailRow label="Gross amount" value={paiseToRupees(trade.grossPaise)} />
          <DetailRow label="Wheeling fee" value={paiseToRupees(trade.wheelingFeePaise)} />
          <DetailRow label="Net to seller" value={paiseToRupees(trade.netToSellerPaise)} />
          <DetailRow label="CO₂ avoided" value={`${trade.co2AvoidedKg.toFixed(3)} kg`} />
          <DetailRow label="Status" value={statusOf(row)} />
        </dl>
        <div className="mt-3 border-t border-black/5 pt-3 text-sm dark:border-white/5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-grid-400">Settlement</h3>
          {receipt ? (
            <dl className="space-y-1.5">
              <DetailRow label="Mode" value={receipt.mode.toUpperCase()} />
              <DetailRow label="Tx hash" value={receipt.txHash} mono />
              <DetailRow label="Block" value={String(receipt.blockNumber)} />
              <DetailRow
                label="Settled at"
                value={new Date(receipt.settledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              />
              {receipt.mode !== 'onchain' && (
                <p className="pt-1 text-xs text-grid-400">
                  Simulated settlement ledger — not an on-chain confirmation.
                </p>
              )}
            </dl>
          ) : (
            <p className="text-xs text-grid-400">Settlement pending.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-grid-400">{label}</dt>
      <dd className={mono ? 'figure max-w-[60%] truncate text-xs' : 'figure'}>{value}</dd>
    </div>
  );
}
