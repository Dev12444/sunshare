"""
SunShare engine — FastAPI entrypoint. Dev's lane.

    GET  /health              liveness + sim clock state
    WS   /ws                  Tick stream — the only moving-numbers source
    GET  /market/state        current MarketState
    POST /match               clear a slot: double auction + MCMF matching
    POST /broker/policy       plain-language goal -> validated BrokerPolicy
    POST /broker/step         one deterministic executor step -> BrokerDecision
    GET  /carbon/{user_id}    CarbonSummary
    GET  /grid/topology       nodes + edges for the map
    POST /sim/control         demo controls: speed, jump-to-hour, congestion

Rahi calls these over HTTP from the Next.js routes; the browser holds /ws
directly for ticks.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import broker as broker_mod
from . import scenario as scenario_mod
from . import carbon as carbon_mod
from . import config, weather
from .matching import match_slot
from .models import (
    BrokerDecision,
    BrokerPolicy,
    CarbonSummary,
    GridTopology,
    Listing,
    MarketState,
    MatchRequest,
    MatchResult,
    MeterReading,
)
from .simulator import IST, Simulator

SIM: Simulator | None = None


def sim() -> Simulator:
    global SIM
    if SIM is None:
        SIM = Simulator()
    return SIM


@asynccontextmanager
async def lifespan(app: FastAPI):
    sim()  # build the topology and prime the clock before the first request
    yield


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
    s = sim()
    return {
        "status": "ok",
        "simSpeed": s.speed,
        "seed": s.seed,
        "simTime": s.sim_time.isoformat(),
        "slotId": s.slot_id(),
        "weatherMode": config.WEATHER_MODE,
        "brokerProvider": config.active_llm_provider(),
    }


@app.websocket("/ws")
async def ws_ticks(socket: WebSocket) -> None:
    """Live tick stream.

    Service workers do not intercept WebSocket traffic, so PWA caching has no
    effect here — offline rendering is handled separately from IndexedDB.
    """
    await socket.accept()
    s = sim()
    try:
        while True:
            tick = await s.build_tick(config.SIM_TICK_SECONDS)
            await socket.send_json(tick.model_dump(by_alias=True))
            await asyncio.sleep(config.SIM_TICK_SECONDS)
            s.advance(config.SIM_TICK_SECONDS)
    except (WebSocketDisconnect, RuntimeError):
        return


@app.get("/market/state", response_model=MarketState)
async def market_state() -> MarketState:
    s = sim()
    snapshot = await weather.fetch_weather(hour_of_day=s.hour_of_day)
    return s.market_state(s.readings(snapshot, 0.0))


@app.get("/meters", response_model=list[MeterReading])
async def meters() -> list[MeterReading]:
    s = sim()
    snapshot = await weather.fetch_weather(hour_of_day=s.hour_of_day)
    return s.readings(snapshot, 0.0)


@app.post("/match", response_model=MatchResult)
async def match(req: MatchRequest) -> MatchResult:
    result = match_slot(req)
    sim().set_clearing_price(result.clearing_price_paise)
    return result


@app.post("/broker/policy", response_model=BrokerPolicy)
async def broker_policy(body: dict = Body(...)) -> BrokerPolicy:
    user_id = str(body.get("userId") or "").strip()
    goal = str(body.get("goal") or "").strip()
    if not user_id or not goal:
        raise HTTPException(status_code=422, detail="userId and goal are required")
    if len(goal) > 2000:
        raise HTTPException(status_code=422, detail="goal too long")

    valid_until = (sim().sim_time + timedelta(hours=12)).isoformat()
    return await broker_mod.build_policy(user_id, goal, config.DEFAULT_TARIFF, valid_until)


@app.post("/broker/step", response_model=BrokerDecision)
async def broker_step(body: dict = Body(...)) -> BrokerDecision:
    """Run one executor step. The caller supplies the policy; no model call."""
    try:
        policy = BrokerPolicy.model_validate(body["policy"])
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"invalid policy: {exc}") from exc

    s = sim()
    snapshot = await weather.fetch_weather(hour_of_day=s.hour_of_day)
    readings = s.readings(snapshot, 0.0)

    reading = next((r for r in readings if r.user_id == policy.user_id), None)
    if reading is None:
        raise HTTPException(status_code=404, detail=f"no meter for user {policy.user_id}")

    # The listing arrives as raw JSON and MUST be parsed into the model here.
    # execute() reads listing.ask_price_paise; a bare dict blows up at the
    # attribute access, which is how REPRICE / WITHDRAW were 500ing while the
    # unit tests (which pass a real Listing) stayed green.
    raw_listing = body.get("listing")
    listing: Listing | None = None
    if raw_listing is not None:
        try:
            listing = Listing.model_validate(raw_listing)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"invalid listing: {exc}") from exc

    return broker_mod.execute(
        policy=policy,
        reading=reading,
        market=s.market_state(readings),
        listing=listing,
        minutes_to_sunset=s.minutes_to_sunset(),
        forecast_cloud_pct=await weather.forecast_cloud_pct(s.hour_of_day, 2.0),
        tariff=config.DEFAULT_TARIFF,
    )


@app.get("/carbon/{user_id}", response_model=CarbonSummary)
async def carbon(user_id: str, local_kwh: float = 0.0) -> CarbonSummary:
    """Carbon summary for a user.

    The engine is stateless about trades — Rahi's database owns the ledger —
    so the traded total is passed in and the maths happens here.
    """
    now = datetime.now(IST)
    return carbon_mod.summarise(
        user_id,
        local_kwh,
        now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
        now.isoformat(),
    )


@app.get("/grid/topology", response_model=GridTopology)
async def grid_topology() -> GridTopology:
    return sim().grid.topo


@app.get("/sim/scenario")
async def scenario_index() -> dict[str, object]:
    """The scripted demo beats, in order, with narration and what to watch for."""
    return {"beats": scenario_mod.beat_list()}


@app.post("/sim/scenario")
async def scenario_jump(body: dict = Body(...)) -> dict[str, object]:
    """Put the engine into one named demo beat, exactly and reproducibly.

    Three minutes on stage is not enough time to wait for a simulated day, and
    improvising with sliders in front of judges is how demos die. One call per
    beat, deterministic under SIM_SEED.
    """
    key = str(body.get("beat") or "")
    beat = scenario_mod.BY_KEY.get(key)
    if beat is None:
        raise HTTPException(
            status_code=404,
            detail=f"unknown beat {key!r}; expected one of "
            f"{sorted(scenario_mod.BY_KEY)}",
        )

    s = sim()
    s.speed = beat.speed
    s.sim_time = s.sim_time.replace(
        hour=int(beat.hour), minute=int((beat.hour % 1) * 60), second=0, microsecond=0
    )
    weather.reset_cache()

    # Always reset congestion first, so beats are order-independent: jumping
    # straight to "evening_peak" after "congestion" must not leave a line stuck.
    for edge_id in list(s._forced_congestion):
        s.force_congestion(edge_id, False)
    if beat.congest:
        s.force_congestion(scenario_mod.DEMO_CONGESTED_EDGE, True)

    snapshot = await weather.fetch_weather(hour_of_day=s.hour_of_day)
    readings = s.readings(snapshot, 0.0)
    market = s.market_state(readings)

    return {
        "beat": beat.key,
        "title": beat.title,
        "narration": beat.narration,
        "watchFor": beat.watch_for,
        "simTime": s.sim_time.isoformat(),
        "congestedEdges": sorted(s._forced_congestion),
        "market": market.model_dump(by_alias=True),
    }


@app.post("/sim/control")
async def sim_control(body: dict = Body(...)) -> dict[str, object]:
    """Demo controls, used live during the pitch.

    { "speed": 10 }                   fast-forward the solar day
    { "jumpToHour": 12.5 }            jump to peak generation
    { "congestEdge": "e-F-1-H-01" }   force the scripted congestion event
    { "clearCongestion": true }       release it again
    """
    s = sim()

    if "speed" in body:
        speed = float(body["speed"])
        if not 0 < speed <= 600:
            raise HTTPException(status_code=422, detail="speed must be in (0, 600]")
        s.speed = speed

    if "jumpToHour" in body:
        hour = float(body["jumpToHour"])
        if not 0 <= hour < 24:
            raise HTTPException(status_code=422, detail="jumpToHour must be in [0, 24)")
        s.sim_time = s.sim_time.replace(
            hour=int(hour), minute=int((hour % 1) * 60), second=0, microsecond=0
        )
        weather.reset_cache()

    if "congestEdge" in body:
        edge_id = str(body["congestEdge"])
        if edge_id not in s.grid.edges:
            raise HTTPException(status_code=404, detail=f"no such edge: {edge_id}")
        s.force_congestion(edge_id, True)

    if body.get("clearCongestion"):
        for edge_id in list(s._forced_congestion):
            s.force_congestion(edge_id, False)

    return {
        "simTime": s.sim_time.isoformat(),
        "speed": s.speed,
        "slotId": s.slot_id(),
        "congestedEdges": sorted(s._forced_congestion),
    }
