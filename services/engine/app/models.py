"""
SunShare engine — Pydantic mirror of packages/shared/src/types.ts.

Field names MUST stay identical to the TypeScript side (camelCase) so the
frontend pair can consume engine responses without a translation layer.
That is why every model sets `alias_generator=to_camel` with
`populate_by_name=True`: Python code uses snake_case, the wire uses camelCase.

UNITS (fixed at H0, do not renegotiate):
    money  -> integer paise per kWh
    energy -> float kWh
    power  -> float kW
    time   -> ISO-8601 strings; *_sim = simulated clock, *_real = wall clock
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        ser_json_timedelta="iso8601",
    )


# ----------------------------------------------------------------- roles ---

Role = Literal["PROSUMER", "CONSUMER", "DISCOM", "REGULATOR"]


# ------------------------------------------------------------------ grid ---

GridNodeKind = Literal["HOUSE", "FEEDER", "SUBSTATION"]
CongestionLevel = Literal["NORMAL", "HIGH", "CRITICAL"]


class GridNode(Base):
    id: str
    kind: GridNodeKind
    name: str
    lat: float
    lng: float
    parent_id: str | None = None
    capacity_kw: float
    load_kw: float = 0.0


class GridEdge(Base):
    id: str
    from_node_id: str
    to_node_id: str
    length_km: float
    capacity_kw: float
    current_load_kw: float = 0.0


class GridTopology(Base):
    nodes: list[GridNode]
    edges: list[GridEdge]


# -------------------------------------------------------- meters & ticks ---


class MeterReading(Base):
    meter_id: str
    user_id: str
    node_id: str
    generation_kw: float
    consumption_kw: float
    surplus_kw: float
    day_generation_kwh: float


class WeatherSnapshot(Base):
    cloud_cover_pct: float
    irradiance_wm2: float
    temp_c: float
    source: Literal["open-meteo", "synthetic"]


class MarketState(Base):
    slot_id: str
    slot_start_sim: str
    slot_end_sim: str
    total_supply_kwh: float
    total_demand_kwh: float
    indicative_price_paise: int
    last_clearing_price_paise: int | None = None
    congestion_index: float = Field(ge=0.0, le=1.0)
    active_listings: int
    active_bids: int


class Tick(Base):
    seq: int
    ts_sim: str
    ts_real: str
    speed: float
    weather: WeatherSnapshot
    meters: list[MeterReading]
    market: MarketState


# ---------------------------------------------------------------- tariff ---


class TariffContext(Base):
    """The price corridor. Every cleared trade satisfies
    feed_in_tariff_paise <= price <= retail_tariff_paise."""

    feed_in_tariff_paise: int
    retail_tariff_paise: int
    wheeling_charge_paise: int


# ---------------------------------------------------------------- orders ---

OrderStatus = Literal["OPEN", "MATCHED", "PARTIAL", "EXPIRED", "WITHDRAWN"]


class Listing(Base):
    id: str
    seller_id: str
    meter_id: str
    node_id: str
    kwh: float
    ask_price_paise: int
    slot_id: str
    expires_at_sim: str
    status: OrderStatus = "OPEN"
    broker_policy_id: str | None = None


class Bid(Base):
    id: str
    buyer_id: str
    meter_id: str
    node_id: str
    kwh: float
    max_price_paise: int
    slot_id: str
    status: OrderStatus = "OPEN"


# -------------------------------------------------------------- matching ---


class MatchRequest(Base):
    slot_id: str
    listings: list[Listing]
    bids: list[Bid]
    grid: GridTopology
    tariff: TariffContext


class MatchPair(Base):
    listing_id: str
    bid_id: str
    seller_id: str
    buyer_id: str
    kwh: float
    delivered_kwh: float
    loss_kwh: float
    distance_km: float
    efficiency_pct: float
    path_node_ids: list[str]
    congestion_penalty_paise: int


class MatchResult(Base):
    slot_id: str
    clearing_price_paise: int
    pairs: list[MatchPair]
    total_matched_kwh: float
    total_delivered_kwh: float
    total_loss_kwh: float
    avg_efficiency_pct: float
    unmatched_supply_kwh: float
    unmatched_demand_kwh: float
    grid_backfill_kwh: float
    compute_ms: float
    algorithm: Literal["mcmf", "greedy-fallback"]


# ------------------------------------------------------------- AI broker ---

BrokerObjective = Literal["MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY"]
BrokerAction = Literal["LIST", "REPRICE", "HOLD", "WITHDRAW", "DONATE"]


class BrokerPolicy(Base):
    """The ONLY structure the LLM may produce.

    It is schema-validated and clamped into the price corridor before the
    deterministic executor acts on it. The model never signs a transaction,
    never settles a trade, never touches money.
    """

    id: str
    user_id: str
    raw_goal: str
    objective: BrokerObjective
    min_price_paise: int
    max_price_paise: int
    urgency: float = Field(ge=0.0, le=1.0)
    reserve_kwh: float = Field(ge=0.0)
    community_donation_pct: float = Field(ge=0.0, le=100.0)
    valid_until_sim: str
    rationale: str
    source: Literal["llm", "fallback"]
    created_at: str


class BrokerDecisionInputs(Base):
    surplus_kwh: float
    minutes_to_sunset: float
    forecast_cloud_pct: float
    market_price_paise: int
    congestion_index: float


class BrokerDecision(Base):
    id: str
    policy_id: str
    slot_id: str
    ts_sim: str
    action: BrokerAction
    kwh: float
    from_price_paise: int | None = None
    to_price_paise: int | None = None
    reason: str
    inputs: BrokerDecisionInputs


# ---------------------------------------------------------------- carbon ---


class CarbonSummary(Base):
    user_id: str
    period_start: str
    period_end: str
    local_kwh: float
    co2_avoided_kg: float
    tree_equivalent: float
    grid_comparison_kg: float
    rank: int | None = None
