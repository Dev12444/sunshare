# API contracts

Source of truth is `packages/shared/src/types.ts`. This file is the human-readable
index of who serves what. **If a mock and a real endpoint disagree, the type
treaty wins and the mock gets fixed.**

## Engine — Dev, `http://localhost:8000`

All **DELIVERED** and covered by 106 tests. Base URL `http://localhost:8000`.

| Method | Path | Returns | Status |
|---|---|---|---|
| GET | `/health` | `{ status, simSpeed, seed, simTime, slotId, brokerLlm }` | ✅ |
| WS | `/ws` | `Tick` stream, one per second | ✅ |
| GET | `/market/state` | `MarketState` | ✅ |
| GET | `/meters` | `MeterReading[]` | ✅ |
| POST | `/match` | `MatchResult` ← `MatchRequest` | ✅ |
| POST | `/broker/policy` | `BrokerPolicy` ← `{ userId, goal }` | ✅ |
| POST | `/broker/step` | `BrokerDecision` ← `{ policy, listing? }` | ✅ |
| GET | `/carbon/{userId}?local_kwh=` | `CarbonSummary` | ✅ |
| GET | `/grid/topology` | `GridTopology` | ✅ |
| POST | `/sim/control` | `{ speed?, jumpToHour?, congestEdge?, clearCongestion? }` | ✅ |

**Rahi — two things that will bite otherwise:**

1. **Fetch `/grid/topology` fresh immediately before every `/match`.** It carries
   the live per-edge loads, and that is how congestion reaches the matcher. A
   cached topology silently disables the congestion demo.
2. **The engine is stateless about trades.** It never persists a listing, bid or
   trade — your database owns all of that. `/match` is a pure function of the
   body you send it, and `/carbon` takes the traded total as a query parameter.

Worked example of a full slot is in `services/engine/README.md`.

## Platform — Rahi, `/api/*`

| Method | Path | Returns | Hours |
|---|---|---|---|
| GET/POST | `/api/session` | `User` — role switcher, no real auth | H4 |
| GET | `/api/meters` | `MeterReading[]` | H3.5 |
| GET/POST | `/api/listings` | `Listing[]` | H3.5 |
| GET/POST | `/api/bids` | `Bid[]` | H3.5 |
| GET | `/api/market` | `MarketState` | H3.5 |
| GET | `/api/events` | SSE `ServerEvent` — everything except ticks | H5 |
| POST | `/api/settle` | `SettlementReceipt` | H10.5 |
| POST | `/api/slot/run` | runs one slot: broker → commit → `/match` → trades → settle → donations → badges | H13 |
| GET/POST | `/api/broker` | `BrokerPolicy` + the Agent Activity feed | H13 |
| GET | `/api/regulator/export` | CSV, `?dataset=trades\|donations` — DISCOM/regulator only | H17 |
| GET | `/api/trades` | `TradeRecord[]` + settlement — `?limit=&slotId=&userId=` | H17 |
| GET | `/api/slots` | cleared slots with price, volume, CO₂ — `?limit=` | H17 |

**Frontend — history does not arrive over SSE.** `/api/events` only carries what
happens while a client is listening, so the ledger, impact page and price charts
must backfill from `/api/trades` and `/api/slots` on mount, then subscribe.
Without that they are empty on load and lose everything on refresh.
| GET | `/api/carbon` | `CarbonSummary` + `Badge[]` | H17 |
| GET/POST | `/api/community` | `Beneficiary[]`, `CommunityDonation[]` | H17 |
| POST | `/api/push` | store subscription / send notification | H17 |

## Transport split — decided at H0, do not relitigate

- **Ticks** go browser ← engine WebSocket, directly. Not proxied through Next.
- **Everything else** goes browser ← Next SSE (`/api/events`).

Service workers do not intercept WebSocket traffic, so PWA caching never
interferes with live ticks. Offline rendering comes from IndexedDB instead.
