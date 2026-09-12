'use client';

/**
 * The only place that knows where data comes from.
 *
 * NEXT_PUBLIC_USE_MOCKS=true  -> local deterministic simulator, no backend
 * NEXT_PUBLIC_USE_MOCKS=false -> engine WebSocket for ticks, SSE for events,
 *                                REST for the order book and topology
 *
 * Both paths write the identical shape into the store, so no component ever
 * branches on the flag. The connection state machine, the IndexedDB fallback
 * and the notification rules are shared by both.
 */
import {
  CO2_AVOIDED_PER_KWH,
  DEFAULT_TARIFF,
  SLOT_MINUTES,
  type Bid,
  type Listing,
  type MarketState,
  type ServerEvent,
  type Tick,
  type TradeRecord,
} from '@sunshare/shared';
import { rupees } from '@/lib/format';
import { loadSnapshot, saveSnapshot } from '@/lib/offline-store';
import { displayName } from '@/lib/seed';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  DEFAULT_START_MIN,
  clearSlotCache,
  historyUpTo,
  hexHash,
  ordersForSlot,
  round,
  simIso,
  slotIndexFor,
  tickAt,
} from '@/lib/mock/market-engine';
import { evaluate } from '@/lib/mock/broker';
import {
  getState,
  logActivity,
  pushNotice,
  setState,
  type AppState,
} from '@/lib/store';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const WS_URL = process.env.NEXT_PUBLIC_ENGINE_WS ?? 'ws://localhost:8000/ws';
const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? 'http://localhost:8000';

/** Real seconds between frames. One second matches the engine's tick rate. */
const FRAME_MS = 1000;

let started = false;
let frameTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let lastSlotIndex = -1;
let lastBrokerMin = -Infinity;
let lastPriceNoticePaise: number | null = null;

/* ------------------------------------------------------------------ boot */

export function startTransport(): () => void {
  if (started) return () => {};
  started = true;

  void hydrateFromCache();
  attachConnectivity();

  if (USE_MOCKS) startSimulated();
  else startLive();

  return () => {
    started = false;
    if (frameTimer) clearInterval(frameTimer);
    detachConnectivity();
    closeLive();
  };
}

/* --------------------------------------------------------- offline first */

async function hydrateFromCache() {
  const snap = await loadSnapshot();
  if (!snap) return;
  // Only paint the cache if nothing live has arrived yet.
  if (getState().tick) return;
  setState({
    market: snap.market,
    lastSyncSim: snap.market.slotStartSim,
    fromCache: true,
  });
}

function attachConnectivity() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  setState({ online: navigator.onLine });
  if (!navigator.onLine) setState({ connection: 'offline' });
}

function detachConnectivity() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
}

function handleOnline() {
  setState({ online: true, connection: USE_MOCKS ? 'live' : 'reconnecting', error: null });
  if (!USE_MOCKS) openSocket();
}

function handleOffline() {
  setState({ online: false, connection: 'offline' });
  logActivity({
    tsSim: getState().tick?.tsSim ?? simIso(getState().simMinutes),
    channel: 'system',
    text: 'Network lost. Showing the last received market state.',
  });
}

/* --------------------------------------------------- simulated transport */

function startSimulated() {
  setState({ connection: 'live', error: null });
  frame(true);
  frameTimer = setInterval(() => frame(false), FRAME_MS);
}

function frame(force: boolean) {
  const s = getState();
  if (!force && !s.playing) return;

  const advance = force ? 0 : s.speed;
  let minutes = s.simMinutes + advance;
  if (minutes > DAY_END_MIN) minutes = DAY_START_MIN;

  applySimMinute(minutes, s);
}

