'use client';

/**
 * Application store.
 *
 * A single external store rather than a tree of contexts, because almost every
 * surface needs the same live tick and re-rendering the whole app once a second
 * through context providers is worse than a selector subscription.
 *
 * The store never knows where its data came from. `transport.ts` fills it from
 * the local simulator or from the engine's WebSocket + SSE depending on
 * NEXT_PUBLIC_USE_MOCKS, and every component reads the same fields either way.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  DEFAULT_TARIFF,
  type Bid,
  type BrokerDecision,
  type BrokerPolicy,
  type CommunityDonation,
  type GridTopology,
  type Listing,
  type MarketState,
  type Role,
  type SettlementReceipt,
  type Tick,
  type TradeRecord,
  type User,
} from '@sunshare/shared';
import { SESSIONS } from '@/lib/seed';
import {
  DEFAULT_DONATION,
  DEFAULT_START_MIN,
  TOPOLOGY_PLACEHOLDER,
  type DonationConfig,
  type Reading,
  type SettledSlot,
} from '@/lib/mock/state-defaults';

/* ------------------------------------------------------------------ types */

export type ConnectionState =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline'
  | 'error';

export interface ActivityEntry {
  id: string;
  tsSim: string;
  channel: 'policy' | 'market' | 'broker' | 'match' | 'settlement' | 'community' | 'system';
  text: string;
}

export interface Notice {
  id: string;
  tsSim: string;
  title: string;
  body: string;
  href?: string;
  tone: 'neutral' | 'up' | 'down' | 'solar';
  read: boolean;
}

export interface AppState {
  role: Role;
  user: User;

  /** Minutes since midnight on the simulated day. */
  simMinutes: number;
  speed: number;
  playing: boolean;

  tick: Tick | null;
  market: MarketState | null;
  topology: GridTopology;
  readings: Reading[];
  history: SettledSlot[];
  openListings: Listing[];
  openBids: Bid[];

  /** Orders this session created, layered over the seeded book. */
  myListings: Listing[];
  myBids: Bid[];
  withdrawn: string[];

  policy: BrokerPolicy | null;
  brokerPaused: boolean;
  decisions: BrokerDecision[];
  activity: ActivityEntry[];

  donation: DonationConfig;
  stressedEdges: string[];

  connection: ConnectionState;
  online: boolean;
  /** Sim timestamp of the last frame we actually received. */
  lastSyncSim: string | null;
  /** True when we are painting an IndexedDB snapshot rather than live data. */
  fromCache: boolean;
  error: string | null;

  notices: Notice[];
  theme: 'light' | 'dark';
  mocked: boolean;
}

const initial: AppState = {
  role: 'PROSUMER',
  user: SESSIONS.PROSUMER,

  simMinutes: DEFAULT_START_MIN,
  speed: 1,
  playing: true,

  tick: null,
  market: null,
  topology: TOPOLOGY_PLACEHOLDER,
  readings: [],
  history: [],
  openListings: [],
  openBids: [],

  myListings: [],
  myBids: [],
  withdrawn: [],

  policy: null,
  brokerPaused: false,
  decisions: [],
  activity: [],

  donation: DEFAULT_DONATION,
  stressedEdges: [],

  connection: 'connecting',
  online: true,
  lastSyncSim: null,
  fromCache: false,
  error: null,

  notices: [],
  theme: 'light',
  mocked: process.env.NEXT_PUBLIC_USE_MOCKS === 'true',
};

/* ----------------------------------------------------------------- store */

let state: AppState = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Selector subscription — components only re-render when their slice moves. */
export function useStore<T>(selector: (s: AppState) => T, isEqual?: (a: T, b: T) => boolean): T {
  const cache = useRef<{ value: T; source: AppState } | null>(null);

  const getSnapshot = useCallback(() => {
    if (cache.current && cache.current.source === state) return cache.current.value;
    const value = selector(state);
    const previous = cache.current?.value;
    const same =
      previous !== undefined &&
      (isEqual ? isEqual(previous, value) : Object.is(previous, value));
    const settled = same ? (previous as T) : value;
    cache.current = { value: settled, source: state };
    return settled;
  }, [selector, isEqual]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/* --------------------------------------------------------------- notices */

let noticeSeq = 0;

export function pushNotice(n: Omit<Notice, 'id' | 'read'>) {
  const notice: Notice = { ...n, id: `N-${++noticeSeq}`, read: false };
  setState((s) => ({ notices: [notice, ...s.notices].slice(0, 40) }));
}

export function markNoticesRead() {
  setState((s) => ({ notices: s.notices.map((n) => ({ ...n, read: true })) }));
}

export function dismissNotice(id: string) {
  setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
}

/* -------------------------------------------------------------- activity */

let activitySeq = 0;

export function logActivity(entry: Omit<ActivityEntry, 'id'>) {
  setState((s) => ({
    activity: [{ ...entry, id: `A-${++activitySeq}` }, ...s.activity].slice(0, 200),
  }));
}

/* --------------------------------------------------------------- session */

export function setRole(role: Role) {
  setState({ role, user: SESSIONS[role] });
}

/* ------------------------------------------------------- derived getters */

export function tariff() {
  return DEFAULT_TARIFF;
}

type HistorySlice = Pick<AppState, 'history'>;

/** Every trade of the simulated day so far, newest first. */
export function allTrades(s: HistorySlice): TradeRecord[] {
  const out: TradeRecord[] = [];
  for (let i = s.history.length - 1; i >= 0; i--) out.push(...s.history[i].trades);
  return out;
}

export function allReceipts(s: HistorySlice): Map<string, SettlementReceipt> {
  const map = new Map<string, SettlementReceipt>();
  for (const slot of s.history) for (const r of slot.receipts) map.set(r.tradeId, r);
  return map;
}

export function allDonations(s: HistorySlice): CommunityDonation[] {
  const out: CommunityDonation[] = [];
  for (let i = s.history.length - 1; i >= 0; i--) out.push(...s.history[i].donations);
  return out;
}
