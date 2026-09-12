# Deploy — Rahi, H19–H21

Four pieces: Neon (database), Render (engine), Vercel (web), Polygon Amoy
(chain). Do them in that order — each one produces a value the next needs.

The local-chain fallback means step 4 can be skipped entirely and the demo
still settles; see the cut-list. Skipping it costs a real explorer link, not a
working product.

## 1. Neon — already live

Project `sunshare` (`divine-hill-57221033`, `aws-ap-southeast-1`). The
`DATABASE_URL` is the pooled connection string from the Neon console.

```bash
npm run db:push --workspace=@sunshare/web
npm run db:seed --workspace=@sunshare/web
```

The seed reads `services/engine/data/grid.json` and `households.json`, so it
must run from a checkout that has the engine's data files — not from the web
app alone.

## 2. Render — engine

`render.yaml` at the repo root is a blueprint; point Render at the repo and it
picks the service up. Set `ALLOWED_ORIGINS` to the Vercel URL once step 3 gives
you one, otherwise the browser's WebSocket upgrade is refused.

**Python must be 3.11.** `pydantic-core==2.27.2` has no wheel for 3.13+, and the
source build needs Rust, so a newer runtime fails at install time.

Free-tier instances sleep when idle and take ~30s to wake. Hit `/health` a few
minutes before demoing.

## 3. Vercel — web

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Build command | `npm run build` (runs `prisma generate` first) |
| Install command | `npm install` from the repo root (workspaces) |

Environment variables:

```
DATABASE_URL                     Neon pooled connection string
SESSION_SECRET                   openssl rand -hex 32
NEXT_PUBLIC_ENGINE_URL           https://sunshare-engine.onrender.com
NEXT_PUBLIC_ENGINE_WS            wss://sunshare-engine.onrender.com/ws
NEXT_PUBLIC_USE_MOCKS            false
NEXT_PUBLIC_CHAIN_EXPLORER       https://amoy.polygonscan.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY     from web-push generateVAPIDKeys
VAPID_PRIVATE_KEY                from the same keypair
VAPID_SUBJECT                    mailto:...
RPC_URL                          https://rpc-amoy.polygon.technology
CHAIN_ID                         80002
RELAYER_PRIVATE_KEY              funded demo wallet, never a real key
ESCROW_ADDRESS                   from step 4
COMMUNITY_POOL_ADDRESS           from step 4
```

`wss://` not `ws://` — a secure page cannot open an insecure socket, and the
failure is silent in some browsers.

## 4. Amoy — contracts

```bash
export RPC_URL=https://rpc-amoy.polygon.technology
export RELAYER_PRIVATE_KEY=0x...
npm run deploy:amoy   --workspace=@sunshare/contracts
npm run export-abi    --workspace=@sunshare/contracts
```

Fund the relayer from the Polygon faucet first; settlement is the only thing
that spends gas and it is a few cents per trade.

Paste both addresses into Vercel, then redeploy so the new env is picked up.

**Fallback:** set `RPC_URL=http://127.0.0.1:8545` and `CHAIN_ID=31337` to go back
to a local Hardhat node. If the chain is unreachable entirely, settlement still
succeeds and is recorded with `mode: "simulated"` and labelled as such in the
UI — the demo degrades rather than breaking.

## Smoke test after deploying

```bash
curl https://sunshare-engine.onrender.com/health
curl https://<app>.vercel.app/api/market
curl -X POST https://<app>.vercel.app/api/slot/run
```

A slot run that reports `matched: true` with a non-zero `tradesSettled` means
all four pieces are talking to each other.

## Known limitation

`/api/events` fans out through an in-process bus, so it only reaches clients
connected to the same instance. Fine for one demo server; a multi-instance
deployment needs Redis pub/sub behind `lib/bus.ts`.
