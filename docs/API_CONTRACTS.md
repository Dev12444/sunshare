# API contracts

Source of truth is `packages/shared/src/types.ts`. This file is the human-readable
index of who serves what. **If a mock and a real endpoint disagree, the type
treaty wins and the mock gets fixed.**

## Engine — Dev, `http://localhost:8000`

| Method | Path | Returns | Hours |
|---|---|---|---|
| GET | `/health` | `{ status, simSpeed, seed }` | H0 |
| WS | `/ws` | `Tick` stream, ~1/s | H1–H4 |
| GET | `/market/state` | `MarketState` | H4 |
| POST | `/match` | `MatchResult` ← `MatchRequest` | H9–H11.5 |
| POST | `/broker/policy` | `BrokerPolicy` ← `{ userId, goal }` | H13–H15 |
| POST | `/broker/step` | `BrokerDecision` | H13–H15 |
| GET | `/carbon/{userId}` | `CarbonSummary` | H11.5 |
| GET | `/grid/topology` | `GridTopology` | H6.5 |
| POST | `/sim/control` | demo controls: `speed`, `jumpToHour`, `congestEdge` | H19 |

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
| GET | `/api/carbon` | `CarbonSummary` + `Badge[]` | H17 |
| GET/POST | `/api/community` | `Beneficiary[]`, `CommunityDonation[]` | H17 |
| POST | `/api/push` | store subscription / send notification | H17 |

## Transport split — decided at H0, do not relitigate

- **Ticks** go browser ← engine WebSocket, directly. Not proxied through Next.
- **Everything else** goes browser ← Next SSE (`/api/events`).

Service workers do not intercept WebSocket traffic, so PWA caching never
interferes with live ticks. Offline rendering comes from IndexedDB instead.
