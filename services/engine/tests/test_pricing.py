"""Pricing tests — Dev, H4-H7.

The price corridor is the project's core economic claim, so it gets adversarial
order books rather than tidy ones. If this file goes red, the pitch is wrong.
"""

from __future__ import annotations

import random

import pytest

from app.config import BASE_PRICE_PAISE, DEFAULT_TARIFF
from app.models import Bid, Listing, TariffContext
from app.pricing import clamp_to_corridor, clear_slot, indicative_price, split_settlement

T = DEFAULT_TARIFF
FLOOR, CEIL = T.feed_in_tariff_paise, T.retail_tariff_paise


def _l(i, kwh, price):
    return Listing(id=f"L{i}", seller_id=f"S{i}", meter_id=f"M{i}", node_id="H-01",
                   kwh=kwh, ask_price_paise=price, slot_id="T", expires_at_sim="T", status="OPEN")


def _b(i, kwh, price):
    return Bid(id=f"B{i}", buyer_id=f"U{i}", meter_id=f"N{i}", node_id="H-02",
               kwh=kwh, max_price_paise=price, slot_id="T", status="OPEN")


# ------------------------------------------------------------- the clamp ---


def test_clamp_holds_floor():
    assert clamp_to_corridor(1, T) == FLOOR
    assert clamp_to_corridor(-9999, T) == FLOOR


def test_clamp_holds_ceiling():
    assert clamp_to_corridor(99999, T) == CEIL


def test_clamp_passes_through_mid():
    assert clamp_to_corridor(400, T) == 400


# ------------------------------------------------------------- the auction ---


def test_clearing_price_inside_corridor_on_random_books():
    rng = random.Random(11)
    for _ in range(500):
        listings = [_l(i, rng.uniform(0.1, 9), rng.randint(0, 1200)) for i in range(rng.randint(0, 8))]
        bids = [_b(i, rng.uniform(0.1, 9), rng.randint(0, 1200)) for i in range(rng.randint(0, 8))]
        price, volume = clear_slot(listings, bids, T)
        assert FLOOR <= price <= CEIL, f"corridor breached: {price}"
        assert volume >= 0


def test_no_crossing_means_no_volume():
    """Every ask above every bid: nothing can trade."""
    price, volume = clear_slot([_l(1, 5, 600)], [_b(1, 5, 300)], T)
    assert volume == 0.0
    assert FLOOR <= price <= CEIL


def test_simple_crossing_clears_at_midpoint():
    price, volume = clear_slot([_l(1, 5, 300)], [_b(1, 5, 500)], T)
    assert price == 400
    assert volume == pytest.approx(5.0)


def test_volume_is_limited_by_the_short_side():
    _, volume = clear_slot([_l(1, 2, 300)], [_b(1, 9, 500)], T)
    assert volume == pytest.approx(2.0)
    _, volume = clear_slot([_l(1, 9, 300)], [_b(1, 2, 500)], T)
    assert volume == pytest.approx(2.0)


def test_marginal_orders_excluded_beyond_the_cross():
    """A third ask priced above every bid must not add volume."""
    _, v1 = clear_slot([_l(1, 2, 300), _l(2, 2, 350)], [_b(1, 4, 500)], T)
    _, v2 = clear_slot([_l(1, 2, 300), _l(2, 2, 350), _l(3, 5, 900)], [_b(1, 4, 500)], T)
    assert v1 == pytest.approx(v2)


def test_empty_sides_are_safe():
    for listings, bids in (([], []), ([_l(1, 5, 300)], []), ([], [_b(1, 5, 500)])):
        price, volume = clear_slot(listings, bids, T)
        assert volume == 0.0
        assert FLOOR <= price <= CEIL


def test_extreme_tariffs_still_respected():
    """A degenerate corridor must still hold rather than invert."""
    narrow = TariffContext(feed_in_tariff_paise=400, retail_tariff_paise=401, wheeling_charge_paise=0)
    price, _ = clear_slot([_l(1, 5, 100)], [_b(1, 5, 900)], narrow)
    assert 400 <= price <= 401


# ---------------------------------------------------------- indicative price ---


def test_indicative_price_inside_corridor_under_any_imbalance():
    for supply in (0, 0.001, 1, 50, 5000):
        for demand in (0, 0.001, 1, 50, 5000):
            for congestion in (0.0, 0.5, 1.0, 2.0, -1.0):
                p = indicative_price(supply, demand, congestion, T)
                assert FLOOR <= p <= CEIL


def test_more_demand_raises_price_more_supply_lowers_it():
    glut = indicative_price(supply_kwh=100, demand_kwh=1, congestion_index=0, tariff=T)
    balanced = indicative_price(supply_kwh=50, demand_kwh=50, congestion_index=0, tariff=T)
    scarcity = indicative_price(supply_kwh=1, demand_kwh=100, congestion_index=0, tariff=T)
    assert glut < balanced < scarcity


def test_congestion_only_pushes_price_up():
    calm = indicative_price(10, 10, 0.0, T)
    busy = indicative_price(10, 10, 1.0, T)
    assert busy > calm


def test_empty_market_sits_at_base():
    assert indicative_price(0, 0, 0, T) == clamp_to_corridor(BASE_PRICE_PAISE, T)


# ------------------------------------------------------------- settlement ---


def test_settlement_splits_add_up():
    gross, wheeling, net = split_settlement(10.0, 500, T)
    assert gross == 5000
    assert wheeling == 450
    assert net == gross - wheeling


def test_wheeling_never_exceeds_gross():
    weird = TariffContext(feed_in_tariff_paise=1, retail_tariff_paise=10, wheeling_charge_paise=9999)
    gross, wheeling, net = split_settlement(3.0, 5, weird)
    assert wheeling <= gross
    assert net >= 0


def test_settlement_pays_on_delivered_not_contracted():
    """10 kWh contracted, 9.5 delivered: the buyer pays for 9.5."""
    full, _, _ = split_settlement(10.0, 500, T)
    lossy, _, _ = split_settlement(9.5, 500, T)
    assert lossy < full
