"""
SunShare engine — configuration and constants.

Mirror of: packages/shared/src/constants.ts (keep the two in sync).

⚠️ Tariff figures are ILLUSTRATIVE. Re-derive against the actual state DISCOM
tariff order before any use beyond the hackathon. See docs/PRD.md §13.
"""

from __future__ import annotations

import os

from .models import TariffContext

# ---------------------------------------------------------------- market ---

SLOT_MINUTES = 15

DEFAULT_TARIFF = TariffContext(
    feed_in_tariff_paise=215,   # ₹2.15 — DISCOM export rate
    retail_tariff_paise=650,    # ₹6.50 — neighbour's import rate
    wheeling_charge_paise=45,   # ₹0.45 — DISCOM's cut per traded unit
)

BASE_PRICE_PAISE = (
    DEFAULT_TARIFF.feed_in_tariff_paise + DEFAULT_TARIFF.retail_tariff_paise
) // 2

# --------------------------------------------------------- network losses ---

LOSS_SAME_FEEDER_PCT = 0.5
LOSS_SAME_SUBSTATION_PCT = 2.0
LOSS_CROSS_SUBSTATION_PCT = 5.0
LOSS_PER_KM_PCT = 0.06

CONGESTION_HIGH_THRESHOLD = 0.75
CONGESTION_CRITICAL_THRESHOLD = 0.95
CONGESTION_PENALTY_MAX_PAISE = 120

# ---------------------------------------------------------------- carbon ---

GRID_EMISSION_FACTOR = 0.71    # kg CO2/kWh — CEA CO2 Baseline Database
SOLAR_EMISSION_FACTOR = 0.04   # kg CO2/kWh — rooftop solar lifecycle
TD_LOSS_FRACTION = 0.17        # Indian T&D losses avoided by local consumption

CO2_AVOIDED_PER_KWH = (GRID_EMISSION_FACTOR - SOLAR_EMISSION_FACTOR) * (
    1 + TD_LOSS_FRACTION
)

KG_CO2_PER_TREE_YEAR = 21

# ------------------------------------------------------------- simulator ---

SIM_SPEED = float(os.getenv("SIM_SPEED", "60"))   # sim minutes per real second
SIM_SEED = int(os.getenv("SIM_SEED", "2026"))
SIM_TICK_SECONDS = float(os.getenv("SIM_TICK_SECONDS", "1.0"))

DEMO_LAT = float(os.getenv("DEMO_LAT", "23.2156"))   # Gandhinagar, Gujarat
DEMO_LNG = float(os.getenv("DEMO_LNG", "72.6369"))
DEMO_TZ_OFFSET_HOURS = 5.5

# --------------------------------------------------------------- weather ---

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_REFRESH_SECONDS = 900
WEATHER_TIMEOUT_SECONDS = 5.0

# ------------------------------------------------------------- AI broker ---

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
BROKER_MODEL = os.getenv("BROKER_MODEL", "claude-sonnet-5")
BROKER_TIMEOUT_SECONDS = float(os.getenv("BROKER_TIMEOUT_SECONDS", "12"))

# ------------------------------------------------------------------ misc ---

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