/** Recompute every derived surface for one simulated minute. */
export function applySimMinute(minutes: number, prev: AppState = getState()) {
  const { tick, topology, readings } = tickAt(
    minutes,
    ++seq,
    prev.speed,
    prev.stressedEdges,
    prev.policy,
    prev.donation,
  );

  const slotIndex = slotIndexFor(minutes);
  const slotChanged = slotIndex !== lastSlotIndex;
  const history =
    slotChanged || prev.history.length === 0
      ? historyUpTo(minutes, prev.policy, prev.donation)
      : prev.history;

  const book = ordersForSlot(slotIndex, prev.policy);
  const mine = new Set([prev.user.id]);
  const openListings = [
    ...book.listings.filter((l) => !mine.has(l.sellerId)),
    ...prev.myListings.filter((l) => l.slotId === book.slotId && l.status === 'OPEN'),
  ];
  const openBids = [
    ...book.bids.filter((b) => !mine.has(b.buyerId)),
    ...prev.myBids.filter((b) => b.slotId === book.slotId && b.status === 'OPEN'),
  ];

  setState({
    simMinutes: minutes,
    tick,
    topology,
    readings,
    market: tick.market,
    history,
    openListings,
    openBids,
    connection: prev.online ? 'live' : 'offline',
    lastSyncSim: tick.tsSim,
    fromCache: false,
  });

  void saveSnapshot(tick.market, tick.meters);

  if (slotChanged) {
    const closed = lastSlotIndex;
    lastSlotIndex = slotIndex;
    if (closed >= 0) onSlotClosed(closed, minutes);
    announcePrice(tick.market);
  }

  runBroker(minutes);
}

/** Everything that happens the instant a 15-minute slot finishes clearing. */
function onSlotClosed(slotIndex: number, nowMin: number) {
  const s = getState();
  const settled = s.history.find((h) => h.slotIndex === slotIndex);
  if (!settled) return;

  const ts = simIso(Math.floor(nowMin));
  const mine = settled.trades.filter(
    (t) => t.sellerId === s.user.id || t.buyerId === s.user.id,
  );

  if (settled.match.pairs.length > 0) {
    logActivity({
      tsSim: ts,
      channel: 'match',
      text: `Slot ${settled.slotId.slice(11, 16)} cleared at ${rupees(settled.clearingPricePaise)} — ${settled.match.pairs.length} matches, ${settled.match.totalMatchedKwh.toFixed(2)} kWh.`,
    });
  }

  for (const trade of mine) {
    const selling = trade.sellerId === s.user.id;
    logActivity({
      tsSim: trade.createdAt,
      channel: 'settlement',
      text: selling
        ? `${trade.deliveredKwh.toFixed(2)} kWh delivered to ${displayName(trade.buyerId)}. Settlement ${trade.status === 'SETTLED' ? 'confirmed' : 'failed'}.`
        : `${trade.deliveredKwh.toFixed(2)} kWh received from ${displayName(trade.sellerId)}. Settlement ${trade.status === 'SETTLED' ? 'confirmed' : 'failed'}.`,
    });
    if (trade.status === 'FAILED') {
      pushNotice({
        tsSim: trade.createdAt,
        title: 'Settlement failed',
        body: `Trade ${trade.id} could not be settled. The energy was delivered; the payment will retry next slot.`,
        href: '/ledger',
        tone: 'down',
      });
    } else {
      pushNotice({
        tsSim: trade.createdAt,
        title: selling ? 'Energy sold' : 'Energy purchased',
        body: selling
          ? `Sold ${trade.deliveredKwh.toFixed(2)} kWh at ${rupees(trade.pricePaise)}/kWh. Net ${rupees(trade.netToSellerPaise)} after wheeling.`
          : `Bought ${trade.deliveredKwh.toFixed(2)} kWh at ${rupees(trade.pricePaise)}/kWh, ${rupees(DEFAULT_TARIFF.retailTariffPaise - trade.pricePaise)}/kWh below retail.`,
        href: '/ledger',
        tone: selling ? 'up' : 'neutral',
      });
    }
  }

  const myDonation = settled.donations.filter((d) => d.donorId === s.user.id);
  for (const d of myDonation) {
    logActivity({
      tsSim: d.createdAt,
      channel: 'community',
      text: `${d.kwh.toFixed(2)} kWh allocated to ${d.beneficiaryName}.`,
    });
    pushNotice({
      tsSim: d.createdAt,
      title: 'Community pool credited',
      body: `${d.kwh.toFixed(2)} kWh routed to ${d.beneficiaryName}.`,
      href: '/community',
      tone: 'solar',
    });
  }

  resolveMyOrders(settled.slotId, settled.clearingPricePaise, nowMin);
}

