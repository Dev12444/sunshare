# SunShare engine — Dev's lane

FastAPI service: smart-meter simulator, pricing, proximity-weighted matching,
AI broker, carbon maths.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- Live ticks:  `ws://localhost:8000/ws`
- Docs:        http://localhost:8000/docs
- Tests:       `pytest`

Capture fixtures for the frontend pair (H4 handoff):

```bash
python -m app.simulator --capture 240 > ../../apps/web/src/mocks/fixtures/ticks.json
```
