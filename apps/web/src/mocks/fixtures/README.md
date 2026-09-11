# Fixtures

`ticks.json` is an array of `Tick` objects (see `@sunshare/shared`).

**Status: delivered by Dev at H4.** 144 frames covering a full 24-hour day at
10 simulated minutes per frame, seeded (`SIM_SEED=2026`) so the numbers are
identical on every machine. At one frame per second `fake-ws.ts` loops the whole
day in about 2.4 minutes.

What is in it:

| | |
|---|---|
| frames | 144 (06:00 → 05:50 next day) |
| meters | 12 houses, 8 with panels (53.5 kWp installed) |
| generation | 0 → 35.95 kW |
| indicative price | 322 → 599 paise, always inside the corridor |
| size | ~300 KB (compact JSON — it gets bundled into the client) |

Regenerate after changing the simulator or the grid:

```bash
cd services/engine && source .venv/bin/activate
python -m app.simulator --capture 144 --speed 10 \
  > ../../apps/web/src/mocks/fixtures/ticks.json
```

Keep it committed — the demo fallback depends on it.
