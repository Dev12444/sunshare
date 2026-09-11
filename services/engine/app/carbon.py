"""Carbon accounting — Dev, H11.5-H12.5. Feature #5.

    avoided = (grid_factor - solar_factor) * (1 + td_loss) * kWh

Buying a local kWh displaces a grid kWh (0.71 kg CO2, CEA CO2 Baseline
Database) with a rooftop solar kWh (0.04 kg lifecycle), and additionally avoids
the ~17% that would have been lost carrying it across the transmission and
distribution network. Tree equivalence uses 21 kg CO2 absorbed per urban tree
per year.

These are national-average figures and the UI labels them as such. They are
honest for a hackathon and clearly marked as needing a proper source before
anyone quotes them anywhere else.
"""

from __future__ import annotations

from . import config
from .models import CarbonSummary


def co2_avoided_kg(local_kwh: float) -> float:
    """CO2 avoided by serving `local_kwh` locally instead of from the grid."""
    if local_kwh <= 0:
        return 0.0
    return round(local_kwh * config.CO2_AVOIDED_PER_KWH, 4)


def grid_comparison_kg(local_kwh: float) -> float:
    """What the same energy would have emitted had it come off the grid."""
    if local_kwh <= 0:
        return 0.0
    return round(local_kwh * config.GRID_EMISSION_FACTOR * (1 + config.TD_LOSS_FRACTION), 4)


def tree_equivalent(co2_kg: float) -> float:
    """Urban trees, in tree-years, that would absorb this much CO2."""
    if co2_kg <= 0:
        return 0.0
    return round(co2_kg / config.KG_CO2_PER_TREE_YEAR, 4)


def summarise(
    user_id: str,
    local_kwh: float,
    period_start: str,
    period_end: str,
    rank: int | None = None,
) -> CarbonSummary:
    avoided = co2_avoided_kg(local_kwh)
    return CarbonSummary(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        local_kwh=round(local_kwh, 4),
        co2_avoided_kg=avoided,
        tree_equivalent=tree_equivalent(avoided),
        grid_comparison_kg=grid_comparison_kg(local_kwh),
        rank=rank,
    )
