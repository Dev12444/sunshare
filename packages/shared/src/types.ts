/**
 * SunShare — shared type treaty.
 *
 * This file is the contract between the backend pair (Dev, Rahi) and the
 * frontend pair (Maansi, Diya). It is written once at H0 by all four together
 * and changed ONLY by announced agreement in the team channel.
 *
 * Mirror of: services/engine/app/models.py  (keep field names identical)
 *
 * UNITS — fixed, non-negotiable, to stop float/rounding arguments at 3am:
 *   money   -> integer PAISE per kWh (never rupees, never floats)
 *   energy  -> float kWh in TS/Python;  integer Wh on-chain (kWh * 1000)
 *   power   -> float kW
 *   time    -> ISO-8601 strings. `*Sim` = simulated clock, `*Real` = wall clock.
 */

/* ------------------------------------------------------------------ roles */

export type Role = 'PROSUMER' | 'CONSUMER' | 'DISCOM' | 'REGULATOR';

export interface User {
  id: string;
  name: string;
  role: Role;
  nodeId: string | null;
  walletAddress: string | null;
}

/* ------------------------------------------------------------------- grid */

export type GridNodeKind = 'HOUSE' | 'FEEDER' | 'SUBSTATION';

export interface GridNode {
  id: string;
  kind: GridNodeKind;
  name: string;
  lat: number;
  lng: number;
  /** Parent in the radial distribution tree. Substations have null. */
  parentId: string | null;
  capacityKw: number;
  loadKw: number;
}

export interface GridEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthKm: number;
  capacityKw: number;
  currentLoadKw: number;
}

export interface GridTopology {
  nodes: GridNode[];
  edges: GridEdge[];
}

/** 0 = clear, 1 = fully congested. Drives the map colour ramp. */
export type CongestionLevel = 'NORMAL' | 'HIGH' | 'CRITICAL';

/* --------------------------------------------------------- meters & ticks */

export interface MeterReading {
  meterId: string;
  userId: string;
  nodeId: string;
  generationKw: number;
  consumptionKw: number;
  /** generationKw - consumptionKw; negative means the house is importing. */
  surplusKw: number;
  /** Cumulative for the simulated day, used for Robin Hood thresholds. */
  dayGenerationKwh: number;
}

export interface WeatherSnapshot {
  cloudCoverPct: number;
  irradianceWm2: number;
  tempC: number;
  source: 'open-meteo' | 'synthetic';
}

export interface Tick {
  seq: number;
  tsSim: string;
  tsReal: string;
  /** Simulated minutes per real second. */
  speed: number;
  weather: WeatherSnapshot;
  meters: MeterReading[];
  market: MarketState;
}

export interface MarketState {
  slotId: string;
  slotStartSim: string;
  slotEndSim: string;
  totalSupplyKwh: number;
  totalDemandKwh: number;
  /** Reference price before the auction clears. */
  indicativePricePaise: number;
  lastClearingPricePaise: number | null;
  /** 0..1 across the whole network. */
  congestionIndex: number;
  activeListings: number;
  activeBids: number;
}

/* ----------------------------------------------------------------- tariff */

/**
 * The price corridor. Every cleared trade must satisfy
 *   feedInTariffPaise <= price <= retailTariffPaise
 * so neither party is worse off than transacting with the grid.
 * Values are ILLUSTRATIVE and must be re-derived against the actual state
 * DISCOM tariff order before any non-hackathon use.
 */
export interface TariffContext {
  feedInTariffPaise: number;
  retailTariffPaise: number;
  /** DISCOM's cut on every traded unit — the utility is a partner, not bypassed. */
  wheelingChargePaise: number;
}

/* ----------------------------------------------------------------- orders */

export type OrderStatus = 'OPEN' | 'MATCHED' | 'PARTIAL' | 'EXPIRED' | 'WITHDRAWN';

export interface Listing {
  id: string;
  sellerId: string;
  meterId: string;
  nodeId: string;
  kwh: number;
  askPricePaise: number;
  slotId: string;
  expiresAtSim: string;
  status: OrderStatus;
  /** Set when the AI broker created or repriced this listing. */
  brokerPolicyId: string | null;
}

export interface Bid {
  id: string;
  buyerId: string;
  meterId: string;
  nodeId: string;
  kwh: number;
  maxPricePaise: number;
  slotId: string;
  status: OrderStatus;
}

/* --------------------------------------------------------------- matching */

export interface MatchRequest {
  slotId: string;
  listings: Listing[];
  bids: Bid[];
  grid: GridTopology;
  tariff: TariffContext;
}

export interface MatchPair {
  listingId: string;
  bidId: string;
  sellerId: string;
  buyerId: string;
  /** Contracted energy at the seller's end. */
  kwh: number;
  /** What actually arrives after line losses. Settlement pays on this. */
  deliveredKwh: number;
  lossKwh: number;
  distanceKm: number;
  /** deliveredKwh / kwh * 100 */
  efficiencyPct: number;
  /** Route through the grid graph, for the map animation. */
  pathNodeIds: string[];
  congestionPenaltyPaise: number;
}

