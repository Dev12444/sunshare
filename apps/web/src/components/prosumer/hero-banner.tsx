'use client';

/**
 * Dashboard hero — the reference's opening band.
 *
 * Drawn, not photographed, for the same reasons as the auth artwork: a stock
 * Ahmedabad rooftop would be an unlicensed asset that cannot follow the theme
 * and costs more to load than every other asset on the page combined. This is
 * the same skyline in the brand's own colours, at roughly a tenth of a kilobyte.
 *
 * Colours are literal rather than tokens. It is a picture of a sky, and a
 * picture must not invert into daylight when the reader prefers dark mode.
 *
 * The greeting is real: it reads the simulated clock, not the wall clock, so
 * it agrees with every other time on the page during a demo.
 */
import { useStore } from '@/lib/store';
import { useMyReading } from '@/hooks/use-derived';
import { kw } from '@/lib/format';

const NIGHT = '#0f3d3a';
const WARM = '#e0a53c';

function greetingFor(minutes: number): string {
  const h = minutes / 60;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HeroBanner({ name, subtitle }: { name: string; subtitle: string }) {
  const nowMin = useStore((s) => s.simMinutes);
  const cloudPct = useStore((s) => s.tick?.weather?.cloudCoverPct ?? null);
  const reading = useMyReading();

  const clock = `${String(Math.floor(nowMin / 60) % 24).padStart(2, '0')}:${String(
    Math.floor(nowMin) % 60,
  ).padStart(2, '0')}`;

  return (
    <section
      className="relative isolate overflow-hidden rounded-sm"
      style={{ background: NIGHT }}
      aria-label="Your energy at a glance"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 260"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id="hero-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={NIGHT} />
            <stop offset="58%" stopColor="#1c5c50" />
            <stop offset="100%" stopColor="#8a5a16" />
          </linearGradient>
        </defs>
        <rect width="1200" height="260" fill="url(#hero-sky)" />
        <circle cx="1010" cy="96" r="44" fill={WARM} opacity="0.95" />

        {/* Ahmedabad skyline: flat terraces, water tanks, one tower. */}
        <g fill="#0b2e2c" opacity="0.92">
          <rect x="690" y="176" width="86" height="84" />
          <rect x="776" y="150" width="64" height="110" />
          <rect x="840" y="188" width="96" height="72" />
          <rect x="936" y="164" width="72" height="96" />
          <rect x="1008" y="196" width="110" height="64" />
          <rect x="1118" y="170" width="82" height="90" />
          <rect x="866" y="128" width="14" height="26" />
        </g>

        {/* Arrays catching the low sun. */}
        <g stroke={WARM} strokeWidth="3" opacity="0.75">
          <path d="M700 176 L766 168" />
          <path d="M786 150 L832 143" />
          <path d="M852 188 L926 180" />
          <path d="M946 164 L1000 157" />
          <path d="M1020 196 L1108 188" />
        </g>

        {/* The distribution line. */}
        <path d="M660 150 L1200 132" stroke="#f0e2c6" strokeWidth="1.5" opacity="0.34" />
      </svg>

      <div className="relative flex flex-wrap items-end justify-between gap-4 px-5 py-7 sm:px-7">
        <div>
          <h1 className="font-sans text-xl font-semibold tracking-[-0.015em] text-[#f2f7f4] sm:text-2xl">
            {greetingFor(nowMin)}, {name}
          </h1>
          <p className="mt-1 font-sans text-sm text-[#f2f7f4]/70">{subtitle}</p>
        </div>

        <dl className="flex items-center gap-5">
          <div className="text-right">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#f2f7f4]/55">
              Simulated
            </dt>
            <dd className="font-mono text-lg tabular-nums text-[#f2f7f4]">{clock}</dd>
          </div>
          <span aria-hidden className="h-8 w-px bg-white/20" />
          <div className="text-right">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#f2f7f4]/55">
              Generating
            </dt>
            <dd className="font-mono text-lg tabular-nums" style={{ color: WARM }}>
              {reading ? kw(reading.generationKw) : '—'} <span className="text-sm">kW</span>
            </dd>
          </div>
          {cloudPct !== null ? (
            <>
              <span aria-hidden className="hidden h-8 w-px bg-white/20 sm:block" />
              <div className="hidden text-right sm:block">
                <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#f2f7f4]/55">
                  Cloud
                </dt>
                <dd className="font-mono text-lg tabular-nums text-[#f2f7f4]">
                  {Math.round(cloudPct)}
                  <span className="text-sm">%</span>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