/**
 * Settle the orders this session placed by hand.
 *
 * A manual listing clears if the uniform price reached its ask; a manual bid
 * clears if the price stayed at or below its limit. Anything else expires with
 * the slot and says why.
 */
function resolveMyOrders(slotId: string, clearingPricePaise: number, nowMin: number) {
  const s = getState();
  const t = DEFAULT_TARIFF;
  const extraTrades: TradeRecord[] = [];

  const myListings = s.myListings.map((l) => {
    if (l.slotId !== slotId || l.status !== 'OPEN') return l;
    if (l.askPricePaise <= clearingPricePaise) {
      extraTrades.push(
        buildTrade(l.id, slotId, s.user.id, 'U-06', l.kwh, clearingPricePaise, nowMin),
      );
      return { ...l, status: 'MATCHED' as const };
    }
    logActivity({
      tsSim: simIso(Math.floor(nowMin)),
      channel: 'market',
      text: `Listing ${l.id} expired unmatched — ask ${rupees(l.askPricePaise)} above the ${rupees(clearingPricePaise)} clearing price.`,
    });
    return { ...l, status: 'EXPIRED' as const };
  });

  const myBids = s.myBids.map((b) => {
    if (b.slotId !== slotId || b.status !== 'OPEN') return b;
    if (b.maxPricePaise >= clearingPricePaise) {
      extraTrades.push(
        buildTrade(b.id, slotId, 'U-04', s.user.id, b.kwh, clearingPricePaise, nowMin),
      );
      return { ...b, status: 'MATCHED' as const };
    }
    logActivity({
      tsSim: simIso(Math.floor(nowMin)),
      channel: 'market',
      text: `Bid ${b.id} expired unfilled — limit ${rupees(b.maxPricePaise)} below the ${rupees(clearingPricePaise)} clearing price. Demand covered by grid backfill.`,
    });
    return { ...b, status: 'EXPIRED' as const };
  });

  if (extraTrades.length > 0) {
    const slot = s.history.find((h) => h.slotId === slotId);
    if (slot) {
      slot.trades = [...slot.trades, ...extraTrades];
      slot.receipts = [
        ...slot.receipts,
        ...extraTrades.map((tr, i) => ({
          tradeId: tr.id,
          txHash: hexHash(`tx:${tr.id}`, 64),
          blockNumber: 8_412_770 + slot.slotIndex * 12 + 8 + i,
          chainId: 31337,
          gasUsed: '91240',
          wheelingFeePaise: tr.wheelingFeePaise,
          merkleRoot: hexHash(`merkle:${slotId}`, 64),
          explorerUrl: null,
          settledAt: simIso(Math.floor(nowMin), 11),
          mode: 'simulated' as const,
        })),
      ];
    }
    for (const tr of extraTrades) {
      const selling = tr.sellerId === s.user.id;
      pushNotice({
        tsSim: tr.createdAt,
        title: selling ? 'Your listing matched' : 'Your bid filled',
        body: selling
          ? `Sold ${tr.deliveredKwh.toFixed(2)} kWh at ${rupees(tr.pricePaise)}/kWh. Net ${rupees(tr.netToSellerPaise)}.`
          : `Bought ${tr.deliveredKwh.toFixed(2)} kWh at ${rupees(tr.pricePaise)}/kWh, saving ${rupees(t.retailTariffPaise - tr.pricePaise)}/kWh against retail.`,
        href: '/ledger',
        tone: 'up',
      });
    }
  }

  setState({ myListings, myBids, history: [...s.history] });
}

