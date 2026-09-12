"""HTTP-level tests — Dev.

Everything else in this suite tests Python objects. That left the
serialisation boundary untested, which is exactly where Rahi's code meets
mine, and it hid a real bug: /broker/step 500'd whenever a listing was
passed, because the JSON dict was handed straight to code expecting a model.
Unit tests passed the whole time because they constructed a real Listing.

So these tests speak JSON, the way a caller actually does.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

DATA = Path(__file__).resolve().parent.parent / "data"
TARIFF = {"feedInTariffPaise": 215, "retailTariffPaise": 650, "wheelingChargePaise": 45}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def topology(client):
    return client.get("/grid/topology").json()


def _listing(node="H-01", kwh=3.0, price=400, i=1):
    return {
        "id": f"L{i}", "sellerId": f"U-0{i}", "meterId": f"M-0{i}", "nodeId": node,
        "kwh": kwh, "askPricePaise": price, "slotId": "S1",
        "expiresAtSim": "2026-09-12T12:15:00+05:30", "status": "OPEN",
        "brokerPolicyId": None,
    }


def _bid(node="H-03", kwh=3.0, price=600, i=1):
    return {
        "id": f"B{i}", "buyerId": f"U-{i}3", "meterId": f"N{i}", "nodeId": node,
        "kwh": kwh, "maxPricePaise": price, "slotId": "S1", "status": "OPEN",
    }


# ------------------------------------------------------------------ basics ---


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["brokerProvider"] in ("none", "openai", "anthropic")
    assert "simTime" in body and "slotId" in body


def test_grid_topology_shape(client, topology):
    assert len(topology["nodes"]) == 18
    assert len(topology["edges"]) == 17
    # camelCase on the wire — the frontend consumes this directly
    assert "parentId" in topology["nodes"][0]
    assert "capacityKw" in topology["nodes"][0]
    assert "fromNodeId" in topology["edges"][0]


def test_meters_shape(client):
    meters = client.get("/meters").json()
    assert len(meters) == 12
    for m in meters:
        assert {"meterId", "userId", "nodeId", "generationKw",
                "consumptionKw", "surplusKw", "dayGenerationKwh"} <= set(m)


def test_market_state_shape(client):
    m = client.get("/market/state").json()
    assert 215 <= m["indicativePricePaise"] <= 650
    assert 0.0 <= m["congestionIndex"] <= 1.0


def test_meters_match_the_seeded_households(client):
    """Rahi's seed must use these exact ids. If they drift, every match result
    references users his database does not have."""
    households = json.loads((DATA / "households.json").read_text())["households"]
    expected = {h["userId"] for h in households}
    actual = {m["userId"] for m in client.get("/meters").json()}
    assert actual == expected


# ------------------------------------------------------------------- match ---


def test_match_over_http(client, topology):
    body = {"slotId": "S1", "listings": [_listing()], "bids": [_bid()],
            "grid": topology, "tariff": TARIFF}
    r = client.post("/match", json=body)
    assert r.status_code == 200
    result = r.json()
    assert 215 <= result["clearingPricePaise"] <= 650
    assert result["totalDeliveredKwh"] <= result["totalMatchedKwh"]
    for p in result["pairs"]:
        assert {"listingId", "bidId", "sellerId", "buyerId", "kwh",
                "deliveredKwh", "efficiencyPct", "pathNodeIds"} <= set(p)


def test_match_with_empty_book(client, topology):
    r = client.post("/match", json={"slotId": "S1", "listings": [], "bids": [],
                                    "grid": topology, "tariff": TARIFF})
    assert r.status_code == 200
    assert r.json()["pairs"] == []


def test_match_rejects_malformed_body(client):
    assert client.post("/match", json={"slotId": "S1"}).status_code == 422


def test_match_is_fast_enough_for_the_demo(client, topology):
    """NFR: a slot must clear well inside the tick interval."""
    listings = [_listing(n, 3.0, 400, i) for i, n in
                enumerate(["H-01", "H-02", "H-04", "H-07", "H-10", "H-11"], 1)]
    bids = [_bid(n, 2.0, 600, i) for i, n in enumerate(["H-03", "H-06", "H-09", "H-12"], 1)]
    r = client.post("/match", json={"slotId": "S1", "listings": listings, "bids": bids,
                                    "grid": topology, "tariff": TARIFF})
    assert r.json()["computeMs"] < 500


# ------------------------------------------------------------------ broker ---


def test_broker_policy_over_http(client):
    r = client.post("/broker/policy", json={"userId": "U-01", "goal": "sell fast, never below 4.50"})
    assert r.status_code == 200
    p = r.json()
    assert p["objective"] == "SELL_FAST"
    assert 215 <= p["minPricePaise"] <= p["maxPricePaise"] <= 650


@pytest.mark.parametrize("body", [
    {}, {"userId": "U-01"}, {"goal": "x"}, {"userId": "", "goal": ""},
    {"userId": "U-01", "goal": "x" * 3000},
])
def test_broker_policy_rejects_bad_input(client, body):
    assert client.post("/broker/policy", json=body).status_code == 422


def test_broker_step_without_listing(client):
    policy = client.post("/broker/policy", json={"userId": "U-01", "goal": "sell fast"}).json()
    r = client.post("/broker/step", json={"policy": policy})
    assert r.status_code == 200
    assert r.json()["action"] in ("LIST", "HOLD", "WITHDRAW", "DONATE", "REPRICE")


def test_broker_step_WITH_listing(client):
    """REGRESSION: this 500'd. The listing arrives as JSON and must be parsed
    into the model before execute() touches its attributes. Without this,
    every decision after the first LIST fails — which is most of the Agent
    Activity feed."""
    client.post("/sim/scenario", json={"beat": "midday_surplus"})
    policy = client.post("/broker/policy",
                         json={"userId": "U-01", "goal": "sell fast before sunset"}).json()
    r = client.post("/broker/step", json={"policy": policy, "listing": _listing(price=600)})
    assert r.status_code == 200, r.text
    decision = r.json()
    assert decision["action"] in ("REPRICE", "HOLD", "WITHDRAW")
    assert decision["fromPricePaise"] == 600
    assert len(decision["reason"]) > 20


def test_broker_step_rejects_malformed_listing(client):
    policy = client.post("/broker/policy", json={"userId": "U-01", "goal": "sell fast"}).json()
    r = client.post("/broker/step", json={"policy": policy, "listing": {"nonsense": True}})
    assert r.status_code == 422
    assert "listing" in r.json()["detail"].lower()


def test_broker_step_rejects_malformed_policy(client):
    assert client.post("/broker/step", json={"policy": {"bad": 1}}).status_code == 422


def test_broker_step_unknown_user(client):
    policy = client.post("/broker/policy", json={"userId": "NOBODY", "goal": "sell"}).json()
    assert client.post("/broker/step", json={"policy": policy}).status_code == 404


# ------------------------------------------------------------------ carbon ---


def test_carbon_over_http(client):
    c = client.get("/carbon/U-01", params={"local_kwh": 50}).json()
    assert c["localKwh"] == 50.0
    assert c["co2AvoidedKg"] > 0
    assert c["treeEquivalent"] > 0
    assert c["gridComparisonKg"] > c["co2AvoidedKg"]


def test_carbon_with_zero(client):
    c = client.get("/carbon/U-01").json()
    assert c["co2AvoidedKg"] == 0.0


def test_carbon_rejects_an_unseeded_user(client):
    """A user the engine never seeded is a 404, not a page of zeros.

    /carbon/summary used to answer 200 with userId "summary" — the path
    segment read as a user id — which made a caller's wrong URL look like a
    real user who simply had not traded yet.
    """
    assert client.get("/carbon/NOT-A-REAL-USER").status_code == 404
    assert client.get("/carbon/summary").status_code == 404


def test_carbon_accepts_every_seeded_user(client):
    for n in range(1, 13):
        assert client.get(f"/carbon/U-{n:02d}").status_code == 200


# ------------------------------------------------------------ sim controls ---


def test_sim_control_validates_ranges(client):
    assert client.post("/sim/control", json={"speed": 0}).status_code == 422
    assert client.post("/sim/control", json={"speed": 9999}).status_code == 422
    assert client.post("/sim/control", json={"jumpToHour": 25}).status_code == 422
    assert client.post("/sim/control", json={"congestEdge": "nope"}).status_code == 404


def test_sim_control_rejects_unknown_keys(client):
    """A mistyped control must fail loudly — this one is driven live on stage."""
    r = client.post("/sim/control", json={"action": "jump", "hour": 13})
    assert r.status_code == 422
    assert "action" in r.json()["detail"] and "hour" in r.json()["detail"]

    # A good key alongside a bad one is still refused, rather than half-applied.
    before = client.post("/sim/control", json={}).json()["simTime"]
    assert client.post(
        "/sim/control", json={"jumpToHour": 9, "speeed": 5}
    ).status_code == 422
    assert client.post("/sim/control", json={}).json()["simTime"] == before


def test_sim_control_jump_and_congest(client):
    r = client.post("/sim/control", json={"jumpToHour": 12, "speed": 5})
    assert r.json()["simTime"][11:16] == "12:00"
    r = client.post("/sim/control", json={"congestEdge": "e-F-1-H-01"})
    assert "e-F-1-H-01" in r.json()["congestedEdges"]
    r = client.post("/sim/control", json={"clearCongestion": True})
    assert r.json()["congestedEdges"] == []


def test_websocket_streams_ticks(client):
    """The frontend's only source of moving numbers."""
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["seq"] >= 1
        assert len(first["meters"]) == 12
        assert {"weather", "market", "tsSim", "speed"} <= set(first)
        assert 215 <= first["market"]["indicativePricePaise"] <= 650


