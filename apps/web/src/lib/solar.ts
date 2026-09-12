/**
 * Solar geometry, ported from services/engine/app/simulator.py.
 *
 * Deliberately the same maths rather than a hand-drawn bell curve, so that the
 * mock day and the engine day have sunrise, peak and sunset in the same places
 * and switching NEXT_PUBLIC_USE_MOCKS off does not visibly change the chart.
 *
 *   day of year -> declination (Cooper) -> hour angle -> elevation
 *   elevation   -> clear-sky irradiance (Kasten-Young air mass)
 *   irradiance  -> panel output, attenuated by cloud and temperature
 */
import { DEMO_LAT, DEMO_LNG } from '@sunshare/shared';

const TZ_OFFSET_HOURS = 5.5;

export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin(((360 * (284 + dayOfYear)) / 365) * (Math.PI / 180));
}

export function equationOfTimeMin(dayOfYear: number): number {
  const b = ((360 * (dayOfYear - 81)) / 364) * (Math.PI / 180);
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export function solarElevationDeg(
  hourOfDay: number,
  dayOfYear: number,
  lat = DEMO_LAT,
  lng = DEMO_LNG,
): number {
  const rad = Math.PI / 180;
  const decl = solarDeclinationDeg(dayOfYear) * rad;
  const tzMeridian = TZ_OFFSET_HOURS * 15;
  const solarHours =
    hourOfDay + ((lng - tzMeridian) * 4) / 60 + equationOfTimeMin(dayOfYear) / 60;
  const hourAngle = 15 * (solarHours - 12) * rad;
  const latRad = lat * rad;
  const sinElev =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinElev))) / rad;
}

export function clearSkyIrradiance(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  const zenith = (90 - elevationDeg) * (Math.PI / 180);
  const denom =
    Math.cos(zenith) + 0.50572 * Math.pow(96.07995 - (90 - elevationDeg), -1.6364);
  const airMass = 1 / Math.max(denom, 1e-3);
  const direct = 1353 * Math.pow(0.7, Math.pow(airMass, 0.678));
  return Math.max(0, direct * Math.sin(elevationDeg * (Math.PI / 180)));
}

export function generationKw(
  panelKw: number,
  irradianceWm2: number,
  cloudPct: number,
  tempC = 25,
): number {
  if (panelKw <= 0 || irradianceWm2 <= 0) return 0;
  const cloudFactor = 1 - 0.75 * (Math.max(0, Math.min(cloudPct, 100)) / 100);
  const tempDerate = 1 - 0.004 * Math.max(0, tempC - 25);
  return Math.max(0, panelKw * (irradianceWm2 / 1000) * cloudFactor * tempDerate);
}

/** base kW, morning peak, evening peak, midday plateau — per archetype. */
export const ARCHETYPES: Record<string, [number, number, number, number]> = {
  COUPLE: [0.25, 0.45, 0.9, 0.2],
  FAMILY_3: [0.35, 0.7, 1.4, 0.32],
  FAMILY_4: [0.45, 0.95, 1.9, 0.43],
  FAMILY_5: [0.55, 1.2, 2.4, 0.54],
  // Commercial and institutional load lands at midday, which is the only
  // reason there is anything worth trading while the sun is up.
  SCHOOL: [0.6, 2.2, 0.3, 5.5],
  SHOP: [0.5, 1.1, 1.8, 3.2],
};

export function consumptionKw(
  archetype: string,
  hourOfDay: number,
  jitter: number,
): number {
  const [base, morning, evening, midday] = ARCHETYPES[archetype] ?? ARCHETYPES.FAMILY_4;
  const bump = (centre: number, width: number, height: number) =>
    height * Math.exp(-Math.pow((hourOfDay - centre) / width, 2));

  let load = base;
  load += bump(7.5, 1.3, morning);
  load += bump(19.5, 2.0, evening);
  load += bump(12.5, 3.0, midday);
  return Math.max(0.05, load * jitter);
}

/** Minutes from `hourOfDay` until the sun reaches the horizon. */
export function minutesToSunset(hourOfDay: number, dayOfYear: number): number {
  for (let step = 0; step < 16 * 60; step += 5) {
    if (solarElevationDeg(hourOfDay + step / 60, dayOfYear) <= 0) return step;
  }
  return 0;
}

export function sunWindow(dayOfYear: number): { sunrise: number; sunset: number } {
  let sunrise = 6;
  let sunset = 18;
  for (let h = 0; h < 24; h += 1 / 12) {
    if (solarElevationDeg(h, dayOfYear) > 0) {
      sunrise = h;
      break;
    }
  }
  for (let h = 23.9; h > 0; h -= 1 / 12) {
    if (solarElevationDeg(h, dayOfYear) > 0) {
      sunset = h;
      break;
    }
  }
  return { sunrise, sunset };
}
