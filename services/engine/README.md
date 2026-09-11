# SunShare engine — Dev's lane

FastAPI service: smart-meter simulator, pricing, proximity-weighted matching,
AI broker, carbon maths.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest                      # 106 tests
```

- Live ticks: `ws://localhost:8000/ws`
- OpenAPI docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | status, sim clock, seed, whether the broker LLM is configured |
| WS | `/ws` | `Tick` stream, one per `SIM_TICK_SECONDS` |
| GET | `/market/state` | `MarketState` |
| GET | `/meters` | `MeterReading[]` |
| POST | `/match` | `MatchResult` ← `MatchRequest` |
| POST | `/broker/policy` | `BrokerPolicy` ← `{userId, goal}` |
| POST | `/broker/step` | `BrokerDecision` ← `{policy, listing?}` |
| GET | `/carbon/{userId}?local_kwh=` | `CarbonSummary` |
| GET | `/grid/topology` | `GridTopology` |
| POST | `/sim/control` | demo controls |

**`/grid/topology` must be fetched fresh before each `/match`** — it carries the
live edge loads, which is how congestion reaches the matcher.

## Demo controls

```bash
curl -X POST localhost:8000/sim/control -H 'content-type: application/json' \
  -d '{"jumpToHour": 12}'                    # jump to peak generation
  -d '{"speed": 10}'                         # fast-forward
  -d '{"congestEdge": "e-F-1-H-01"}'         # demo step 6
  -d '{"clearCongestion": true}'             # release it
```

## How it works

**Simulator.** Real solar geometry, not a bell curve: Cooper's declination →
equation of time → hour angle → elevation → Kasten-Young air mass. Sunrise and
sunset land where they actually do for Gandhinagar. Cloud cover comes from
Open-Meteo, with a synthetic fallback. `SIM_SEED` fixes all noise so rehearsal
and stage produce identical numbers.

**Pricing.** Uniform-price double auction on 15-minute slots, clamped into the
**price corridor** `[feed-in, retail]`. Settlement pays on *delivered* kWh.

**Matching.** Min-cost max-flow over the real grid topology — every physical
line is an arc whose capacity is its headroom and whose cost is its own
per-segment loss valued at the clearing price. A nearer seller wins because its
arcs are cheaper; a congested feeder re-allocates because flow cannot pass.
Cross-checked against `networkx.max_flow_min_cost`.

**Broker.** Claude emits one schema-validated `BrokerPolicy`, which is clamped
into the corridor before a deterministic executor acts on it. The model never
signs, settles, or picks a counterparty. Without `ANTHROPIC_API_KEY` it falls
back to a keyword parser, so the demo works offline.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `SIM_SPEED` | `1` | sim minutes per real second; 1 ⇒ 24h day in 24 real min |
| `SIM_SEED` | `2026` | fixes all noise |
| `WEATHER_MODE` | `auto` | `auto` uses Open-Meteo only when the real sun is up |
| `ANTHROPIC_API_KEY` | *(unset)* | unset ⇒ broker uses the rule-based fallback |
| `BROKER_MODEL` | `claude-sonnet-5` | |

> ⚠️ Tariff and emission figures are **illustrative**. Re-derive against the
> actual state DISCOM tariff order before quoting them anywhere.

## Regenerating fixtures

```bash
python -m app.simulator --capture 144 --speed 10 \
  > ../../apps/web/src/mocks/fixtures/ticks.json
```
