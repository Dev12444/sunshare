# SunShare — Product Requirements Document

**Status:** outline committed at H0; sections filled through the build round.
**Owner:** Dev Patel · **Team:** Null Pointers · **Round:** HackOut'26 build phase

> Every requirement traces to an owner and an hour block in [`../WORKFLOW.md`](../WORKFLOW.md).

## 1. Problem & opportunity
Surplus rooftop solar is exported at a low feed-in tariff while a neighbour pays
a high retail tariff for the same electricity. The gap between those two numbers
is the entire economic opportunity.
> TODO: restate the Phase 1 framing with the illustrative figures.

## 2. Goals & non-goals
**Goals:** local matching, fair dynamic pricing, congestion awareness, auditable
settlement, and a product an ordinary household can actually operate.

**Non-goals — stated explicitly so nobody assumes otherwise:** physical
electricity delivery, live DISCOM integration, real money movement,
production-grade security, and real smart-meter hardware. All meter data is
simulated and labelled as such in the UI.

## 3. Personas & jobs to be done
Prosumer · Consumer · DISCOM operator · Regulator — the four seeded accounts.
> TODO.

## 4. User stories (Given / When / Then)
Epics: Onboarding · Listing · Bidding · Matching · Settlement · Broker ·
Community · Impact · Install & Offline.
> TODO.

## 5. Functional requirements
`FR-n`, each tagged `[P0]` / `[P1]` / `[P2]` matching the cut-list, with owner
and checkpoint.
> TODO.

## 6. The market mechanism
15-minute slots · uniform-price double auction · **the price corridor
invariant** · DISCOM wheeling charge · settlement pro-rata on *delivered* kWh
with grid backfill.
> TODO: write this one out fully — it is the section judges will probe.

## 7. Feature specifications
One per differentiator, each with behaviour, inputs/outputs, edge cases, and its
demo-safe fallback. See `WORKFLOW.md` for the condensed versions.
> TODO.

## 8. PWA requirements
Installability criteria · offline behaviour per screen · cache strategy per
route · push notification triggers and payloads · Lighthouse targets.
> TODO.

## 9. Data model & API surface
See [`API_CONTRACTS.md`](./API_CONTRACTS.md) and `apps/web/prisma/schema.prisma`.

## 10. Non-functional requirements
Tick latency budget · match under 500 ms at demo graph size · determinism under
a fixed seed · graceful degradation of every external dependency.
> TODO.

## 11. Trust, safety & guardrails
The AI broker's blast radius: it emits a schema-validated `BrokerPolicy` and
nothing else. It is never a signer, never settles, never moves money. Its price
bounds are clamped into the corridor before the executor runs, and every
decision is logged with a human-readable reason.
> TODO: expand.

## 12. Success metrics
> TODO.

## 13. Assumptions, risks, open questions
- ⚠️ **All tariff figures are illustrative.** They must be re-derived against
  the team's actual state DISCOM tariff order before any use beyond the
  hackathon.
- Emission factors come from the CEA CO₂ Baseline Database; cite the edition.
- The grid model is a simplified radial tree, not a load-flow simulation.

## 14. Out of scope / v2
Real meter integration · regulatory pathway · multi-DISCOM · battery and EV
loads · settlement in real currency.
