"""AI broker tests — Dev, H13-H15.

The point of these is containment. The interesting question is not "does the
model produce a good policy" but "what is the worst thing that happens if it
produces a terrible one". Every test here runs WITHOUT an API key, which also
proves the demo survives a dead network.
"""

from __future__ import annotations

import asyncio
from datetime import datetime

import pytest

from app.broker import _policy_from_fields, build_policy, execute, parse_fallback
from app.config import DEFAULT_TARIFF as T
from app.models import Listing, MarketState, MeterReading

FLOOR, CEIL = T.feed_in_tariff_paise, T.retail_tariff_paise


def _reading(surplus: float = 4.0) -> MeterReading:
    return MeterReading(
        meter_id="M-01", user_id="U-01", node_id="H-01",
        generation_kw=surplus + 1.0, consumption_kw=1.0,
        surplus_kw=surplus, day_generation_kwh=20.0,
    )


def _market(price: int = 400) -> MarketState:
    return MarketState(
        slot_id="S1", slot_start_sim="2026-09-12T14:00", slot_end_sim="2026-09-12T14:15",
        total_supply_kwh=10, total_demand_kwh=4, indicative_price_paise=price,
        last_clearing_price_paise=None, congestion_index=0.2,
        active_listings=5, active_bids=3,
    )


def _listing(price: int) -> Listing:
    return Listing(
        id="L1", seller_id="U-01", meter_id="M-01", node_id="H-01", kwh=3.0,
        ask_price_paise=price, slot_id="S1", expires_at_sim="T", status="OPEN",
    )


# ------------------------------------------------------------ containment ---


def test_adversarial_model_output_is_contained():
    """The worst case: every field hostile. Nothing may escape its bounds."""
    evil = {
        "objective": "DROP_TABLE_USERS",
        "minPricePaise": 10**9,
        "maxPricePaise": -(10**9),
        "urgency": 47.0,
        "reserveKwh": -100.0,
        "communityDonationPct": 1e6,
        "rationale": "x" * 100_000,
    }
    p = _policy_from_fields("U-01", "goal", evil, T, "llm", datetime.now().isoformat())

    assert p.objective in ("MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY")
    assert FLOOR <= p.min_price_paise <= p.max_price_paise <= CEIL
    assert 0.0 <= p.urgency <= 1.0
    assert p.reserve_kwh >= 0.0
    assert 0.0 <= p.community_donation_pct <= 100.0
    assert len(p.rationale) <= 400


def test_inverted_prices_are_reordered_not_rejected():
    p = _policy_from_fields(
        "U", "g", {"minPricePaise": 600, "maxPricePaise": 300}, T, "llm",
        datetime.now().isoformat(),
    )
    assert p.min_price_paise <= p.max_price_paise


def test_build_policy_without_api_key_falls_back():
    """No key configured must degrade to rule-based, never raise."""
    p = asyncio.run(build_policy("U-01", "sell fast", T))
    assert p.source == "fallback"
    assert FLOOR <= p.min_price_paise <= p.max_price_paise <= CEIL


# ---------------------------------------------------------------- parsing ---


@pytest.mark.parametrize(
    "goal,expected",
    [
        ("Maximize my profit", "MAX_PROFIT"),
        ("get me the best price", "MAX_PROFIT"),
        ("Sell fast before sunset", "SELL_FAST"),
        ("dump it now", "SELL_FAST"),
        ("donate to the community pool", "MAX_COMMUNITY"),
        ("give some to the local school", "MAX_COMMUNITY"),
        ("Match the cheapest grid price", "BEAT_GRID"),
        ("", "BEAT_GRID"),
        ("!!! ???", "BEAT_GRID"),
    ],
)
def test_fallback_objective_detection(goal: str, expected: str):
    assert parse_fallback("U", goal, T).objective == expected


def test_fallback_reads_a_price_floor():
    p = parse_fallback("U", "sell fast but never below 4.50", T)
    assert p.min_price_paise == 450


