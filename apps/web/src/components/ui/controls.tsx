'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- button */

type Variant = 'primary' | 'default' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-ink text-paper border-ink hover:bg-ink/90 disabled:bg-ink/40 disabled:border-transparent',
  default: 'bg-surface text-ink border-rule/25 hover:bg-sunken disabled:text-ink-3',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-down border-down/40 hover:bg-down-wash',
};

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8.5 px-3 text-sm gap-2',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm border font-medium',
        'transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' && 'h-[34px]',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- segmented */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: Size;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-stretch rounded-sm border border-rule/25 bg-surface',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative -ml-px first:ml-0 border-l border-rule/[.13] first:border-l-0',
              'px-2.5 font-medium transition-colors duration-120',
              size === 'sm' ? 'h-7 text-xs' : 'h-[34px] text-sm',
              active ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- input */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-label font-semibold uppercase text-ink-3"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-down">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  prefix,
  suffix,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }) {
  return (
    <div
      className={cn(
        'flex h-[34px] items-center rounded-sm border border-rule/25 bg-surface',
        'focus-within:border-solar focus-within:ring-1 focus-within:ring-solar/40',
        className,
      )}
    >
      {prefix ? (
        <span className="pl-2.5 font-mono text-sm text-ink-3">{prefix}</span>
      ) : null}
      <input
        className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-ink-3"
        {...props}
      />
      {suffix ? (
        <span className="pr-2.5 text-xs font-medium text-ink-3">{suffix}</span>
      ) : null}
    </div>
  );
}

export function Select({
  className,
  children,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cn(
        'h-[34px] w-full rounded-sm border border-rule/25 bg-surface px-2 text-sm text-ink outline-none',
        'focus:border-solar focus:ring-1 focus:ring-solar/40',
        className,
      )}
      {...(props as object)}
    >
      {children}
    </select>
  );
}

/* --------------------------------------------------------------- toggle */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-ink-3">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-120',
          checked ? 'border-ink bg-ink' : 'border-rule/30 bg-sunken',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-3 w-3 rounded-full transition-all duration-120',
            checked ? 'left-[15px] bg-paper' : 'left-[2px] bg-ink-3',
          )}
        />
      </span>
    </button>
  );
}