function buildTrade(
  orderId: string,
  slotId: string,
  sellerId: string,
  buyerId: string,
  kwh: number,
  pricePaise: number,
  nowMin: number,
): TradeRecord {
  const efficiencyPct = 98.6;
  const deliveredKwh = round(kwh * (efficiencyPct / 100), 4);
  const grossPaise = Math.round(deliveredKwh * pricePaise);
  const wheelingFeePaise = Math.min(
    Math.round(deliveredKwh * DEFAULT_TARIFF.wheelingChargePaise),
    grossPaise,
  );
  return {
    id: `TR-${orderId}`,
    slotId,
    sellerId,
    buyerId,
    kwh,
    deliveredKwh,
    pricePaise,
    grossPaise,
    wheelingFeePaise,
    netToSellerPaise: grossPaise - wheelingFeePaise,
    efficiencyPct,
    co2AvoidedKg: round(deliveredKwh * CO2_AVOIDED_PER_KWH, 4),
    status: 'SETTLED',
    createdAt: simIso(Math.floor(nowMin), 4),
  };
}

function announcePrice(market: MarketState) {
  const price = market.lastClearingPricePaise;
  if (price == null) return;
  if (lastPriceNoticePaise == null) {
    lastPriceNoticePaise = price;
    return;
  }
  const delta = price - lastPriceNoticePaise;
  if (Math.abs(delta) < 25) return;
  lastPriceNoticePaise = price;
  pushNotice({
    tsSim: market.slotStartSim,
    title: 'Clearing price moved',
    body: `Market clearing price ${delta > 0 ? 'increased' : 'fell'} to ${rupees(price)}/kWh.`,
    href: '/marketplace',
    tone: delta > 0 ? 'up' : 'down',
  });
}

/* ---------------------------------------------------------------- broker */

/** The deterministic executor. Runs every five simulated minutes. */
function runBroker(minutes: number) {
  const s = getState();
  if (!s.policy || s.brokerPaused) return;
  if (minutes - lastBrokerMin < 5) return;
  lastBrokerMin = minutes;

  const mine = s.readings.find((r) => r.userId === s.policy!.userId);
  if (!mine || !s.market) return;

  const remainingHours = (SLOT_MINUTES - (minutes % SLOT_MINUTES)) / 60;
  const listing =
    s.myListings.find((l) => l.status === 'OPEN' && l.brokerPolicyId === s.policy!.id) ?? null;

  const decision = evaluate(
    s.policy,
    {
      nowMin: minutes,
      surplusKwh: Math.max(0, mine.surplusKw) * Math.max(remainingHours, 0.05),
      dayGenerationKwh: mine.dayGenerationKwh,
      market: s.market,
      congestionIndex: s.market.congestionIndex,
      listing,
    },
    s.decisions[0] ?? null,
  );
  if (!decision) return;

  setState((cur) => ({ decisions: [decision, ...cur.decisions].slice(0, 120) }));
  logActivity({
    tsSim: decision.tsSim,
    channel: 'broker',
    text: brokerActivityLine(decision),
  });

  applyBrokerDecision(decision);
}

function brokerActivityLine(d: import('@sunshare/shared').BrokerDecision): string {
  switch (d.action) {
    case 'LIST':
      return `Listed ${d.kwh.toFixed(2)} kWh at ${rupees(d.toPricePaise ?? 0)}.`;
    case 'REPRICE':
      return `Repriced listing ${rupees(d.fromPricePaise ?? 0)} → ${rupees(d.toPricePaise ?? 0)}.`;
    case 'WITHDRAW':
      return 'Listing withdrawn — policy validity window closed.';
    case 'DONATE':
      return `Allocated ${d.kwh.toFixed(2)} kWh to the community pool.`;
    default:
      return d.reason.startsWith('Current clearing price')
        ? 'Market below configured minimum — position held.'
        : 'Position held.';
  }
}

