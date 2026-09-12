'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Contextual inspector.
 *
 * On a wide screen it is a column beside the thing it describes, so the map or
 * the table stays visible while you read it. Below `lg` the same markup becomes
 * a bottom sheet, because a 380px side panel on a 390px phone is a modal that
 * pretends it is not one.
 */
export function Inspector({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close inspector"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-ink/25 lg:hidden"
      />
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={typeof title === 'string' ? title : 'Inspector'}
        className={cn(
          'panel z-40 flex flex-col',
          // phone: bottom sheet
          'fixed inset-x-0 bottom-0 max-h-[78dvh] rounded-t-[4px] border-b-0',
          // desktop: a column in the layout
          'lg:static lg:max-h-none lg:rounded-none lg:border-b',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule/[.13] px-3.5 py-2.5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-label font-semibold uppercase text-ink-3">{eyebrow}</div>
            ) : null}
            <div className="mt-0.5 truncate text-md font-semibold text-ink">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-sm px-1.5 py-0.5 text-ink-3 hover:bg-sunken hover:text-ink"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">{children}</div>
        {footer ? (
          <footer className="border-t border-rule/[.13] px-3.5 py-2.5">{footer}</footer>
        ) : null}
      </aside>
    </>
  );
}
