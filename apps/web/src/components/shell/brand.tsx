/**
 * The SunShare mark: a sun sitting on a distribution line, with the line
 * continuing past it. Solar above the wire, the wire carrying on to the
 * neighbours — the whole product in one 18px glyph.
 */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 3.6a4.2 4.2 0 014.2 4.2H4.8A4.2 4.2 0 019 3.6z"
        fill="rgb(var(--solar))"
      />
      <path d="M1.5 7.8h15" stroke="rgb(var(--ink))" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M4.6 10.1v3.4M9 10.1v4.4M13.4 10.1v3.4"
        stroke="rgb(var(--ink))"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.42"
      />
      <path d="M9 1v1.5M3.4 3l1.1 1.1M14.6 3l-1.1 1.1" stroke="rgb(var(--solar))" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold tracking-[-0.01em] text-ink">Sun</span>
      <span className="font-normal tracking-[-0.01em] text-ink-2">Share</span>
    </span>
  );
}
