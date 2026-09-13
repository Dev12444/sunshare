# Demo script

**Maansi drives.** Every beat is one API call and is deterministic under
`SIM_SEED=2026` **for a given calendar date** — rehearse on the day and stage
matches rehearsal. The household noise is seeded per slot and the slot id
carries the date, so figures shift by a few paise from one day to the next.
The numbers below are rounded to hold on any day; read exact values off the
screen.

```bash
curl -X POST localhost:8000/sim/scenario -H 'content-type: application/json' \
  -d '{"beat":"midday_surplus"}'
```

`GET /sim/scenario` returns all beats with narration and what to watch for, so
the control strip in the UI can be built straight off it.

## The six beats

| # | Beat | Time | What the screen shows |
|---|---|---|---|
| 1 | `dawn` | 06:00 | Supply 0. Price about ₹5.90, near the ceiling. Everything from the grid. |
| 2 | `morning_ramp` | 08:00 | First trades, roughly half a kWh. Most demand still backfilled. |
| 3 | `midday_surplus` | 12:00 | ~7.4 kWh supply vs ~2.7 kWh demand. Price falls to about ₹3.90. |
| 4 | `local_match` | 12:30 | School served by both rooftops on its own feeder (U-01 ~1 kWh, U-02). ~99.45% efficient, ~0.3 ms. |
| 5 | `congestion` | 12:30 | **U-01 drops ~1 kWh → 0.** U-04 routes in at 97.9%. Efficiency ~99.45→~99.0%, price ~₹3.90→~₹4.30. |
| 6 | `evening_peak` | 19:30 | Supply 0, ~23 kW demand, price back up to about ₹5.97. The gap storage would fill. |

Beats are order-independent — jumping out of `congestion` clears the congested
line automatically, so you can re-run any beat in any order. There is a test
for exactly this.

## Why beat 5 is the one that matters

It is the difference between a scoring heuristic and a physical model. The
congested line is not *penalised*, it is **full** — the flow cannot pass, so the
solver re-allocates to a seller on another feeder. The school still gets its
electricity, but over a longer path, at lower efficiency and a higher price.
That is transmission cost made visible, and it is the argument for why local
matching is worth doing at all.

## The AI broker

Type a goal into the broker chat, verified live against OpenAI:

| You type | It produces |
|---|---|
| "Maximize my profit" | `MAX_PROFIT`, ₹2.15–₹6.50 |
| "Sell fast before sunset but never below 4.50" | `SELL_FAST`, floor held at **₹4.50** |
| "Give 15% to the local school and keep 2 kWh for tonight" | `MAX_COMMUNITY`, 15% donated, 2 kWh reserved |

~2.2 s per call. The model is asked **once**, when the goal is typed. The
per-slot executor that actually moves the price is ordinary deterministic code
with no model call — which is both why it is fast and why it is safe.

**If asked "what if the AI goes wrong?":** it cannot set a price outside the
corridor, cannot sign, cannot settle, and cannot choose a counterparty. Its
entire output is one validated policy object. We test this by feeding it a
deliberately hostile response — invalid enum, prices at ±10⁹, urgency 47,
negative reserve — and asserting nothing escapes its bounds.

**If the network dies mid-demo:** the broker falls back to a rule-based parser
and keeps working. Every engine test passes with no API key at all.

## Pitch division

| Speaker | Segment |
|---|---|
| Dev | Problem, the price corridor, the intelligence layer |
| Maansi | Live product walkthrough (drives beats 1–6) |
| Rahi | What is on chain vs. off chain, and why |
| Diya | AI broker, community impact, PWA on a real phone |

## Judge Q&A — prepared answers

**Why not put matching on chain?** It is a min-cost max-flow over a grid graph.
On chain it would be expensive and pointless. What goes on chain is what needs
to be tamper-evident: the per-slot order-book commitment and the settlement.

**What stops the AI agent selling at a bad price?** It never sets a price. It
emits a policy whose bounds are clamped into the corridor; deterministic code
does the rest. See above.

**How is this different from net metering?** Net metering pays you the feed-in
tariff regardless of who uses the energy. We clear between the feed-in and
retail tariffs, so both sides beat the grid, and we route to the electrically
nearest buyer so less is lost in transit.

**What happens when the grid is congested?** Beat 5. Show it.

**Where do your numbers come from?** Grid emission factor from the CEA CO₂
Baseline Database; T&D losses ~17%. **Tariffs are illustrative and labelled as
such** — they must be re-derived against the actual state DISCOM tariff order.
We are explicit about this rather than pretending otherwise.

**What breaks when you move to real smart meters?** The simulator is behind one
interface — `Tick`. Real meter data enters at the same point. What would need
real work is metering-grade settlement, DISCOM integration, and the regulatory
pathway, none of which is a 24-hour problem.
