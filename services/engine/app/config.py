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

# Per-SEGMENT losses, by voltage level. These are the primitives: the familiar
# hop tiers are what they sum to along a path, which keeps the interpretable
# story and the flow network using exactly the same numbers.
#
#   same feeder       0.25 + 0.25                      = 0.50%
#   same substation   0.25 + 0.75 + 0.75 + 0.25        = 2.00%
#   cross substation  0.25 + 0.75 + 3.0 + 0.75 + 0.25  = 5.00%
LOSS_SEGMENT_HOUSE_FEEDER_PCT = 0.25       # low-voltage service drop
LOSS_SEGMENT_FEEDER_SUBSTATION_PCT = 0.75  # 11 kV distribution feeder
LOSS_SEGMENT_SUBSTATION_LINK_PCT = 3.0     # high-tension inter-substation link

# Kept for reference and for the tests that pin the tier arithmetic.
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

# Simulated minutes per real second. 1 => a full 24h day in 24 real minutes,
# which is the pace the demo is written around. Raise it for fast-forward.
SIM_SPEED = float(os.getenv("SIM_SPEED", "1"))
SIM_SEED = int(os.getenv("SIM_SEED", "2026"))
SIM_TICK_SECONDS = float(os.getenv("SIM_TICK_SECONDS", "1.0"))

DEMO_LAT = float(os.getenv("DEMO_LAT", "23.2156"))   # Gandhinagar, Gujarat
DEMO_LNG = float(os.getenv("DEMO_LNG", "72.6369"))
DEMO_TZ_OFFSET_HOURS = 5.5

# WEATHER_MODE:
#   auto      use live Open-Meteo only when the real sun is up at the demo
#             location, otherwise synthetic. Keeps the snapshot internally
#             consistent when you rehearse at 4am.
#   live      always use Open-Meteo
#   synthetic never call the network
WEATHER_MODE = os.getenv("WEATHER_MODE", "auto")

# --------------------------------------------------------------- weather ---

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_REFRESH_SECONDS = 900
WEATHER_TIMEOUT_SECONDS = 5.0

# ------------------------------------------------------------- AI broker ---

# The broker works with either provider, or neither. Whatever is configured,
# the model's output goes through the same validation and corridor clamping, so
# the guardrails do not depend on which vendor answered.
#
# LLM_PROVIDER: auto | anthropic | openai | none
#   auto  -> use Anthropic if its key is set, else OpenAI, else the rule-based
#            fallback. This is what you want; the explicit values are for
#            pinning one provider during testing.
#   none  -> never call out, always use the fallback parser.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").lower()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("BROKER_MODEL", "claude-sonnet-5")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

BROKER_TIMEOUT_SECONDS = float(os.getenv("BROKER_TIMEOUT_SECONDS", "12"))

# Kept as an alias so nothing that already imports BROKER_MODEL breaks.
BROKER_MODEL = ANTHROPIC_MODEL


def active_llm_provider() -> str:
    """Which provider will actually be used, given the current environment."""
    if LLM_PROVIDER == "none":
        return "none"
    if LLM_PROVIDER == "anthropic":
        return "anthropic" if ANTHROPIC_API_KEY else "none"
    if LLM_PROVIDER == "openai":
        return "openai" if OPENAI_API_KEY else "none"
    if ANTHROPIC_API_KEY:
        return "anthropic"
    if OPENAI_API_KEY:
        return "openai"
    return "none"

# ------------------------------------------------------------------ misc ---

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