export interface MatchResult {
  slotId: string;
  /** Uniform price for the slot, already clamped into the corridor. */
  clearingPricePaise: number;
  pairs: MatchPair[];
  totalMatchedKwh: number;
  totalDeliveredKwh: number;
  totalLossKwh: number;
  avgEfficiencyPct: number;
  unmatchedSupplyKwh: number;
  unmatchedDemandKwh: number;
  /** Demand the local market could not serve; the grid covers it. */
  gridBackfillKwh: number;
  computeMs: number;
  algorithm: 'mcmf' | 'greedy-fallback';
}

/* ----------------------------------------------------------- AI broker */

export type BrokerObjective =
  | 'MAX_PROFIT'
  | 'SELL_FAST'
  | 'BEAT_GRID'
  | 'MAX_COMMUNITY';

/**
 * The ONLY thing the LLM is allowed to produce. It is schema-validated and
 * clamped into the price corridor before the deterministic executor runs.
 * The model never signs, never settles, never touches money.
 */
export interface BrokerPolicy {
  id: string;
  userId: string;
  rawGoal: string;
  objective: BrokerObjective;
  minPricePaise: number;
  maxPricePaise: number;
  /** 0 = patient, 1 = dump it now. */
  urgency: number;
  /** kWh held back for the household's own use. */
  reserveKwh: number;
  communityDonationPct: number;
  validUntilSim: string;
  rationale: string;
  source: 'llm' | 'fallback';
  createdAt: string;
}

export type BrokerAction = 'LIST' | 'REPRICE' | 'HOLD' | 'WITHDRAW' | 'DONATE';

export interface BrokerDecision {
  id: string;
  policyId: string;
  slotId: string;
  tsSim: string;
  action: BrokerAction;
  kwh: number;
  fromPricePaise: number | null;
  toPricePaise: number | null;
  /** Human-readable "why" — this is what the judges actually read. */
  reason: string;
  inputs: {
    surplusKwh: number;
    minutesToSunset: number;
    forecastCloudPct: number;
    marketPricePaise: number;
    congestionIndex: number;
  };
}

/* ------------------------------------------------------ trade & settlement */

export type TradeStatus =
  | 'MATCHED'
  | 'COMMITTED'
  | 'DELIVERING'
  | 'SETTLED'
  | 'FAILED';

export interface TradeRecord {
  id: string;
  slotId: string;
  sellerId: string;
  buyerId: string;
  kwh: number;
  deliveredKwh: number;
  pricePaise: number;
  grossPaise: number;
  wheelingFeePaise: number;
  netToSellerPaise: number;
  efficiencyPct: number;
  co2AvoidedKg: number;
  status: TradeStatus;
  createdAt: string;
}

export interface SettlementReceipt {
  tradeId: string;
  txHash: string;
  blockNumber: number;
  chainId: number;
  gasUsed: string;
  wheelingFeePaise: number;
  /** Per-slot order-book commitment. Null until the Merkle feature lands. */
  merkleRoot: string | null;
  explorerUrl: string | null;
  settledAt: string;
  mode: 'onchain' | 'local' | 'simulated';
}

/* ----------------------------------------------------------------- carbon */

export interface CarbonSummary {
  userId: string;
  periodStart: string;
  periodEnd: string;
  localKwh: number;
  co2AvoidedKg: number;
  treeEquivalent: number;
  /** What the same kWh would have emitted on grid power. */
  gridComparisonKg: number;
  rank: number | null;
}

export interface Badge {
  code: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  unlockedAt: string | null;
  progressPct: number;
}

/* -------------------------------------------------------------- community */

export type BeneficiaryKind = 'SCHOOL' | 'STREETLIGHT' | 'HOUSEHOLD' | 'CLINIC';

export interface Beneficiary {
  id: string;
  name: string;
  kind: BeneficiaryKind;
  nodeId: string;
  walletAddress: string;
  verifiedBy: string;
  verifiedAt: string;
}

export interface CommunityDonation {
  id: string;
  donorId: string;
  donorName: string;
  beneficiaryId: string;
  beneficiaryName: string;
  kwh: number;
  slotId: string;
  valuePaise: number;
  txHash: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------- push */

export interface PushSubscriptionPayload {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
}

/* ---------------------------------------------------------- event stream */

/**
 * Envelope for both transports:
 *   - WebSocket  ws://ENGINE/ws   (Dev's simulator -> browser, ticks only)
 *   - SSE        /api/events      (Rahi's Next route -> browser, everything else)
 */
export type ServerEvent =
  | { type: 'tick'; data: Tick }
  | { type: 'market'; data: MarketState }
  | { type: 'match'; data: MatchResult }
  | { type: 'trade'; data: TradeRecord }
  | { type: 'settlement'; data: SettlementReceipt }
  | { type: 'broker'; data: BrokerDecision }
  | { type: 'donation'; data: CommunityDonation }
  | { type: 'badge'; data: Badge };

/* -------------------------------------------------------- api envelopes */

export interface ApiError {
  error: string;
  detail?: string;
}

export type ApiResult<T> = T | ApiError;

export function isApiError(v: unknown): v is ApiError {
  return typeof v === 'object' && v !== null && 'error' in v;
}
