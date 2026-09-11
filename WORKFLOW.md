# SunShare — 24-Hour Build Workflow

Team **Null Pointers** · HackOut'26 · Renewable Energy Intelligence

Two pairs working independently, integrating in a defined window near the end.
Your own short brief lives in [`docs/briefs/`](./docs/briefs) — read that first,
come back here for the schedule and the checkpoints.

## Pair structure & ownership

### Backend pair

| Member | Lane | Owns |
|---|---|---|
| **Dev Patel** | Intelligence | `services/engine` (FastAPI): simulator, pricing, matching, grid model, AI broker, carbon math |
| **Patel Rahi Rohitbhai** | Platform & Chain | Prisma/Neon schema, Next.js API routes, SSE, trade orchestrator, Solidity contracts, ethers relayer, deployment |

### Frontend pair

| Member | Lane | Owns |
|---|---|---|
| **Maansi Soni** | Core UI | Design system, app shell, dashboards, marketplace, charts, map, responsive & polish |
| **Patel Diya Bhaveshkumar** | PWA & Platform UI | Service worker, offline store, install prompt, push, mock layer, broker chat, carbon page, ledger explorer |

**Hard boundary:** backend owns `services/engine/`, `src/app/api/`, `prisma/`, `contracts/`.
Frontend owns `src/app/(dash)/`, `src/components/`, `src/mocks/`, `public/`, `app/sw.ts`.
`packages/shared/types.ts` is written **once at H0 by all four together** and changed only by announced
agreement — it is the treaty between the pairs.

---

## Architecture

```
apps/web          Next.js 15 App Router + TS + Tailwind + shadcn/ui + Recharts + react-leaflet
                  ├─ src/app/api/*     Rahi   — REST + SSE + settle + push
                  ├─ src/app/(dash)/*  Maansi — pages & dashboards
                  ├─ src/mocks/*       Diya   — MSW handlers + fake WS tick emitter
                  └─ app/sw.ts, public/manifest.webmanifest   Diya — PWA
services/engine   FastAPI + Python 3.11   Dev  — WS tick stream + /price /match /broker /carbon
contracts/        Hardhat + Solidity      Rahi — EnergyEscrow.sol, CommunityPool.sol
packages/shared   TS types + exported ABIs — the contract between all four
```

