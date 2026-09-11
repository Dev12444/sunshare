"""
SunShare engine — FastAPI entrypoint. Dev's lane.

This file defines the API surface the rest of the team codes against, so it is
written at H0 even though the bodies land through the day. Rahi calls these
over HTTP from the Next.js routes; the browser holds /ws directly for ticks.

    GET  /health              liveness + current sim speed
    WS   /ws                  Tick stream — the only moving-numbers source
    GET  /market/state        current MarketState
    POST /match               clear a slot: double auction + MCMF matching
    POST /broker/policy       plain-language goal -> validated BrokerPolicy
    POST /broker/step         one deterministic executor step -> BrokerDecision
    GET  /carbon/{user_id}    CarbonSummary
    GET  /grid/topology       nodes + edges for the map
    POST /sim/control         demo controls: speed, jump-to-hour, congestion event
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .models import (
    BrokerDecision,
    BrokerPolicy,
    CarbonSummary,
    GridTopology,
    MarketState,
    MatchRequest,
    MatchResult,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # TODO(Dev): load grid topology, prime the weather cache, start the sim clock.
    yield
    # TODO(Dev): cancel the simulator task cleanly.


app = FastAPI(title="SunShare Engine", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "simSpeed": config.SIM_SPEED, "seed": config.SIM_SEED}


@app.websocket("/ws")
async def ws_ticks(socket: WebSocket) -> None:
    """Live tick stream.

    Service workers do not intercept WebSocket traffic, so PWA caching has no
    effect here — offline rendering is handled separately from IndexedDB.
    """
    await socket.accept()
    try:
        # TODO(Dev): async for tick in simulator.tick_stream():
        #                await socket.send_json(tick.model_dump(by_alias=True))
        raise NotImplementedError
    except WebSocketDisconnect:
        return


@app.get("/market/state", response_model=MarketState)
async def market_state() -> MarketState:
    # TODO(Dev)
    raise NotImplementedError


@app.post("/match", response_model=MatchResult)
async def match(req: MatchRequest) -> MatchResult:
    # TODO(Dev): matching.match_slot(req)
    raise NotImplementedError


@app.post("/broker/policy", response_model=BrokerPolicy)
async def broker_policy(body: dict) -> BrokerPolicy:
    # TODO(Dev): broker.build_policy(body["userId"], body["goal"], DEFAULT_TARIFF)
    raise NotImplementedError


@app.post("/broker/step", response_model=BrokerDecision)
async def broker_step(body: dict) -> BrokerDecision:
    # TODO(Dev): broker.execute(...)
    raise NotImplementedError


@app.get("/carbon/{user_id}", response_model=CarbonSummary)
async def carbon(user_id: str) -> CarbonSummary:
    # TODO(Dev): carbon.summarise(...)
    raise NotImplementedError


@app.get("/grid/topology", response_model=GridTopology)
async def grid_topology() -> GridTopology:
    # TODO(Dev): grid.load_topology()
    raise NotImplementedError


@app.post("/sim/control")
async def sim_control(body: dict) -> dict[str, object]:
    """Demo controls, used live during the pitch.

    { "speed": 300 }                  fast-forward the solar day
    { "jumpToHour": 12.5 }            jump to peak generation
    { "congestEdge": "e-feeder-2" }   force the scripted congestion event
    """
    # TODO(Dev)
    raise NotImplementedError
