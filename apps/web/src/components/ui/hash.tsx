'use client';

import { useState } from 'react';
import { shortHash } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Transaction hashes and addresses: abbreviated, copyable, never truncated by CSS. */
export function HashValue({
  value,
  lead = 8,
  tail = 6,
  className,
  label = 'hash',
}: {
  value: string;
  lead?: number;
  tail?: number;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={value}
      aria-label={`Copy ${label} ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard blocked — the full value is already in the title attribute.
        }
      }}
      className={cn(
        'group inline-flex items-center gap-1.5 font-mono text-sm tabular-nums text-ink-2 hover:text-ink',
        className,
      )}
    >
      <span>{shortHash(value, lead, tail)}</span>
      <span
        aria-hidden
        className={cn(
          'text-micro uppercase tracking-wide',
          copied ? 'text-up' : 'text-ink-3 opacity-0 group-hover:opacity-100',
        )}
      >
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}