function applyBrokerDecision(d: import('@sunshare/shared').BrokerDecision) {
  const s = getState();
  if (!s.policy || !s.market) return;

  if (d.action === 'LIST' && d.toPricePaise != null) {
    const listing: Listing = {
      id: `L-BRK-${d.id}`,
      sellerId: s.policy.userId,
      meterId: s.readings.find((r) => r.userId === s.policy!.userId)?.meterId ?? 'M-01',
      nodeId: s.user.nodeId ?? 'H-01',
      kwh: d.kwh,
      askPricePaise: d.toPricePaise,
      slotId: s.market.slotId,
      expiresAtSim: s.market.slotEndSim,
      status: 'OPEN',
      brokerPolicyId: s.policy.id,
    };
    setState((cur) => ({ myListings: [...cur.myListings, listing] }));
    pushNotice({
      tsSim: d.tsSim,
      title: 'Broker placed a listing',
      body: `${d.kwh.toFixed(2)} kWh offered at ${rupees(d.toPricePaise)}/kWh. You can cancel it at any time.`,
      href: '/broker',
      tone: 'solar',
    });
  }

  if (d.action === 'REPRICE' && d.toPricePaise != null) {
    setState((cur) => ({
      myListings: cur.myListings.map((l) =>
        l.brokerPolicyId === s.policy!.id && l.status === 'OPEN'
          ? { ...l, askPricePaise: d.toPricePaise as number }
          : l,
      ),
    }));
  }

  if (d.action === 'WITHDRAW') {
    setState((cur) => ({
      myListings: cur.myListings.map((l) =>
        l.brokerPolicyId === s.policy!.id && l.status === 'OPEN'
          ? { ...l, status: 'WITHDRAWN' as const }
          : l,
      ),
    }));
  }
}

/* --------------------------------------------------------- demo controls */

export function jumpTo(minutes: number) {
  lastSlotIndex = slotIndexFor(minutes);
  lastBrokerMin = -Infinity;
  lastPriceNoticePaise = null;
  setState({ history: [] });
  applySimMinute(Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, minutes)));
}

export function resetSimulation() {
  clearSlotCache();
  seq = 0;
  lastSlotIndex = -1;
  lastBrokerMin = -Infinity;
  lastPriceNoticePaise = null;
  setState({
    myListings: [],
    myBids: [],
    policy: null,
    decisions: [],
    activity: [],
    notices: [],
    stressedEdges: [],
    history: [],
    playing: true,
  });
  applySimMinute(DEFAULT_START_MIN);
}

export function refreshDerived() {
  applySimMinute(getState().simMinutes);
}

/* --------------------------------------------------------- live transport */

let socket: WebSocket | null = null;
let events: EventSource | null = null;
let retryDelay = 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startLive() {
  setState({ connection: 'connecting' });
  openSocket();
  openEvents();
  void pollRest();
  pollTimer = setInterval(() => void pollRest(), 5000);
}

function closeLive() {
  socket?.close();
  events?.close();
  socket = null;
  events = null;
  if (pollTimer) clearInterval(pollTimer);
}

function openSocket() {
  socket?.close();
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    retryDelay = 1000;
    setState({ connection: 'live', error: null });
  };
  socket.onmessage = (msg) => {
    try {
      const tick = JSON.parse(msg.data as string) as Tick;
      ingestTick(tick);
    } catch {
      // A malformed frame is not a reason to tear down a live market feed.
    }
  };
  socket.onerror = () => {
    setState({
      connection: 'error',
      error: 'Tick stream unavailable. Showing the last received market state.',
    });
  };
  socket.onclose = () => scheduleReconnect();
}

