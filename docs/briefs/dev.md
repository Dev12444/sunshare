# Dev Patel — Backend · Intelligence

**You own:** `services/engine/` (FastAPI). Nothing else. Do not edit `app/(dash)` or `src/app/api`.

**Setup**
```bash
cd services/engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

| Hours | Task | Done when |
|---|---|---|
| 0–1 | Write `packages/shared/types.ts` with the other three. Freeze it. | Everyone typechecks against it |
| 1–4 | `simulator.py` + `weather.py` — solar geometry, Open-Meteo, load profiles, WS tick loop | `/ws` streams a `Tick` every second |
| **4** | **HANDOFF:** capture fixtures for the frontend pair | `apps/web/src/mocks/fixtures/ticks.json` committed with 240 real frames |
| 4–7 | `pricing.py` — uniform-price double auction + corridor clamp + wheeling split | `test_pricing.py` green, clearing price never leaves the corridor |
| 6.5–9 | `grid.py` — radial tree, LCA path, hop-tiered losses, congestion penalty | `path_between` correct on the demo topology |
| 9–11.5 | `matching.py` — hand-rolled MCMF + `/match` | Agrees with `networkx.max_flow_min_cost` on 50 random instances |
| 11.5–12.5 | `carbon.py` | `/carbon/{id}` returns a `CarbonSummary` |
| 12.5–13 | Hand `/match` + `/price` to Rahi, smoke test together | Rahi can run a slot end-to-end from Postman |
| 13–15 | `broker.py` — policy schema, Anthropic tool-use, executor, decision log | A goal string produces a clamped policy and a visible decision |
| 15–17 | `parse_fallback()` + coefficient tuning | Unplug the network: broker still works |
| 17–19 | 💤 nap | |
| 19–21 | Demo scenario: seeded congestion event, `/sim/control` | Running the script twice gives identical numbers |

**Never break:** the price corridor. Every price that reaches a trade goes through `clamp_to_corridor`.

**Your pitch segment:** the intelligence layer — why min-cost max-flow, why the corridor, why the agent cannot misbehave.
