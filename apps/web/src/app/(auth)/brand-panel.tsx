/**
 * The imagery half of the auth screens.
 *
 * Drawn rather than photographed. A stock rooftop photo would be the fastest
 * route to the reference's look and the wrong one: it ships an unlicensed
 * image, it cannot follow the theme, and it costs far more than the whole page.
 *
 * Colours are literal, not tokens. This panel is a picture of a dusk sky, and
 * a picture does not invert when the reader prefers dark mode — the first
 * attempt bound the ground to --ink and turned the night sky and every rooftop
 * near-white under a dark theme. Only the sun borrows the brand's solar hue,
 * which reads on both grounds.
 */
const NIGHT = '#12110e';
const ROOF = '#1b1913';
const SKY_MID = '#8a4a10';
const SKY_WARM = '#d98a1f';
const WIRE = '#f1e4cd';

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:block" style={{ background: NIGHT }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 1000"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Dusk over Sector 21: rooftop solar arrays beneath a distribution line."
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NIGHT} />
            <stop offset="46%" stopColor={SKY_MID} stopOpacity="0.6" />
            <stop offset="70%" stopColor={SKY_WARM} stopOpacity="0.85" />
            <stop offset="88%" stopColor={NIGHT} />
          </linearGradient>
        </defs>

        <rect width="800" height="1000" fill="url(#sky)" />
        <circle cx="400" cy="640" r="82" fill="#f2a63a" opacity="0.95" />

        {/* Flat Indian terraces, not pitched European roofs. */}
        <g fill={ROOF}>
          <rect x="0" y="742" width="150" height="258" />
          <rect x="150" y="786" width="118" height="214" />
          <rect x="268" y="756" width="104" height="244" />
          <rect x="372" y="800" width="136" height="200" />
          <rect x="508" y="764" width="112" height="236" />
          <rect x="620" y="806" width="180" height="194" />
        </g>

        {/* Arrays, tilted south the way they actually sit. */}
        <g stroke="#f2a63a" strokeWidth="3" opacity="0.8">
          <path d="M24 742 L128 726" />
          <path d="M172 786 L252 772" />
          <path d="M288 756 L356 744" />
          <path d="M392 800 L488 786" />
          <path d="M526 764 L604 752" />
          <path d="M644 806 L776 790" />
        </g>

        {/* The distribution line the whole product hangs off. */}
        <path d="M0 700 L800 676" stroke={WIRE} strokeWidth="2" opacity="0.45" />
        <g stroke={WIRE} strokeWidth="2.5" opacity="0.34">
          <path d="M120 694 L120 742" />
          <path d="M420 685 L420 800" />
          <path d="M700 679 L700 806" />
        </g>
      </svg>

      <div className="absolute inset-x-0 bottom-0 p-10">
        <p className="max-w-sm font-sans text-lg leading-snug" style={{ color: '#f7f4ee' }}>
          Surplus rooftop solar, traded street by street.
        </p>
        <p className="mt-2 max-w-sm font-sans text-sm" style={{ color: 'rgba(247,244,238,0.66)' }}>
          Sector 21, Gandhinagar · 12 metered premises across 4 feeders
        </p>
      </div>
    </div>
  );
}
