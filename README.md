# ☀️ SunShare

**Peer-to-peer rooftop solar marketplace** — HackOut'26, Team **Null Pointers**.
Theme: Renewable Energy Intelligence.

**▶ Live demo: https://sunshare-web.onrender.com** · engine:
[`/health`](https://sunshare-engine.onrender.com/health)

> Both run on Render's free plan and sleep after ~15 minutes idle — the first
> request takes ~30s to wake them. Sign in with any of the four demo accounts
> below; no password is checked.

Surplus rooftop solar is exported to the grid at a low feed-in tariff while the
neighbour two houses away pays a high retail tariff for the same electricity.
SunShare closes that gap: a local marketplace that matches surplus to nearby
demand, prices it fairly, routes it over the shortest electrical path, and
settles it transparently.

**The core invariant — the price corridor:**

```
feed-in tariff  ≤  cleared price  ≤  retail tariff
```

Above the floor, the seller beats exporting to the grid. Below the ceiling, the
buyer beats importing from it. Nobody can ever be worse off than not trading.
The DISCOM keeps a wheeling charge on every traded unit, so the utility is a
partner rather than something we route around.

---

## Team & lanes

| Member | Lane | Owns |
|---|---|---|
| **Dev Patel** | Backend · Intelligence | `services/engine` — simulator, pricing, matching, AI broker, carbon |
| **Patel Rahi Rohitbhai** | Backend · Platform & Chain | `apps/web/src/app/api`, `prisma/`, `contracts/`, relayer, deploy |
| **Maansi Soni** | Frontend · Core UI | `app/(dash)` pages, design system, dashboards, marketplace, map |
| **Patel Diya Bhaveshkumar** | Frontend · PWA & Platform UI | service worker, offline store, push, mocks, broker chat, impact, ledger |

Full hour-by-hour plan: [`WORKFLOW.md`](./WORKFLOW.md) · Product spec: [`docs/PRD.md`](./docs/PRD.md)
· Your own brief: [`docs/briefs/`](./docs/briefs)

**File-area ownership decides merge conflicts.** `packages/shared/src/types.ts`
is the treaty between the pairs — change it only by announced agreement.

---

## Quick start

```bash
git clone <this repo> && cd sunshare
npm install
cp .env.example .env
```

### Frontend pair — works with zero backend running

```bash
cp apps/web/.env.local.example apps/web/.env.local   # NEXT_PUBLIC_USE_MOCKS=true
npm run dev
```

MSW intercepts every API call and a fake emitter replays recorded ticks, so the
whole UI is live and clickable without Dev's engine or Rahi's database.
Flipping `NEXT_PUBLIC_USE_MOCKS=false` is the entire integration switch.

The app opens on a sign-in page. **There is no credential store and no password
is checked** — the screen says so in plain words. Pick any of the four seeded
accounts to land in that role:

| Role | Email |
|---|---|
| Prosumer (start here) | `anita.patel@sunshare.demo` |
| Consumer | `rakesh.trivedi@sunshare.demo` |
| DISCOM | `operations@guvnl.demo` |
| Regulator | `oversight@gerc.demo` |

### Checks

```bash
npm run lint      --workspace=@sunshare/web   # eslint, flat config
npm run typecheck --workspace=@sunshare/web   # tsc --noEmit
npm run build     --workspace=@sunshare/web   # production build
( cd services/engine && pytest )              # 220 tests
npm test --workspace=@sunshare/contracts      # 17 tests
```

### Dev — engine

```bash
cd services/engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # docs at /docs, ticks at /ws
pytest
```

### Rahi — database & chain

```bash
npm run db:push  --workspace=@sunshare/web
npm run db:seed  --workspace=@sunshare/web

npm run node --workspace=@sunshare/contracts          # local chain, terminal 2
npm run deploy:local --workspace=@sunshare/contracts
npm run export-abi   --workspace=@sunshare/contracts  # ABIs -> packages/shared
```

---

## Architecture

```
Browser (PWA)
   │  WebSocket ─────────────────────────► services/engine  (FastAPI, Dev)
   │     live ticks                            simulator · pricing · MCMF matching
   │                                           AI broker · carbon
   │  HTTP/SSE ──────────────────────────► apps/web/src/app/api  (Next.js, Rahi)
                                               orchestrator · Prisma/Neon
                                                     │
                                                     ▼  ethers relayer
                                               contracts/  (Solidity, Rahi)
                                               EnergyEscrow · CommunityPool
```

Matching runs **off chain** — it is a min-cost max-flow over a grid graph, which
would be pointless and expensive on chain. What goes on chain is what needs to
be tamper-evident: the per-slot order-book commitment and the settlement.

## Features

1. **Agentic AI Energy Broker** — plain-language goals ("sell fast before
   sunset, never below ₹4.50") become a schema-validated policy a deterministic
   executor acts on. The model never signs, never settles, never touches money.
2. **Proximity-weighted matching** — min-cost max-flow where line capacity *is*
   edge capacity, so congestion is modelled honestly rather than bolted on.
3. **Robin Hood community pool** — route the tail of a good solar day to a
   verified school, streetlight circuit, or low-income household.
4. **Live smart-meter simulator** — real solar geometry × live Open-Meteo cloud
   cover, seeded so every demo run is identical.
5. **Gamified carbon tracking** — CO₂ avoided per local kWh, tree equivalence,
   badges.
6. **PWA** — installable, offline-capable, with push notifications.

> ⚠️ All tariff and emission figures are **illustrative** and labelled as such
> in the UI. Re-derive them against the actual state DISCOM tariff order before
> any use beyond the hackathon. All meter data is **simulated** — nothing here
> is presented as live utility data.

---

## License

[MIT](./LICENSE) © 2026 Team Null Pointers.
