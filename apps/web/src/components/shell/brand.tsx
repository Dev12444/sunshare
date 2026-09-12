/**
 * The SunShare mark, from the brand reference.
 *
 * A circle: the sun rising in the upper half, terraced fields banded across
 * the lower half with pale furrows running between them. Sun over cultivated
 * land, held in one disc — solar generation on the ground people live on.
 *
 * Drawn to the reference rather than approximated with a generic sun icon,
 * and clipped to the circle so the fields meet its edge cleanly at every size.
 * The sun keeps the brand's solar token; the fields carry the forest greens,
 * all of which hold on both the paper shell and the dark navigation rail.
 */
export function BrandMark({ size = 18 }: { size?: number }) {
  // Unique per instance so two marks on one page cannot share a clip path.
  const clipId = `ss-disc-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="24" cy="24" r="23" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Sky behind the sun stays the page, so the mark sits on any surface. */}
        <circle cx="24" cy="21" r="13.5" fill="rgb(var(--solar))" />

        {/* Terraces: three bands sweeping left to right, darkest at the front. */}
        <path
          d="M-2 27 C 10 23, 26 23, 50 28 L 50 34 C 28 29, 10 29, -2 33 Z"
          fill="rgb(var(--forest-3))"
        />
        <path
          d="M-2 33 C 10 29, 28 29, 50 34 L 50 40 C 26 35, 10 35, -2 39 Z"
          fill="rgb(var(--forest-2))"
        />
        <path
          d="M-2 39 C 10 35, 26 35, 50 40 L 50 50 L -2 50 Z"
          fill="rgb(var(--forest))"
        />

        {/* Furrows — the pale dividing lines that make it read as fields. */}
        <g stroke="rgb(var(--paper))" strokeWidth="1.4" strokeLinecap="round" opacity="0.92">
          <path d="M13 25.4 C 12 31, 11 37, 9.5 44" />
          <path d="M25 23.6 C 25 30, 25 37, 25 44" />
          <path d="M36 25 C 37 31, 38 37, 39.5 44" />
        </g>
      </g>

      <circle cx="24" cy="24" r="23" fill="none" stroke="rgb(var(--forest))" strokeOpacity="0.14" />
    </svg>
  );
}

/**
 * The wordmark is one weight and one colour in the reference — "SunShare" set
 * solid, not split into two tones. `tone="onDark"` is for the navigation rail,
 * where ink tokens would invert into the green.
 */
export function Wordmark({
  className,
  tone = 'default',
}: {
  className?: string;
  tone?: 'default' | 'onDark';
}) {
  return (
    <span
      className={[
        'font-semibold tracking-[-0.02em]',
        // Forest green is the reference's wordmark colour and works on paper,
        // but it is 1.48:1 against the dark shell — so the default tone flips
        // with the theme. onDark is for the rail, which is green either way.
        tone === 'onDark' ? 'text-forest-ink' : 'text-forest dark:text-forest-ink',
        className ?? '',
      ].join(' ')}
    >
      SunShare
    </span>
  );
}
