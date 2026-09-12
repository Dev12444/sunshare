'use client';

import { useMemo, useState } from 'react';
import type { Bid, Listing, TariffContext } from '@sunshare/shared';
import { DataTable, Num, type Column } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/states';
import { ORDER_STATUS_COPY, orderStatusTone, transmissionLossPct } from '@/lib/domain';
import { km, kwh, pct, rupees } from '@/lib/format';
import { NODE_BY_ID, displayName, feederOf } from '@/lib/seed';
import { hopTier, pathBetween, pathLengthKm } from '@/lib/mock/grid-path';
import { cn } from '@/lib/utils';

export interface BookRow {
  id: string;
  side: 'SELL' | 'BUY';
  counterpartyId: string;
  nodeId: string;
  kwh: number;
  pricePaise: number;
  status: Listing['status'];
  distanceKm: number;
  lossPct: number;
  feeder: string;
  isMine: boolean;
  byBroker: boolean;
  source: Listing | Bid;
}

/** Distance and loss are always measured from the viewer's own connection. */
export function toRows(
  listings: Listing[],
  bids: Bid[],
  viewerNodeId: string | null,
  viewerId: string,
): BookRow[] {
  const origin = viewerNodeId && NODE_BY_ID.has(viewerNodeId) ? viewerNodeId : 'SS-1';

  const measure = (nodeId: string) => {
    const path = pathBetween(origin, nodeId);
    const distanceKm = pathLengthKm(path);
    return { distanceKm, lossPct: transmissionLossPct(hopTier(origin, nodeId), distanceKm) };
  };

  return [
    ...listings.map<BookRow>((l) => ({
      id: l.id,
      side: 'SELL',
      counterpartyId: l.sellerId,
      nodeId: l.nodeId,
      kwh: l.kwh,
      pricePaise: l.askPricePaise,
      status: l.status,
      ...measure(l.nodeId),
      feeder: feederOf(l.nodeId),
      isMine: l.sellerId === viewerId,
      byBroker: Boolean(l.brokerPolicyId),
      source: l,
    })),
    ...bids.map<BookRow>((b) => ({
      id: b.id,
      side: 'BUY',
      counterpartyId: b.buyerId,
      nodeId: b.nodeId,
      kwh: b.kwh,
      pricePaise: b.maxPricePaise,
      status: b.status,
      ...measure(b.nodeId),
      feeder: feederOf(b.nodeId),
      isMine: b.buyerId === viewerId,
      byBroker: false,
      source: b,
    })),
  ];
}

export type SortKey = 'price' | 'kwh' | 'distance' | 'loss';

/**
 * One side of the book.
 *
 * Asks ascend and bids descend, both away from the clearing price, so the
 * orders nearest to trading sit nearest the middle of the screen. Rows that
 * would clear at the current price carry a left rule; rows that would not are
 * dimmed. That single distinction is what makes a book readable at a glance.
 */
export function OrderBookSide({
  side,
  rows,
  tariff,
  clearingPricePaise,
  onSelect,
  selectedId,
  maxHeight,
  sort,
  onSortChange,
}: {
  side: 'SELL' | 'BUY';
  rows: BookRow[];
  tariff: TariffContext;
  clearingPricePaise: number | null;
  onSelect?: (row: BookRow) => void;
  selectedId?: string | null;
  maxHeight?: number;
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
  onSortChange?: (key: string) => void;
}) {
  const wouldClear = (r: BookRow) =>
    clearingPricePaise == null
      ? false
      : side === 'SELL'
        ? r.pricePaise <= clearingPricePaise
        : r.pricePaise >= clearingPricePaise;

  const columns: Column<BookRow>[] = [
    {
      key: 'price',
      header: side === 'SELL' ? 'Ask' : 'Bid',
      align: 'right',
      width: '78px',
      sortable: true,
      sortValue: (r) => r.pricePaise,
      cell: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          <Num tone={wouldClear(r) ? undefined : 'muted'}>{rupees(r.pricePaise)}</Num>
        </span>
      ),
    },
    {
      key: 'kwh',
      header: 'kWh',
      align: 'right',
      width: '62px',
      sortable: true,
      sortValue: (r) => r.kwh,
      cell: (r) => <Num tone={wouldClear(r) ? undefined : 'muted'}>{kwh(r.kwh)}</Num>,
    },
    {
      key: 'party',
      header: side === 'SELL' ? 'Seller' : 'Buyer',
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate text-sm', r.isMine ? 'font-medium text-ink' : 'text-ink-2')}>
            {r.isMine ? 'You' : displayName(r.counterpartyId)}
          </span>
          {r.byBroker ? (
            <span className="shrink-0 text-micro uppercase text-ink-3" title="Placed by your broker">
              brk
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'distance',
      header: 'Dist',
      align: 'right',
      width: '66px',
      hide: 'xl',
      sortable: true,
      sortValue: (r) => r.distanceKm,
      cell: (r) => <Num tone="muted">{km(r.distanceKm)}</Num>,
    },
    {
      key: 'loss',
      header: 'Loss',
      align: 'right',
      width: '58px',
      hide: 'xl',
      sortable: true,
      sortValue: (r) => r.lossPct,
      cell: (r) => (
        <Num tone={r.lossPct > 2.5 ? 'down' : 'muted'}>{pct(r.lossPct, 1)}</Num>
      ),
    },
    {
      key: 'status',
      header: 'State',
      align: 'right',
      width: '84px',
      hide: 'sm',
      cell: (r) =>
        wouldClear(r) ? (
          <Tag tone="up">Matching</Tag>
        ) : r.status === 'OPEN' ? (
          <Tag tone="neutral">{side === 'SELL' ? 'Above price' : 'Below price'}</Tag>
        ) : (
          <Tag tone={orderStatusTone(r.status)}>{ORDER_STATUS_COPY[r.status]}</Tag>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={onSelect}
      selectedKey={selectedId}
      maxHeight={maxHeight}
      sort={sort}
      onSortChange={onSortChange}
      dense
      caption={side === 'SELL' ? 'Sell listings' : 'Buy bids'}
      empty={
        <EmptyState title={side === 'SELL' ? 'No sell listings' : 'No buy bids'}>
          {side === 'SELL'
            ? 'No surplus is being offered in this slot. Unmatched demand is covered by grid backfill at the retail tariff.'
            : 'Nobody is bidding in this slot. Unsold surplus is exported at the feed-in tariff.'}
        </EmptyState>
      }
    />
  );
}

/** Sorting shared by both sides so the two tables stay comparable. */
export function useBookSort(defaultKey: SortKey = 'price') {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: defaultKey,
    direction: 'asc',
  });

  const apply = useMemo(
    () => (rows: BookRow[], side: 'SELL' | 'BUY') => {
      const value = (r: BookRow) =>
        sort.key === 'price'
          ? r.pricePaise
          : sort.key === 'kwh'
            ? r.kwh
            : sort.key === 'distance'
              ? r.distanceKm
              : r.lossPct;
      const natural = sort.key === 'price' && side === 'BUY' ? -1 : 1;
      const factor = (sort.direction === 'asc' ? 1 : -1) * natural;
      return [...rows].sort((a, b) => (value(a) - value(b)) * factor);
    },
    [sort],
  );

  return {
    sort,
    apply,
    onSortChange: (key: string) =>
      setSort((s) =>
        s.key === key
          ? { key: s.key, direction: s.direction === 'asc' ? 'desc' : 'asc' }
          : { key: key as SortKey, direction: 'asc' },
      ),
  };
}
