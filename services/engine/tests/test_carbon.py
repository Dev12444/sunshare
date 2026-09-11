"""Carbon tests — Dev, H11.5-H12.5."""

import pytest

from app.carbon import co2_avoided_kg, grid_comparison_kg, summarise, tree_equivalent
from app.config import CO2_AVOIDED_PER_KWH, GRID_EMISSION_FACTOR, SOLAR_EMISSION_FACTOR


def test_avoided_factor_is_sane():
    # (0.71 - 0.04) * 1.17
    assert 0.75 < CO2_AVOIDED_PER_KWH < 0.85


def test_avoided_is_less_than_grid_emissions():
    """Solar is not zero-carbon, so avoided must be strictly below the grid figure."""
    assert co2_avoided_kg(100) < grid_comparison_kg(100)


def test_avoided_scales_linearly():
    assert co2_avoided_kg(10) == pytest.approx(10 * co2_avoided_kg(1), rel=1e-6)


def test_zero_and_negative_are_zero():
    for f in (co2_avoided_kg, grid_comparison_kg, tree_equivalent):
        assert f(0) == 0.0
        assert f(-5) == 0.0


def test_tree_equivalence():
    # 21 kg CO2 per tree-year
    assert tree_equivalent(21.0) == pytest.approx(1.0)
    assert tree_equivalent(210.0) == pytest.approx(10.0)


def test_summary_is_internally_consistent():
    s = summarise("U-01", 50.0, "2026-09-01", "2026-09-30")
    assert s.co2_avoided_kg == co2_avoided_kg(50.0)
    assert s.tree_equivalent == tree_equivalent(s.co2_avoided_kg)
    assert s.grid_comparison_kg > s.co2_avoided_kg
    assert s.local_kwh == 50.0


def test_solar_is_not_claimed_carbon_free():
    """A common overclaim. We must not be making it."""
    assert SOLAR_EMISSION_FACTOR > 0
    assert GRID_EMISSION_FACTOR > SOLAR_EMISSION_FACTOR
