import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A panel is a bordered region of the page, not a floating card. No shadow, no
 * blur, no rounded slab. Hierarchy comes from the rule, the label and the
 * density of what is inside it.
 */
export function Panel({
  className,
  children,
  as: Tag = 'section',
}: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article' | 'aside';
}) {
  return <Tag className={cn('panel flex min-w-0 flex-col', className)}>{children}</Tag>;
}

export function PanelHead({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('panel-head', className)}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="truncate text-label font-semibold uppercase text-ink-2">{title}</h2>
        {meta ? <span className="truncate text-xs text-ink-3">{meta}</span> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

export function PanelBody({
  className,
  children,
  pad = true,
}: {
  className?: string;
  children: ReactNode;
  pad?: boolean;
}) {
  return <div className={cn(pad && 'p-3.5', 'min-w-0 flex-1', className)}>{children}</div>;
}

/** Small caps label with a hairline running to the end of the column. */
export function SectionLabel({
  children,
  className,
  actions,
}: {
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <h2 className="shrink-0 text-label font-semibold uppercase text-ink-3">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-rule/[.13]" />
      {actions}
    </div>
  );
}

/** A page heading: name on the left, live context on the right. */
export function PageHead({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-rule/[.13] pb-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p> : null}
      </div>
      {aside ? <div className="flex items-center gap-4">{aside}</div> : null}
    </div>
  );
}
