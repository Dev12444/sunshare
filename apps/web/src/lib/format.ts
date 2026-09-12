/**
 * Formatting for a market UI.
 *
 * Two rules everywhere in SunShare:
 *   1. Money is stored in integer paise and only ever becomes rupees here.
 *   2. A number and its unit are different typographic objects — the value is
 *      mono/tabular, the unit is small and muted. `splitUnit` exists so
 *      components can render both halves without re-deriving the string.
 */

export const RUPEE = '₹';

export function rupees(paise: number, opts: { decimals?: number } = {}): string {
  const d = opts.decimals ?? 2;
  return `${RUPEE}${(paise / 100).toFixed(d)}`;
}

/** Compact money for wide values: ₹1,240 / ₹12.4k. */
export function rupeesCompact(paise: number): string {
  const r = paise / 100;
  if (Math.abs(r) >= 100000) return `${RUPEE}${(r / 100000).toFixed(2)}L`;
  if (Math.abs(r) >= 1000) return `${RUPEE}${(r / 1000).toFixed(1)}k`;
  return `${RUPEE}${r.toFixed(0)}`;
}

export function pricePerKwh(paise: number): string {
  return `${rupees(paise)}/kWh`;
}

export function kwh(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function kw(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function signed(value: number, decimals = 2): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(decimals)}`;
}

export function km(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(2)} km`;
}

export function kgCo2(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} t` : `${value.toFixed(1)} kg`;
}

/* ---------------------------------------------------------------- time */

/**
 * Wall clock as written in the timestamp.
 *
 * Sim timestamps arrive with an explicit +05:30 offset. Reading them through
 * `Date#getHours()` would re-project them into the viewer's timezone and a
 * judge watching from another zone would see the sun set at the wrong hour, so
 * we read the wall clock straight off the string and only fall back to Date
 * parsing for timestamps that carry no time part.
 */
export function simClock(iso: string): string {
  const t = iso.indexOf('T');
  if (t > 0 && iso.length >= t + 6) return iso.slice(t + 1, t + 6);
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function simClockSeconds(iso: string): string {
  const t = iso.indexOf('T');
  if (t > 0 && iso.length >= t + 9) return iso.slice(t + 1, t + 9);
  return simClock(iso);
}

/** Hour of day as a float, read off the timestamp's own wall clock. */
export function hourOfDay(iso: string): number {
  const [h, m] = simClock(iso).split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

export function slotLabel(slotId: string): string {
  // slotId is "YYYY-MM-DDTHH:MM"
  return slotId.slice(11) || slotId;
}

export function slotRange(slotId: string, minutes = 15): string {
  const start = slotLabel(slotId);
  const [h, m] = start.split(':').map(Number);
  if (Number.isNaN(h)) return start;
  const end = new Date(2000, 0, 1, h, m + minutes);
  return `${start}–${String(end.getHours()).padStart(2, '0')}:${String(
    end.getMinutes(),
  ).padStart(2, '0')}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const delta = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function durationMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ---------------------------------------------------------------- ids */

/** 0x1f4a…9c2b — long hashes shown at a glance, full value on hover/copy. */
export function shortHash(hash: string, lead = 6, tail = 4): string {
  if (hash.length <= lead + tail + 2) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

/** Value + unit as separate strings, so the unit can be styled down. */
export function splitUnit(value: string, unit: string): [string, string] {
  return [value, unit];
}
