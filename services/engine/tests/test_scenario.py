"""Scripted demo tests — Dev, H19-H21.

The demo is the deliverable. If a beat leaves state behind, the next one lies,
and we would find out in front of judges.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.scenario import BEATS, BY_KEY, DEMO_CONGESTED_EDGE


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_every_beat_is_reachable(client):
    for beat in BEATS:
        r = client.post("/sim/scenario", json={"beat": beat.key})
        assert r.status_code == 200, beat.key
        assert r.json()["beat"] == beat.key


def test_unknown_beat_is_rejected_with_the_valid_list(client):
    r = client.post("/sim/scenario", json={"beat": "not_a_beat"})
    assert r.status_code == 404
    assert "midday_surplus" in r.json()["detail"]


def test_beats_are_order_independent(client):
    """Jumping from the congestion beat straight to any other must clear it.

    Regression guard: a stuck congested line would silently poison every
    subsequent beat.
    """
    for beat in BEATS:
        client.post("/sim/scenario", json={"beat": "congestion"})
        r = client.post("/sim/scenario", json={"beat": beat.key})
        congested = r.json()["congestedEdges"]
        if beat.congest:
            assert congested == [DEMO_CONGESTED_EDGE], beat.key
        else:
            assert congested == [], f"{beat.key} inherited congestion"


def test_congestion_beat_congests_the_right_line(client):
    r = client.post("/sim/scenario", json={"beat": "congestion"})
    assert r.json()["congestedEdges"] == [DEMO_CONGESTED_EDGE]


def test_beats_are_reproducible(client):
    """Same beat twice must give identical market state — rehearsal == stage."""
    for key in ("midday_surplus", "evening_peak"):
        first = client.post("/sim/scenario", json={"beat": key}).json()["market"]
        client.post("/sim/scenario", json={"beat": "dawn"})
        second = client.post("/sim/scenario", json={"beat": key}).json()["market"]
        assert first == second, key


def test_the_story_actually_holds(client):
    """The narrative arc has to be true, not just asserted in the script."""
    def market(key):
        return client.post("/sim/scenario", json={"beat": key}).json()["market"]

    dawn = market("dawn")
    midday = market("midday_surplus")
    evening = market("evening_peak")

    # No sun at either end of the day.
    assert dawn["totalSupplyKwh"] == 0.0
    assert evening["totalSupplyKwh"] == 0.0
    # Midday is where the surplus is, and it exceeds local demand.
    assert midday["totalSupplyKwh"] > midday["totalDemandKwh"]
    # Abundance is cheap, scarcity is dear — the whole economic argument.
    assert midday["indicativePricePaise"] < dawn["indicativePricePaise"]
    assert midday["indicativePricePaise"] < evening["indicativePricePaise"]
    # Evening demand is the day's peak.
    assert evening["totalDemandKwh"] > midday["totalDemandKwh"]


def test_congestion_raises_the_price(client):
    calm = client.post("/sim/scenario", json={"beat": "local_match"}).json()["market"]
    busy = client.post("/sim/scenario", json={"beat": "congestion"}).json()["market"]
    assert busy["indicativePricePaise"] > calm["indicativePricePaise"]
    assert busy["congestionIndex"] > calm["congestionIndex"]


def test_beat_index_is_serialisable_for_the_ui(client):
    beats = client.get("/sim/scenario").json()["beats"]
    assert len(beats) == len(BEATS)
    for b in beats:
        assert b["narration"] and b["watchFor"]
        assert 0 <= b["hour"] < 24


def test_every_beat_carries_narration_and_a_check():
    """Maansi reads the narration; the watch_for is what stops us claiming
    something the screen does not show."""
    for beat in BEATS:
        assert len(beat.narration) > 60, beat.key
        assert len(beat.watch_for) > 20, beat.key