# ---------------------------------------------------------------- forecast ---


def test_broker_receives_a_real_forecast_not_the_current_reading(client):
    """The decision feed says "X% cloud forecast". It must actually be one.

    Regression: forecast_cloud_pct was being fed snapshot.cloud_cover_pct —
    the current reading, relabelled. That put a number on screen, in front of
    judges, that did not mean what the sentence next to it said.
    """
    import asyncio

    from app import weather

    # Pick an hour where the synthetic curve is genuinely changing, so
    # "now" and "+2h" cannot coincidentally agree.
    now = weather.synthetic_weather(15.0).cloud_cover_pct
    ahead = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        weather.forecast_cloud_pct(15.0, 2.0)
    )
    assert ahead != now, "forecast is identical to the current reading"


def test_forecast_survives_a_dead_network(monkeypatch):
    """Open-Meteo down must degrade to the synthetic curve, not raise."""
    import asyncio

    from app import config, weather

    monkeypatch.setattr(config, "WEATHER_MODE", "live")

    class Boom:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): raise RuntimeError("network down")

    monkeypatch.setattr(weather.httpx, "AsyncClient", Boom)
    weather.reset_cache()

    value = asyncio.get_event_loop_policy().new_event_loop().run_until_complete(
        weather.forecast_cloud_pct(12.0, 2.0)
    )
    assert 0.0 <= value <= 100.0