Two thin seams: the browser opens **one WebSocket straight to FastAPI** for live ticks (service workers
don't intercept WS, so PWA caching is unaffected), and Next.js calls FastAPI over HTTP for
pricing/matching. Settlement goes Next.js → ethers relayer → chain, so users never need MetaMask —
wallet-connect is an optional read-only garnish.

DB **Neon Postgres + Prisma**. Chain: **local Hardhat node** in development, **Polygon Amoy** for the live
demo via a funded relayer; local node is the hot fallback.

**No real auth.** A role switcher over four seeded accounts (prosumer / consumer / DISCOM / regulator) with
a signed cookie. Saves ~2.5h and no judge will ask.

---

## Feature specs

**#4 Live smart-meter simulator** *(Dev, H1–H4 — built first; everything blocks on it)*
Clear-sky irradiance from true solar position (declination + hour angle + zenith) × panel kW × cloud factor
from **Open-Meteo** (free, no API key, gives `cloud_cover` and `shortwave_radiation`). Consumption =
archetype base load + morning/evening peaks + seeded noise. Emits `tick` over WebSocket; `SIM_SPEED` makes
1 real second = 1 sim minute (full solar day in 24 min) with jump-to-hour for the demo. Deterministic seed
⇒ reproducible pitch. *Fallback:* synthetic bell curve if Open-Meteo is down.
**Handoff at H4:** `fixtures/ticks.json` + tick schema → Diya's mock layer.

**Pricing** *(Dev, H4–H7)* — uniform-price double auction on 15-min slots: asks ascending, bids descending,
clear at the crossing; clamp into the corridor `[feed-in, retail]`; deduct DISCOM wheeling. Interpretable
in one slide.

**#2 Proximity-weighted matching** *(Dev, H7–H11.5)*
Grid as a real graph — nodes are houses/feeders/substations, edges carry length and capacity. Transmission
efficiency `η = 1 − α·d`, hop-tiered (same-feeder 0.5%, same-substation 2%, cross-substation 5%). Matching
is **min-cost max-flow** over the bipartite seller→buyer graph, cost in paise/kWh =
`−surplus_value + loss_penalty + congestion_penalty`. Congestion isn't bolted on — line capacity *is* edge
capacity in the flow network, so it falls out of the formulation. Hand-rolled MCMF (successive shortest
paths with Johnson potentials, ~80 lines) for the DSA showcase, cross-checked in tests against
`networkx.max_flow_min_cost`.

**#1 Agentic AI Energy Broker** *(Dev, H13–H16 — highest risk, scoped down)*
User types a goal ("sell fast before sunset, never below ₹4.50"). Claude (`claude-sonnet-5`) with a
**structured tool schema** returns a validated `BrokerPolicy` — `{objective, min_price, max_price, urgency,
reserve_kwh, community_donation_pct, valid_until, rationale}`. A **deterministic executor** then adjusts
the ask each slot. The LLM never signs, never moves money; its output is schema-validated and clamped to
the corridor before anything happens. Every decision is logged with its reason into an **Agent Activity
feed** — that feed is the judge-facing artifact. *Fallback:* keyword parser mapping to four preset policies
if the API errors. Direct Anthropic SDK rather than LangChain — same result, fewer moving parts.

**#3 Robin Hood community pool** *(Rahi contracts H6.5–H10.5, Diya UI H14–H16)*
`CommunityPool.sol`: prosumers set `donationBps` and a daily-generation threshold; once crossed, settlement
routes that share of kWh to a **verified beneficiary registry** (school, streetlights, low-income
household) at zero or feed-in price. Registry writes gated to the DISCOM/regulator role. UI: Community
Impact tile + donor leaderboard + beneficiary cards.

**#5 Gamified carbon tracking** *(Dev math H11.5–H12.5, Rahi ledger H17–H19, Diya UI H9–H12)*
`(0.71 − 0.04) kgCO₂/kWh` (CEA CO₂ Baseline Database grid factor vs. solar lifecycle), uplifted by avoided
T&D loss. Tree equivalence at 21 kg CO₂/tree/year. Badges: First Trade, 10 kWh Local, Sun Baron,
Neighbourhood Hero, Carbon Century. Shareable PNG card via canvas.

**#6 PWA** *(Diya, threaded through the day)*
- `manifest.webmanifest`, icon set (192 / 512 / maskable / apple-touch), `theme-color`, standalone display
- **Service worker** via `@serwist/next` (Workbox): precache app shell, stale-while-revalidate for GET
  APIs, network-first for market state, dedicated offline fallback page
- **IndexedDB last-known-market-state** so the dashboard renders real numbers with an "offline — as of
  HH:MM" banner instead of a blank screen
- **Custom install prompt** on `beforeinstallprompt` — "Add SunShare to Home Screen"
- **Web Push** (VAPID): *"Your agent sold 3 kWh at ₹5.20"*, *"Community pool received 0.4 kWh"*
- Verified by **Lighthouse PWA audit green** (installable + offline-capable)

The closing demo move: the app is already installed on a phone, and a push notification arrives live on
screen when the AI broker completes a sale.

---

## The 24-hour grid

`H0` = build start. 💤 = nap; the rotation guarantees **at least one member of each pair is awake at all
times**, and nobody merges into a sleeping member's file area.

| Hour | Dev — Intelligence | Rahi — Platform & Chain | Maansi — Core UI | Diya — PWA & Platform UI |
|---|---|---|---|---|
| **0–1** | **ALL FOUR: write `packages/shared/types.ts` together, freeze it, scaffold pushed, everyone's stack boots** ||||
| 1–3 | simulator: solar position, Open-Meteo, load profiles | Neon + Prisma schema, migrations, seed | app shell, routing, role switcher, tokens | manifest, icons, **service worker** |
| 3–4 | WS tick loop, SIM_SPEED, **→ publish `fixtures/ticks.json`** | REST: meters / listings / bids / market-state | prosumer dashboard skeleton | **mock layer**: MSW + fake WS emitter |
| 4–6 | pricing: double auction + corridor + wheeling | role-switcher session, SSE `/api/events` | live tiles + solar-day chart (on mocks) | IndexedDB offline store, install prompt |
| **6–6.5** | **CP1 — SMOKE INTEGRATION (30 min, all four): one real endpoint + one real tick rendering in the real UI. Then pairs separate again.** ||||
| 6.5–9 | grid graph + MCMF matching | **`EnergyEscrow.sol` + `CommunityPool.sol` + tests** | marketplace, order book, bid flow | broker chat UI + Agent Activity feed |
| 9–11.5 | `/match` endpoint, tests vs networkx | deploy scripts, **ABI export → shared** | Local Energy Map (leaflet) | carbon & badges page + shareable card |
| 11.5–13 | carbon math, `/carbon/summary` | ethers relayer, nonce queue, `/api/settle` | consumer + utility/regulator views | 💤 |
| **13** | **CP2 — each pair independently demo-able: backend runs a trade end-to-end via Postman; frontend fully clickable on mocks** ||||
| 13–15 | **AI broker**: policy → executor → decision log | trade orchestrator: slot → match → persist → settle | 💤 | community impact tile + leaderboard |
| 15–17 | broker fallback parser, tuning · 💤 17→ | 💤 | 💤 16→ integration prep | ledger / explorer page + wallet connect |
| **16–20** | **🔗 INTEGRATION WINDOW — mocks off, real endpoints on (checklist below)** ||||
| 17–19 | 💤 | carbon ledger, badges, leaderboard, regulator CSV | swap mocks → live, fix contract drift | **Web Push (VAPID)** + Lighthouse green |
| 19–20 | demo scenario: seeded congestion event | **deploy**: Vercel + Render + Neon + Amoy, env wiring | polish: motion, skeletons, errors, 390px, a11y | backup demo video, phone-install rehearsal |
| 20–21 | dry-run, tune coefficients | hardening, demo seed data, local-chain fallback | demo theming, final pass | final Lighthouse + install check |
| **21** | **🧊 FREEZE — no merges. Only bugs that break the demo path.** ||||
| 21–23 | rehearse ×3 · slides · judge Q&A drill (all four) ||||
| 23–24 | buffer + submit ||||

**Checkpoints:** CP0 H1 types frozen · CP1 H6 smoke integration · CP2 H13 each pair self-demoable ·
CP3 H18 real end-to-end trade in the real UI · FREEZE H21.

**Git:** one repo, `feat/<name>/<topic>` branches, merge to `main` **only at checkpoints**. File-area
ownership decides conflicts. No force-push.

---

## Integration window checklist (H16–H20, in this exact order)

1. Point `NEXT_PUBLIC_ENGINE_WS` at the real FastAPI socket — confirm ticks render (Maansi + Dev)
2. Disable MSW behind `NEXT_PUBLIC_USE_MOCKS=false` — one flag, instantly reversible (Diya)
3. Marketplace reads real listings/bids (Maansi + Rahi)
4. Place a real bid → orchestrator → `/match` → DB (all four watching)
5. Settlement fires → tx hash appears on the ledger page (Rahi + Diya)
6. Broker chat → real policy → visible decision in the Activity feed (Dev + Diya)
7. Carbon + community tiles read the real ledger (Diya + Rahi)
8. Service worker revalidated against live API shapes; re-run Lighthouse (Diya)

**Rollback rule:** if any step isn't green within 30 minutes, flip that surface back to mocks and move on.
A demo that shows one mocked tile beats a demo that doesn't load.

---

## Inter-member contracts (written as code at H0)

`packages/shared/types.ts`, mirrored by Pydantic models in `services/engine/app/models.py`:

- `Tick`, `MeterReading`, `MarketState` — Dev → everyone
- `MatchRequest` / `MatchResult{ pairs[], clearing_price, efficiency_score, losses_kwh }` — Dev ↔ Rahi
- `BrokerPolicy`, `BrokerDecision` — Dev → Diya
- `TradeRecord`, `SettlementReceipt{ txHash, blockNumber, wheelingFee }` — Rahi ↔ Diya
- `CarbonSummary`, `Badge`, `CommunityDonation` — Rahi → Diya
- `PushSubscription`, `NotificationPayload` — Diya ↔ Rahi
- Exported ABIs — Rahi → Diya

Tables: `users, meters, grid_nodes, grid_edges, ticks, listings, bids, market_slots, matches, trades,
settlements, broker_policies, broker_decisions, carbon_ledger, badges, beneficiaries, donations,
push_subscriptions`.

---

## Cut-list (kill in this order — agreed at H0, no debate at H20)

1. 2-hour generation forecast → 2. per-slot Merkle root → 3. Polygon Amoy deploy (fall back to local chain)
→ 4. web push → 5. wallet connect → 6. shareable carbon PNG → 7. animated map flows → 8. regulator CSV.

**Never cut:** simulator, pricing, matching, one working on-chain settlement, prosumer dashboard,
PWA installability (manifest + service worker are cheap and it's a promised feature).

---

