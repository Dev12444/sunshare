# Fixtures

`ticks.json` is an array of `Tick` objects (see `@sunshare/shared`).

**Owner handoff — Dev, H4:** capture a real run from the simulator and commit it
here, so the frontend pair builds against realistic curves rather than flat data:

```bash
cd services/engine
python -m app.simulator --capture 240 > ../../apps/web/src/mocks/fixtures/ticks.json
```

240 frames at SIM_SPEED=60 is a full solar day. Keep it committed — the demo
fallback depends on it.