def test_fallback_ignores_numbers_outside_the_corridor():
    """'sell 5 kWh' is a quantity, not a five-rupee price."""
    p = parse_fallback("U", "sell 5 kWh today", T)
    assert p.min_price_paise == FLOOR


def test_explicit_percentage_overrides_default():
    assert parse_fallback("U", "give 15% to the school", T).community_donation_pct == 15.0


def test_fallback_reads_a_reserve():
    assert parse_fallback("U", "keep 2 kWh for tonight", T).reserve_kwh == 2.0


def test_fallback_never_raises_on_any_input():
    for goal in ["", "   ", "₹₹₹", "\x00\x01", "a" * 5000, "99999999999999999999"]:
        p = parse_fallback("U", goal, T)
        assert FLOOR <= p.min_price_paise <= p.max_price_paise <= CEIL


# --------------------------------------------------------------- executor ---


def test_sell_fast_price_decays_monotonically_toward_the_floor():
    p = parse_fallback("U", "sell fast before sunset but never below 4.50", T)
    prices = [
        execute(p, _reading(), _market(), None, mins, 20.0, T).to_price_paise
        for mins in (300, 240, 180, 120, 60, 30, 10, 0)
    ]
    assert all(a >= b for a, b in zip(prices, prices[1:])), prices
    assert prices[-1] == p.min_price_paise
    assert all(x >= p.min_price_paise for x in prices)


def test_executor_never_prices_outside_policy_or_corridor():
    """Sweep every objective across the whole day."""
    for goal in ("maximize profit", "sell fast", "match the grid", "donate 30%"):
        p = parse_fallback("U", goal, T)
        for mins in range(0, 400, 20):
            for cloud in (0.0, 50.0, 100.0):
                d = execute(p, _reading(), _market(), None, float(mins), cloud, T)
                if d.to_price_paise is not None:
                    assert p.min_price_paise <= d.to_price_paise <= p.max_price_paise
                    assert FLOOR <= d.to_price_paise <= CEIL


def test_beat_grid_always_undercuts_retail():
    p = parse_fallback("U", "match the cheapest grid price", T)
    for market_price in (200, 400, 649, 5000):
        d = execute(p, _reading(), _market(market_price), None, 120, 10.0, T)
        assert d.to_price_paise < CEIL


def test_reserve_is_honoured():
    """Reserve above the available surplus means nothing is sold."""
    p = parse_fallback("U", "keep 99 kWh for tonight", T)
    d = execute(p, _reading(surplus=4.0), _market(), None, 120, 10.0, T)
    assert d.action in ("HOLD", "WITHDRAW")
    assert d.kwh == 0.0


def test_withdraws_an_existing_listing_when_surplus_disappears():
    p = parse_fallback("U", "keep 99 kWh for tonight", T)
    d = execute(p, _reading(surplus=4.0), _market(), _listing(500), 120, 10.0, T)
    assert d.action == "WITHDRAW"


def test_holds_rather_than_churning_on_tiny_moves():
    p = parse_fallback("U", "match the cheapest grid price", T)
    first = execute(p, _reading(), _market(400), None, 120, 10.0, T)
    again = execute(p, _reading(), _market(400), _listing(first.to_price_paise), 120, 10.0, T)
    assert again.action == "HOLD"


def test_every_decision_carries_a_human_reason():
    """The Agent Activity feed is the judge-facing artifact. No blank reasons."""
    for goal in ("maximize profit", "sell fast", "match the grid", "donate 30%", "keep 99 kWh"):
        p = parse_fallback("U", goal, T)
        for surplus in (0.0, 4.0):
            d = execute(p, _reading(surplus), _market(), None, 90, 30.0, T)
            assert len(d.reason) > 20
            assert d.inputs.market_price_paise > 0


def test_community_objective_donates_before_selling():
    p = parse_fallback("U", "give 25% to the local school", T)
    d = execute(p, _reading(), _market(), None, 120, 10.0, T)
    assert d.action == "DONATE"
    assert d.kwh > 0


# ------------------------------------------------------------- providers ---


