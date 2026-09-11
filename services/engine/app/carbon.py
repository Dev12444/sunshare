"""Carbon accounting — Dev, H11.5-H12.5. Feature #5.

    avoided = (grid_factor - solar_factor) * (1 + td_loss) * kWh

Buying a local kWh displaces a grid kWh (0.71 kg CO2, CEA baseline) with a
rooftop solar kWh (0.04 kg lifecycle), and also avoids the ~17% that would have
been lost getting it there. Tree equivalence at 21 kg CO2/tree/year.
"""

from __future__ import annotations

from .models import CarbonSummary


def co2_avoided_kg(local_kwh: float) -> float:
    """TODO(Dev): local_kwh * config.CO2_AVOIDED_PER_KWH."""
    raise NotImplementedError


def tree_equivalent(co2_kg: float) -> float:
    """TODO(Dev): co2_kg / config.KG_CO2_PER_TREE_YEAR."""
    raise NotImplementedError


def summarise(user_id: str, local_kwh: float, start: str, end: str) -> CarbonSummary:
    """TODO(Dev)."""
    raise NotImplementedError
