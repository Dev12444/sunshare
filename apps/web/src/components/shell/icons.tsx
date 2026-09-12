/**
 * A small set of hand-drawn glyphs.
 *
 * Drawn rather than imported because a nav rail of generic library icons is
 * one of the fastest ways to make a product look like every other dashboard.
 * These read as electrical single-line diagram symbols: a meter, a bus, a
 * radial feeder, a distribution tree. All are 14×14 on a 1.3px stroke.
 */
type P = { className?: string; size?: number };

function Svg({ className, size = 14, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Rooftop + sun: the prosumer's own premises. */
export const IconPremises = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 6.6L7 2.2l5.5 4.4" />
    <path d="M3 6.4v5.4h8V6.4" />
    <path d="M5.4 11.8V8.6h3.2v3.2" />
  </Svg>
);

/** Load curve: the consumer's demand shape. */
export const IconDemand = (p: P) => (
  <Svg {...p}>
    <path d="M1 11.2h12" />
    <path d="M1.6 9.4c1.4 0 1.7-4.6 3.1-4.6s1.5 3.2 2.6 3.2 1.4-5.4 2.7-5.4 1.4 4.2 2.4 4.2" />
  </Svg>
);

/** Order book: bids and asks meeting. */
export const IconMarket = (p: P) => (
  <Svg {...p}>
    <path d="M1.4 2.6h5.2M1.4 5.4h3.4M1.4 8.2h5.2M1.4 11h2.6" />
    <path d="M9 2.4v9.2M9 2.4l2.6 2.6M9 2.4L6.6 5" />
  </Svg>
);

/** Located node on a feeder. */
export const IconMap = (p: P) => (
  <Svg {...p}>
    <path d="M7 12.4s4-3.7 4-6.4a4 4 0 10-8 0c0 2.7 4 6.4 4 6.4z" />
    <circle cx="7" cy="5.9" r="1.35" />
  </Svg>
);

/** Radial distribution tree. */
export const IconGrid = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="2.4" r="1.3" />
    <circle cx="2.6" cy="11.4" r="1.3" />
    <circle cx="7" cy="11.4" r="1.3" />
    <circle cx="11.4" cy="11.4" r="1.3" />
    <path d="M7 3.7v3.1M7 6.8h-4.4v3.3M7 6.8v3.3M7 6.8h4.4v3.3" />
  </Svg>
);

/** Policy in, order out. */
export const IconBroker = (p: P) => (
  <Svg {...p}>
    <rect x="1.6" y="4.2" width="10.8" height="7" rx="0.6" />
    <path d="M4.4 4.2V2.6h5.2v1.6" />
    <path d="M4.4 7.6h2.1M4.4 9.4h4.6" />
  </Svg>
);

/** Avoided emissions. */
export const IconImpact = (p: P) => (
  <Svg {...p}>
    <path d="M7 12.4V6.2" />
    <path d="M7 6.2C7 3.6 9 1.8 12.2 1.8c0 3.2-1.9 5.1-5.2 4.4z" />
    <path d="M6.9 8.4C6.9 6.7 5.5 5.4 3.2 5.4c0 2.3 1.4 3.6 3.7 3z" />
  </Svg>
);

/** Shared allocation. */
export const IconCommunity = (p: P) => (
  <Svg {...p}>
    <circle cx="4.4" cy="4.6" r="1.7" />
    <circle cx="9.8" cy="4.6" r="1.7" />
    <path d="M1.6 11.6c0-1.9 1.3-3 2.8-3s2.8 1.1 2.8 3" />
    <path d="M7.2 11.6c0-1.9 1.2-3 2.6-3s2.6 1.1 2.6 3" />
  </Svg>
);

/** Settled records. */
export const IconLedger = (p: P) => (
  <Svg {...p}>
    <rect x="2.4" y="1.8" width="9.2" height="10.4" rx="0.6" />
    <path d="M4.8 4.6h4.4M4.8 7h4.4M4.8 9.4h2.6" />
  </Svg>
);

/** Utility operations. */
export const IconNetwork = (p: P) => (
  <Svg {...p}>
    <path d="M3.4 12.2V4.4L7 1.8l3.6 2.6v7.8" />
    <path d="M1.6 12.2h10.8" />
    <path d="M5.4 12.2V8.6h3.2v3.6" />
    <path d="M3.4 6.4h7.2" />
  </Svg>
);

/** Oversight. */
export const IconOversight = (p: P) => (
  <Svg {...p}>
    <path d="M7 2.2l4.6 1.8v3.2c0 2.6-1.9 4.4-4.6 5.2-2.7-.8-4.6-2.6-4.6-5.2V4z" />
    <path d="M5.2 7.2l1.4 1.4 2.6-2.8" />
  </Svg>
);

export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M3.6 6.2a3.4 3.4 0 016.8 0c0 2.6.9 3.6.9 3.6H2.7s.9-1 .9-3.6z" />
    <path d="M5.9 11.6a1.3 1.3 0 002.2 0" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M4.4 2.6l6.6 4.4-6.6 4.4z" fill="currentColor" strokeWidth="1" />
  </Svg>
);

export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M5 3v8M9 3v8" strokeWidth="1.6" />
  </Svg>
);

export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M12 7a5 5 0 11-1.6-3.7" />
    <path d="M12.4 1.8v2.9H9.5" />
  </Svg>
);

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M5 3l4 4-4 4" />
  </Svg>
);

export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M1.8 3.4h10.4M1.8 7h10.4M1.8 10.6h10.4" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="2.6" />
    <path d="M7 1.4v1.3M7 11.3v1.3M1.4 7h1.3M11.3 7h1.3M3 3l.9.9M10.1 10.1l.9.9M11 3l-.9.9M3.9 10.1l-.9.9" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M11.6 8.4A5 5 0 015.6 2.4a5 5 0 106 6z" />
  </Svg>
);

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M7 1.8v7.4M4.2 6.6L7 9.4l2.8-2.8" />
    <path d="M2 11.6h10" />
  </Svg>
);

export const IconFilter = (p: P) => (
  <Svg {...p}>
    <path d="M1.8 3h10.4L8.2 7.6v4L5.8 12.4V7.6z" />
  </Svg>
);

export const IconArrowUpRight = (p: P) => (
  <Svg {...p}>
    <path d="M4 10L10 4M5.2 4H10v4.8" />
  </Svg>
);
