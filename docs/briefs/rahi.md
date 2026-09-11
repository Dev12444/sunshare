# Patel Rahi Rohitbhai — Backend · Platform & Chain

**You own:** `apps/web/src/app/api/`, `apps/web/prisma/`, `contracts/`. Do not edit `app/(dash)` or `services/engine`.

**Setup**
```bash
npm install
npm run db:push --workspace=@sunshare/web
npm run db:seed --workspace=@sunshare/web
npm run node --workspace=@sunshare/contracts   # terminal 2
```

| Hours | Task | Done when |
|---|---|---|
| 0–1 | Types with the team. Neon project created, Prisma init | `DATABASE_URL` works for everyone |
| 1–3.5 | `schema.prisma` + migrations + deterministic seed | 4 roles, 8 meters, grid tree, 3 beneficiaries in the DB |
| 3.5–5 | REST: `/api/meters`, `/api/listings`, `/api/bids`, `/api/market` + role-switcher session | Postman round-trips every route |
| 5–6 | SSE `/api/events` | Browser receives a `ServerEvent` frame |
| **6–6.5** | **CP1 smoke integration with the frontend pair** | One real endpoint renders in the real UI |
| 6.5–10.5 | `EnergyEscrow.sol` + `CommunityPool.sol` + tests + deploy + **ABI export** | `hardhat test` green; ABIs in `packages/shared/src/abis` |
| 10.5–13 | ethers v6 relayer, nonce queue, `/api/settle` | A trade settles and returns a real tx hash |
| 13–15 | Trade orchestrator: slot tick → `/match` → persist → settle | One slot runs unattended end-to-end |
| 15–17 | 💤 nap | |
| 17–19 | Carbon ledger, badges, leaderboard, community donations, regulator CSV | `/api/carbon` and `/api/community` return real data |
| 19–21 | Deploy: Vercel + Render + Neon + Amoy. Local-chain fallback mode | The deployed URL does a full trade |

**Corridor is enforced in the contract too** — not just in Dev's engine. A contract that trusts its caller is not enforcing an invariant.

**Your pitch segment:** the transparency layer — what is on chain, what is off chain, and why that split is the right one.
