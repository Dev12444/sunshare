# Patel Diya Bhaveshkumar — Frontend · PWA & Platform UI

**You own:** `app/sw.ts`, `public/`, `src/mocks/`, `src/lib/offline-store.ts`, and the broker / impact / community / ledger pages.

**Setup**
```bash
npm install
cp apps/web/.env.local.example apps/web/.env.local
npx msw init apps/web/public --save
npm run dev
```

| Hours | Task | Done when |
|---|---|---|
| 0–1 | Types with the team. `manifest.webmanifest` + icon set (192/512/maskable/apple) | Chrome shows the install affordance |
| 1–3 | **Service worker** (`@serwist/next`): precache shell, SWR for GET APIs, network-first for market state, `/offline` fallback | App loads with the network off |
| 3–5 | **Mock layer** — MSW handlers + `fake-ws.ts`. *This unblocks Maansi all day.* | Full UI works with zero backend |
| 5–6.5 | IndexedDB last-known snapshot + custom install prompt | Offline shows real numbers + "as of HH:MM" |
| 6.5–9 | **Broker chat UI** + Agent Activity feed | A goal string produces visible, reasoned decisions |
| 9–12 | **Carbon & badges page** + shareable PNG card | CO₂ counter, tree equivalence, badge grid |
| 12–14 | 💤 nap | |
| 14–16 | **Community Pool** tile, donor leaderboard, beneficiary cards | Robin Hood story is visible in one screen |
| 16–18 | **Ledger / explorer page** — settlements, tx hash → explorer links, optional wallet connect | A real tx hash is clickable |
| 18–20 | **Web Push** (VAPID) + Lighthouse PWA audit | Notification arrives on a real phone; audit green |
| 20–21 | Record the backup demo video. Phone-install rehearsal | Video exists even if everything else dies |

**The closing demo move is yours:** the app already installed on a phone, and a push notification landing live when the broker completes a sale.