def test_provider_selection(monkeypatch):
    """auto prefers Anthropic, falls through to OpenAI, then to the fallback."""
    from app import config

    def setenv(anthropic_key="", openai_key="", provider="auto"):
        monkeypatch.setattr(config, "ANTHROPIC_API_KEY", anthropic_key)
        monkeypatch.setattr(config, "OPENAI_API_KEY", openai_key)
        monkeypatch.setattr(config, "LLM_PROVIDER", provider)

    setenv()
    assert config.active_llm_provider() == "none"

    setenv(anthropic_key="sk-ant-x")
    assert config.active_llm_provider() == "anthropic"

    setenv(openai_key="sk-oai-x")
    assert config.active_llm_provider() == "openai"

    setenv(anthropic_key="sk-ant-x", openai_key="sk-oai-x")
    assert config.active_llm_provider() == "anthropic"

    # Explicit pins, including asking for a provider whose key is absent.
    setenv(anthropic_key="sk-ant-x", openai_key="sk-oai-x", provider="openai")
    assert config.active_llm_provider() == "openai"
    setenv(anthropic_key="sk-ant-x", provider="openai")
    assert config.active_llm_provider() == "none"
    setenv(anthropic_key="sk-ant-x", openai_key="sk-oai-x", provider="none")
    assert config.active_llm_provider() == "none"


def test_broken_provider_degrades_to_fallback(monkeypatch):
    """A configured provider that throws must not surface as an error.

    This is the scenario that actually matters on stage: a key is set, the
    network is flaky, and the demo has to keep moving.
    """
    from app import broker as broker_mod
    from app import config

    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-oai-broken")
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")

    async def boom(goal, tariff):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(broker_mod, "_policy_via_openai", boom)

    p = asyncio.run(broker_mod.build_policy("U-01", "sell fast before sunset", T))
    assert p.source == "fallback"
    assert p.objective == "SELL_FAST"
    assert FLOOR <= p.min_price_paise <= p.max_price_paise <= CEIL


def test_openai_shaped_response_is_validated_identically(monkeypatch):
    """A hostile response through the OpenAI path is clamped exactly as
    an Anthropic one would be — the guardrails are vendor-independent."""
    from app import broker as broker_mod
    from app import config

    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-oai-x")
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")

    async def hostile(goal, tariff):
        return {
            "objective": "NOT_A_REAL_OBJECTIVE",
            "minPricePaise": 10**9,
            "maxPricePaise": -(10**9),
            "urgency": 99,
            "reserveKwh": -5,
            "communityDonationPct": 400,
            "rationale": "y" * 50_000,
        }

    monkeypatch.setattr(broker_mod, "_policy_via_openai", hostile)

    p = asyncio.run(broker_mod.build_policy("U-01", "anything", T))
    assert p.source == "llm"
    assert p.objective in ("MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY")
    assert FLOOR <= p.min_price_paise <= p.max_price_paise <= CEIL
    assert 0.0 <= p.urgency <= 1.0
    assert p.reserve_kwh >= 0.0
    assert 0.0 <= p.community_donation_pct <= 100.0
    assert len(p.rationale) <= 400


def test_good_openai_response_is_accepted(monkeypatch):
    from app import broker as broker_mod
    from app import config

    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-oai-x")
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")

    async def good(goal, tariff):
        return {
            "objective": "SELL_FAST",
            "minPricePaise": 450,
            "maxPricePaise": 620,
            "urgency": 0.9,
            "reserveKwh": 1.5,
            "communityDonationPct": 0,
            "rationale": "Clearing before sunset, floor held at 4.50.",
        }

    monkeypatch.setattr(broker_mod, "_policy_via_openai", good)

    p = asyncio.run(broker_mod.build_policy("U-01", "sell fast, floor 4.50", T))
    assert p.source == "llm"
    assert p.objective == "SELL_FAST"
    assert p.min_price_paise == 450
    assert p.max_price_paise == 620
    assert p.reserve_kwh == 1.5
