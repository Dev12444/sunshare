# Maansi Soni — Frontend · Core UI

**You own:** `apps/web/src/app/(dash)/`, `src/components/`. Do not edit `src/app/api` or `services/engine`.

**Setup — you need no backend at all**
```bash
npm install
cp apps/web/.env.local.example apps/web/.env.local   # NEXT_PUBLIC_USE_MOCKS=true
npm run dev
```
`useTicks()` gives you live moving numbers from Diya's mock emitter. Build everything against that.

| Hours | Task | Done when |
|---|---|---|
| 0–1 | Types with the team. Tailwind + shadcn + design tokens | `npm run dev` boots |
| 1–3 | App shell: nav rail + mobile bottom tabs, role switcher, loading/empty patterns | All 9 routes reachable |
| 3–6 | **Prosumer dashboard** — generation / consumption / surplus / earnings tiles + solar-day area chart | Numbers move on their own |
| **6–6.5** | **CP1 smoke integration** | One real endpoint renders |
| 6.5–9.5 | **Marketplace** — offers, price + proximity filters, bid sheet, order book, clearing-price chart | A bid can be placed end-to-end on mocks |
| 9.5–12.5 | **Local Energy Map** — react-leaflet, nodes sized by load, edges coloured by congestion, trade flow lines | A congested feeder visibly turns amber/red |
| 12.5–14 | Consumer dashboard + DISCOM/regulator views | Every role has a real screen |
| 14–16 | 💤 nap | |
| 16–18 | **Integration window** — mocks off, real endpoints on | Real data in every view |
| 18–20 | Polish: motion, skeletons, error states, 390px, contrast | Nothing looks broken on a phone |
| 20–21 | Demo theming, final pass | |

**Mobile first.** This ships as an installable PWA — the judges will see it on a phone.

**You drive the live demo.** Rehearse the click path until it is muscle memory.
