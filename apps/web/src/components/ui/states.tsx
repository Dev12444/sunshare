'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './controls';

/**
 * Empty states carry a fact and an action. "No data yet" tells the user
 * nothing they did not already know from looking at the screen.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-8 text-center', className)}>
      <p className="text-label font-semibold uppercase text-ink-3">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-[42ch] text-sm text-ink-2">{children}</div>
      ) : null}
      {action ? <div className="mt-3.5 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Errors name the service and say what is on screen instead. Every error that
 * can be retried offers the retry next to the sentence, not in a banner
 * somewhere else.
 */
export function ErrorState({
  title = 'Service unavailable',
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-down bg-down-wash/40 px-3.5 py-2.5', className)}
    >
      <span className="text-label font-semibold uppercase text-down">{title}</span>
      <span className="min-w-0 flex-1 text-sm text-ink-2">{detail}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('relative block overflow-hidden bg-sunken', className)}
    >
      <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-ink/[.06] to-transparent" />
    </span>
  );
}

/** Placeholder for a metric block while the first tick is in flight. */
export function MetricSkeleton({ label }: { label: string }) {
  return (
    <div className="px-3.5 py-3">
      <div className="text-label font-semibold uppercase text-ink-3">{label}</div>
      <Skeleton className="mt-2 h-5 w-20" />
    </div>
  );
}

/** Data is on screen but older than it should be. */
export function StaleNote({ asOf, className }: { asOf: string; className?: string }) {
  return (
    <p className={cn('text-xs text-ink-3', className)}>
      Showing market data from <span className="font-mono tabular-nums text-ink-2">{asOf}</span>
    </p>
  );
}