function scheduleReconnect() {
  if (!started || !getState().online) return;
  setState({ connection: 'reconnecting' });
  setTimeout(() => {
    if (started) openSocket();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
}

function ingestTick(tick: Tick) {
  const minutes = clockMinutes(tick.tsSim);
  const slotIndex = slotIndexFor(minutes);
  setState({
    tick,
    market: tick.market,
    simMinutes: minutes,
    speed: tick.speed,
    readings: tick.meters.map((m) => ({
      ...m,
      name: displayName(m.userId),
      shortName: displayName(m.userId),
      panelKw: 0,
      role: m.surplusKw > 0 ? ('PROSUMER' as const) : ('CONSUMER' as const),
    })),
    connection: 'live',
    lastSyncSim: tick.tsSim,
    fromCache: false,
    error: null,
  });
  void saveSnapshot(tick.market, tick.meters);

  if (slotIndex !== lastSlotIndex) {
    lastSlotIndex = slotIndex;
    announcePrice(tick.market);
    void pollRest();
  }
}

function openEvents() {
  events?.close();
  events = new EventSource('/api/events');
  events.onmessage = (msg) => {
    try {
      handleServerEvent(JSON.parse(msg.data as string) as ServerEvent);
    } catch {
      /* ignore malformed frames */
    }
  };
  events.onerror = () => {
    // SSE reconnects itself; surface it without breaking the tick feed.
    setState((s) => (s.connection === 'live' ? { connection: 'reconnecting' } : {}));
  };
}

function handleServerEvent(event: ServerEvent) {
  switch (event.type) {
    case 'market':
      setState({ market: event.data });
      announcePrice(event.data);
      break;
    case 'trade': {
      const s = getState();
      const trade = event.data;
      logActivity({
        tsSim: trade.createdAt,
        channel: 'match',
        text: `${trade.kwh.toFixed(2)} kWh matched at ${rupees(trade.pricePaise)}.`,
      });
      if (trade.sellerId === s.user.id || trade.buyerId === s.user.id) {
        pushNotice({
          tsSim: trade.createdAt,
          title: trade.sellerId === s.user.id ? 'Energy sold' : 'Energy purchased',
          body: `${trade.deliveredKwh.toFixed(2)} kWh at ${rupees(trade.pricePaise)}/kWh.`,
          href: '/ledger',
          tone: 'up',
        });
      }
      break;
    }
    case 'settlement':
      logActivity({
        tsSim: event.data.settledAt,
        channel: 'settlement',
        text: `Settlement confirmed in block ${event.data.blockNumber}.`,
      });
      break;
    case 'broker':
      setState((s) => ({ decisions: [event.data, ...s.decisions].slice(0, 120) }));
      logActivity({
        tsSim: event.data.tsSim,
        channel: 'broker',
        text: brokerActivityLine(event.data),
      });
      break;
    case 'donation':
      logActivity({
        tsSim: event.data.createdAt,
        channel: 'community',
        text: `${event.data.kwh.toFixed(2)} kWh allocated to ${event.data.beneficiaryName}.`,
      });
      break;
    default:
      break;
  }
}

async function pollRest() {
  if (!getState().online) return;
  const results = await Promise.allSettled([
    fetch('/api/listings').then((r) => r.json() as Promise<Listing[]>),
    fetch('/api/bids').then((r) => r.json() as Promise<Bid[]>),
    fetch(`${ENGINE}/grid/topology`).then((r) => r.json()),
  ]);

  const [listings, bids, topology] = results;
  const patch: Partial<AppState> = {};
  if (listings.status === 'fulfilled' && Array.isArray(listings.value)) {
    patch.openListings = listings.value;
  }
  if (bids.status === 'fulfilled' && Array.isArray(bids.value)) patch.openBids = bids.value;
  if (topology.status === 'fulfilled' && topology.value?.nodes) patch.topology = topology.value;

  if (results.every((r) => r.status === 'rejected')) {
    setState({
      connection: 'error',
      error: 'Market service unavailable. Showing the last known market state.',
    });
    return;
  }
  setState(patch);
}

function clockMinutes(iso: string): number {
  const [h, m, sec] = iso.slice(11, 19).split(':').map(Number);
  return (h || 0) * 60 + (m || 0) + (sec || 0) / 60;
}

/** Retry action behind every error state in the UI. */
export function retryConnection() {
  setState({ error: null, connection: USE_MOCKS ? 'live' : 'connecting' });
  if (USE_MOCKS) refreshDerived();
  else {
    openSocket();
    openEvents();
    void pollRest();
  }
}
