"""Pricing tests — the corridor invariant is the one thing that must never break."""

import pytest

from app.config import DEFAULT_TARIFF
from app.pricing import clamp_to_corridor


def test_clamp_holds_floor():
    assert clamp_to_corridor(100, DEFAULT_TARIFF) == DEFAULT_TARIFF.feed_in_tariff_paise


def test_clamp_holds_ceiling():
    assert clamp_to_corridor(9999, DEFAULT_TARIFF) == DEFAULT_TARIFF.retail_tariff_paise


def test_clamp_passes_through_mid():
    assert clamp_to_corridor(400, DEFAULT_TARIFF) == 400


@pytest.mark.skip(reason="TODO(Dev, H4-H7): implement clear_slot")
def test_clearing_price_is_always_inside_corridor():
    ...
