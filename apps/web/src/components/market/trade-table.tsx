'use client';

import type { TradeRecord } from '@sunshare/shared';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { TRADE_STATUS_COPY, tradeStatusTone } from '@/lib/domain';
import { kwh, pct, rupees, simClock } from '@/lib/format';
import { displayName } from '@/lib/seed';

/**
 * Trades as records, not cards.
 *
 * Direction is carried by a single glyph and the sign of the money column
 * rather than by two differently coloured card styles — the eye scans one
 * column instead of parsing a layout twice.
 */
export function TradeTable({
  trades,
  userId,
  onSelect,
  selectedId,
  maxHeight,
  empty,
  dense,
}: {
  trades: TradeRecord[];
  /** When given, the money column becomes signed from this user's point of view. */
  userId?: string;
  onSelect?: (t: TradeRecord) => void;
  selectedId?: string | null;
  maxHeight?: number | string;
  empty?: React.ReactNode;
  dense?: boolean;
}) {
  const columns: Column<TradeRecord>[] = [
    {
      key: 'time',
      header: 'Time',
      width: '62px',
      cell: (t) => <Num tone="muted">{simClock(t.createdAt)}</Num>,
    },
    {
      key: 'counterparty',
      header: userId ? 'Counterparty' : 'Seller → Buyer',
      cell: (t) => {
        if (!userId) {
          return (
            <span className="flex items-center gap-1.5 text-sm">
              <span className="truncate text-ink">{displayName(t.sellerId)}</span>
              <span aria-hidden className="text-ink-3">→</span>
              <span className="truncate text-ink">{displayName(t.buyerId)}</span>
            </span>
          );
        }
        const selling = t.sellerId === userId;
        return (
          <span className="flex items-center gap-2">
            <span
              className={`text-micro font-semibold uppercase ${selling ? 'text-up' : 'text-mains'}`}
              title={selling ? 'Sold' : 'Bought'}
            >
              {selling ? 'SELL' : 'BUY'}
            </span>
            <span className="truncate text-sm text-ink">
              {displayName(selling ? t.buyerId : t.sellerId)}
            </span>
          </span>
        );
      },
    },
    {
      key: 'energy',
      header: 'Energy',
      align: 'right',
      width: '84px',
      cell: (t) => <Num unit="kWh">{kwh(t.deliveredKwh)}</Num>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: '80px',
      hide: 'sm',
      cell: (t) => <Num>{rupees(t.pricePaise)}</Num>,
    },
    {
      key: 'efficiency',
      header: 'Delivered',
      align: 'right',
      width: '78px',
      hide: 'lg',
      cell: (t) => (
        <Num tone={t.efficiencyPct >= 98 ? 'muted' : 'down'}>{pct(t.efficiencyPct, 1)}</Num>
      ),
    },
    {
      key: 'value',
      header: userId ? 'Net' : 'Value',
      align: 'right',
      width: '86px',
      cell: (t) => {
        if (!userId) return <Num>{rupees(t.grossPaise)}</Num>;
        const selling = t.sellerId === userId;
        const value = selling ? t.netToSellerPaise : t.grossPaise;
        return (
          <Num tone={t.status === 'FAILED' ? 'muted' : selling ? 'up' : undefined}>
            {selling ? '+' : '−'}
            {rupees(value)}
          </Num>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      width: '92px',
      hide: 'md',
      cell: (t) => <Tag tone={tradeStatusTone(t.status)}>{TRADE_STATUS_COPY[t.status]}</Tag>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={trades}
      rowKey={(t) => t.id}
      onRowClick={onSelect}
      selectedKey={selectedId}
      maxHeight={maxHeight}
      dense={dense}
      empty={empty}
      caption="Settled and pending peer-to-peer energy trades"
    />
  );
}
