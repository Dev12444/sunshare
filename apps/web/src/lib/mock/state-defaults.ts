/**
 * Values the store needs before the first frame arrives.
 *
 * Kept apart from market-engine.ts so the store can be imported without
 * dragging the whole simulator into every bundle that only needs a type.
 */
export {
  DEFAULT_DONATION,
  DEFAULT_START_MIN,
  DAY_START_MIN,
  DAY_END_MIN,
  type DonationConfig,
  type Reading,
  type SettledSlot,
  type DayPoint,
  type PricePoint,
} from './market-engine';

import type { GridTopology } from '@sunshare/shared';
import { EDGES, NODES } from '@/lib/seed';

/** The network at rest — real topology, zero load, until the first tick. */
export const TOPOLOGY_PLACEHOLDER: GridTopology = { nodes: NODES, edges: EDGES };
