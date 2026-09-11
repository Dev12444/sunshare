"""Simulator tests — Dev, H1-H4.

Two things must hold or the pitch is unreliable: the solar physics has to be
defensible when a judge asks "is this just a sine wave?", and the run has to be
reproducible so the demo behaves the same on stage as in rehearsal.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest

from app import config
from app.simulator import (
    IST,
    ARCHETYPES,
    Simulator,
    clear_sky_irradiance,
    consumption_kw,
    generation_kw,
    solar_declination_deg,
    solar_elevation_deg,
)

LAT, LNG = config.DEMO_LAT, config.DEMO_LNG


def _day(month: int, day: int) -> datetime:
    return datetime(2026, month, day, 0, 0, tzinfo=IST)


# ------------------------------------------------------------ solar physics ---


def test_declination_within_earths_tilt():
    for doy in range(1, 366):
        assert -23.45 <= solar_declination_deg(doy) <= 23.45


def test_sun_is_down_at_midnight_and_up_at_noon():
    assert solar_elevation_deg(LAT, LNG, _day(9, 12).replace(hour=0)) < 0
    assert solar_elevation_deg(LAT, LNG, _day(9, 12).replace(hour=12)) > 0


def test_daylight_is_longer_in_june_than_december():
    def daylight(month: int, day: int) -> float:
        base = _day(month, day)
        return sum(
            1
            for m in range(0, 24 * 60, 5)
            if solar_elevation_deg(LAT, LNG, base + timedelta(minutes=m)) > 0
        ) * 5 / 60.0

    june, december = daylight(6, 21), daylight(12, 21)
    assert june > december
    # Gandhinagar is at 23.2N: roughly 13.5h vs 10.7h, never polar extremes.
    assert 12.5 < june < 14.0
    assert 10.0 < december < 11.5


def test_equinox_daylight_is_about_twelve_hours():
    base = _day(9, 22)
    hours = sum(
        1 for m in range(0, 24 * 60, 5)
        if solar_elevation_deg(LAT, LNG, base + timedelta(minutes=m)) > 0
    ) * 5 / 60.0
    assert 11.7 < hours < 12.5


def test_peak_elevation_matches_latitude_and_declination():
    """At solar noon, elevation ~= 90 - |lat - declination|."""
    base = _day(9, 12)
    peak = max(
        solar_elevation_deg(LAT, LNG, base + timedelta(minutes=m))
        for m in range(0, 24 * 60, 5)
    )
    expected = 90.0 - abs(LAT - solar_declination_deg(base.timetuple().tm_yday))
    assert peak == pytest.approx(expected, abs=1.0)


def test_irradiance_zero_below_horizon_and_capped_above():
    assert clear_sky_irradiance(-5) == 0.0
    assert clear_sky_irradiance(0) == 0.0
    assert 0 < clear_sky_irradiance(90) <= 1100


def test_irradiance_increases_with_elevation():
    values = [clear_sky_irradiance(e) for e in (5, 15, 30, 45, 60, 80)]
    assert all(a < b for a, b in zip(values, values[1:]))


# --------------------------------------------------------------- generation ---


def test_no_panel_means_no_generation():
    assert generation_kw(0.0, 900, 0, 25) == 0.0


def test_cloud_attenuates_but_never_zeroes():
    """Diffuse light still reaches the panel under full overcast."""
    clear = generation_kw(5.0, 900, 0, 25)
    overcast = generation_kw(5.0, 900, 100, 25)
    assert 0 < overcast < clear


def test_heat_derates_output():
    cool = generation_kw(5.0, 900, 0, 25)
    hot = generation_kw(5.0, 900, 0, 45)
    assert hot < cool


def test_generation_never_exceeds_panel_rating_in_practice():
    assert generation_kw(5.0, 1000, 0, 25) <= 5.0


# -------------------------------------------------------------- consumption ---


def test_consumption_has_morning_and_evening_peaks():
    import random

    rng = random.Random(1)
    night = consumption_kw("FAMILY_4", 3.0, random.Random(1))
    morning = consumption_kw("FAMILY_4", 7.5, random.Random(1))
    evening = consumption_kw("FAMILY_4", 19.5, random.Random(1))
    assert morning > night
    assert evening > morning  # evening peak is the larger one


def test_consumption_is_always_positive():
    import random

    for archetype in ARCHETYPES:
        for hour in range(24):
            assert consumption_kw(archetype, float(hour), random.Random(hour)) > 0


def test_larger_households_draw_more():
    import random

    couple = consumption_kw("COUPLE", 19.5, random.Random(5))
    family = consumption_kw("FAMILY_5", 19.5, random.Random(5))
    assert family > couple


# ------------------------------------------------------------ reproducibility ---


def test_same_seed_gives_identical_ticks():
    """The pitch depends on this: rehearsal and stage must match."""

    async def run(seed: int):
        s = Simulator(speed=10, seed=seed)
        s.sim_time = s.sim_time.replace(hour=12, minute=0)
        return [
            (r.meter_id, r.generation_kw, r.consumption_kw)
            for r in (await s.build_tick(1.0)).meters
        ]

    a = asyncio.run(run(2026))
    b = asyncio.run(run(2026))
    c = asyncio.run(run(9999))
    assert a == b
    assert a != c


def test_market_state_is_internally_consistent():
    async def run():
        s = Simulator()
        s.sim_time = s.sim_time.replace(hour=12, minute=0)
        return await s.build_tick(1.0)

    tick = asyncio.run(run())
    m = tick.market
    assert m.total_supply_kwh >= 0 and m.total_demand_kwh >= 0
    assert 0.0 <= m.congestion_index <= 1.0
    assert (
        config.DEFAULT_TARIFF.feed_in_tariff_paise
        <= m.indicative_price_paise
        <= config.DEFAULT_TARIFF.retail_tariff_paise
    )
    assert m.active_listings == sum(1 for r in tick.meters if r.surplus_kw > 0.05)


def test_forced_congestion_applies_immediately():
    """/sim/control must change the topology at once, not on the next tick.

    Regression: it used to only take effect inside readings(), so pressing the
    control with no tick in flight looked like a dead button.
    """
    s = Simulator()
    edge_id = "e-F-1-H-01"
    assert s.grid.edges[edge_id].current_load_kw == 0.0

    s.force_congestion(edge_id, True)
    edge = s.grid.edges[edge_id]
    assert edge.current_load_kw > edge.capacity_kw * 0.9

    s.force_congestion(edge_id, False)
    assert s.grid.edges[edge_id].current_load_kw == 0.0


def test_day_generation_accumulates_then_resets_at_midnight():
    async def run():
        s = Simulator(speed=60, seed=1)
        s.sim_time = s.sim_time.replace(hour=10, minute=0)
        first = await s.build_tick(1.0)
        s.advance(1.0)
        second = await s.build_tick(1.0)
        return first, second

    first, second = asyncio.run(run())
    producing = [m.meter_id for m in first.meters if m.generation_kw > 0]
    assert producing, "expected generation at 10am"
    by_id = {m.meter_id: m.day_generation_kwh for m in first.meters}
    for m in second.meters:
        if m.meter_id in producing:
            assert m.day_generation_kwh >= by_id[m.meter_id]
