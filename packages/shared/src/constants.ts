/**
 * SunShare — shared constants.
 *
 * Mirror of: services/engine/app/config.py
 *
 * ⚠️ Every tariff figure here is ILLUSTRATIVE and labelled as such in the UI.
 * Re-derive against the actual state DISCOM tariff order before any use beyond
 * the hackathon. See docs/PRD.md §13.
 */

import type { TariffContext, Badge } from './types';

/* ---------------------------------------------------------------- market */

/** Trading slot length. The whole market clocks on this. */
export const SLOT_MINUTES = 15;

/** Illustrative Gujarat-style residential figures, in paise per kWh. */
export const DEFAULT_TARIFF: TariffContext = {
  feedInTariffPaise: 215, // ₹2.15 — what the DISCOM pays for export
  retailTariffPaise: 650, // ₹6.50 — what a neighbour pays to import
  wheelingChargePaise: 45, // ₹0.45 — DISCOM's cut per traded unit
};

/** Starting point for the indicative price before any auction has cleared. */
export const BASE_PRICE_PAISE = Math.round(
  (DEFAULT_TARIFF.feedInTariffPaise + DEFAULT_TARIFF.retailTariffPaise) / 2,
);

/* ------------------------------------------------------- network losses */

/**
 * Hop-tiered distribution loss. Deliberately simple and interpretable —
 * we are not running a load-flow solver in 24 hours.
 */
export const LOSS_SAME_FEEDER_PCT = 0.5;
export const LOSS_SAME_SUBSTATION_PCT = 2.0;
export const LOSS_CROSS_SUBSTATION_PCT = 5.0;

/** Additional distance-proportional loss, %/km, on top of the hop tier. */
export const LOSS_PER_KM_PCT = 0.06;

/** Above this edge utilisation we add a congestion penalty. */
export const CONGESTION_HIGH_THRESHOLD = 0.75;
export const CONGESTION_CRITICAL_THRESHOLD = 0.95;

/** Paise/kWh added to the match cost at full congestion. */
export const CONGESTION_PENALTY_MAX_PAISE = 120;

/* ---------------------------------------------------------------- carbon */

/** CEA CO2 Baseline Database, Indian grid average. kg CO2 per kWh. */
export const GRID_EMISSION_FACTOR = 0.71;

/** Rooftop solar lifecycle emissions, kg CO2 per kWh. */
export const SOLAR_EMISSION_FACTOR = 0.04;

/** Indian T&D losses avoided by consuming locally. */
export const TD_LOSS_FRACTION = 0.17;

/** Net avoided emissions per locally traded kWh. */
export const CO2_AVOIDED_PER_KWH =
  (GRID_EMISSION_FACTOR - SOLAR_EMISSION_FACTOR) * (1 + TD_LOSS_FRACTION);

/** kg CO2 absorbed by one urban tree per year. */
export const KG_CO2_PER_TREE_YEAR = 21;

export const BADGE_DEFINITIONS: Omit<Badge, 'unlockedAt' | 'progressPct'>[] = [
  {
    code: 'FIRST_TRADE',
    title: 'First Light',
    description: 'Completed your first peer-to-peer energy trade.',
    icon: '⚡',
    threshold: 1,
  },
  {
    code: 'LOCAL_10',
    title: 'Neighbourhood Watt',
    description: 'Traded 10 kWh with neighbours instead of the grid.',
    icon: '🏘️',
    threshold: 10,
  },
  {
    code: 'SUN_BARON',
    title: 'Sun Baron',
    description: 'Sold 50 kWh of surplus rooftop solar.',
    icon: '☀️',
    threshold: 50,
  },
  {
    code: 'COMMUNITY_HERO',
    title: 'Neighbourhood Hero',
    description: 'Donated 5 kWh to the community pool.',
    icon: '🤝',
    threshold: 5,
  },
  {
    code: 'CARBON_CENTURY',
    title: 'Carbon Century',
    description: 'Avoided 100 kg of CO₂ through local trading.',
    icon: '🌱',
    threshold: 100,
  },
];

/* ------------------------------------------------------------- simulator */

/** Simulated minutes per real second. 60 ⇒ a full solar day in 24 minutes. */
export const DEFAULT_SIM_SPEED = 60;

/** Fixed so every demo run is identical. */
export const DEFAULT_SIM_SEED = 2026;

/** Demo location — Gandhinagar, Gujarat. */
export const DEMO_LAT = 23.2156;
export const DEMO_LNG = 72.6369;

/* ------------------------------------------------------------ formatting */

export function paiseToRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function kwh(value: number): string {
  return `${value.toFixed(2)} kWh`;
}
