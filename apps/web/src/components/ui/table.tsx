'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell content. Keep numbers mono + right aligned via `align`. */
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  /** Hide this column below the given breakpoint to keep phones readable. */
  hide?: 'sm' | 'md' | 'lg' | 'xl';
  sortable?: boolean;
  /** Value used when this column is the sort key. */
  sortValue?: (row: T) => number | string;
}

const HIDE: Record<NonNullable<Column<unknown>['hide']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

/**
 * The workhorse of the product. Dense rows, hairline separators, a sticky
 * header, mono numerics and a horizontal scroll region so a phone never forces
 * the page itself sideways.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty,
  sort,
  onSortChange,
  className,
  maxHeight,
  dense = false,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: ReactNode;
  sort?: { key: string; direction: 'asc' | 'desc' } | null;
  onSortChange?: (key: string) => void;
  className?: string;
  maxHeight?: number | string;
  dense?: boolean;
  caption?: string;
}) {
  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div
      className={cn('min-w-0 overflow-x-auto overflow-y-auto', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className="w-full min-w-full border-collapse text-left">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-rule/[.18]">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 text-label font-semibold uppercase text-ink-3',
                    c.align === 'right' && 'text-right',
                    c.hide && HIDE[c.hide],
                  )}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase hover:text-ink',
                        active && 'text-ink',
                      )}
                    >
                      {c.header}
                      <span aria-hidden className={cn('text-[8px]', !active && 'opacity-30')}>
                        {active && sort!.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = rowKey(row, i);
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={onRowClick ? selected : undefined}
                className={cn(
                  'border-b border-rule/[.09] last:border-b-0',
                  onRowClick && 'cursor-pointer hover:bg-sunken/70',
                  selected && 'bg-solar-wash/60 hover:bg-solar-wash/60',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'whitespace-nowrap px-3 align-middle text-sm',
                      dense ? 'py-1.5' : 'py-2.5',
                      c.align === 'right' && 'text-right',
                      c.hide && HIDE[c.hide],
                    )}
                  >
                    {c.cell(row, i)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Numeric cell. Always mono, always tabular, unit muted. */
export function Num({
  children,
  unit,
  tone,
  className,
}: {
  children: ReactNode;
  unit?: string;
  tone?: 'up' | 'down' | 'solar' | 'muted';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        tone === 'up' && 'text-up',
        tone === 'down' && 'text-down',
        tone === 'solar' && 'text-solar-deep',
        tone === 'muted' && 'text-ink-3',
        className,
      )}
    >
      {children}
      {unit ? <span className="ml-1 font-sans text-micro text-ink-3">{unit}</span> : null}
    </span>
  );
}
