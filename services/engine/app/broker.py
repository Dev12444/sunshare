"""Agentic AI Energy Broker — Dev, H13-H15. Feature #1.

The user writes a goal in plain language:

    "sell fast before sunset but never below 4.50"

Claude turns that into ONE validated BrokerPolicy object. A deterministic
executor then acts on the policy each slot.

GUARDRAILS — these are the design, not decoration:
  * the model's only output is a BrokerPolicy, validated against the schema
  * min/max prices are clamped into the price corridor before anything runs
  * the model never signs a transaction, never settles, never moves money
  * every executor decision is logged with a human-readable reason, which is
    what the Agent Activity feed shows the judges
  * if the API errors or times out, parse_fallback() maps the goal onto one of
    four preset policies, so the demo cannot break on a network hiccup
"""

from __future__ import annotations

from .models import (
    BrokerDecision,
    BrokerPolicy,
    Listing,
    MarketState,
    MeterReading,
    TariffContext,
)

# Tool schema handed to the model. Structured output, not free text.
POLICY_TOOL = {
    "name": "set_trading_policy",
    "description": (
        "Convert the user's plain-language energy trading goal into a "
        "structured policy. Prices are in paise per kWh."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "objective": {
                "type": "string",
                "enum": ["MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY"],
            },
            "minPricePaise": {"type": "integer"},
            "maxPricePaise": {"type": "integer"},
            "urgency": {"type": "number", "minimum": 0, "maximum": 1},
            "reserveKwh": {"type": "number", "minimum": 0},
            "communityDonationPct": {"type": "number", "minimum": 0, "maximum": 100},
            "rationale": {"type": "string"},
        },
        "required": ["objective", "minPricePaise", "maxPricePaise", "urgency",
                     "reserveKwh", "communityDonationPct", "rationale"],
    },
}


async def build_policy(
    user_id: str, goal: str, tariff: TariffContext
) -> BrokerPolicy:
    """Goal -> validated, corridor-clamped policy.

    TODO(Dev): anthropic.AsyncAnthropic().messages.create with tools=[POLICY_TOOL]
    and tool_choice forcing set_trading_policy. Validate, clamp, stamp
    source='llm'. On any exception -> parse_fallback().
    """
    raise NotImplementedError


def parse_fallback(user_id: str, goal: str, tariff: TariffContext) -> BrokerPolicy:
    """Keyword parser. Never fails, never calls the network.

    "fast"/"quick"/"sunset" -> SELL_FAST
    "profit"/"max"/"best"   -> MAX_PROFIT
    "community"/"donate"    -> MAX_COMMUNITY
    otherwise               -> BEAT_GRID
    TODO(Dev).
    """
    raise NotImplementedError


def execute(
    policy: BrokerPolicy,
    reading: MeterReading,
    market: MarketState,
    listing: Listing | None,
    minutes_to_sunset: float,
    forecast_cloud_pct: float,
) -> BrokerDecision:
    """One deterministic step for one user, once per slot.

    Shape of the rules:
      SELL_FAST  -> decay the ask from max toward min as sunset approaches
      MAX_PROFIT -> hold at max while the forecast says generation holds up
      BEAT_GRID  -> track the market price, staying just under retail
      MAX_COMMUNITY -> meet the donation percentage first, then sell the rest

    Always emits a decision with a `reason` string, even when the action is
    HOLD — a visible "did nothing, and here is why" is what makes the agent
    legible to a judge. TODO(Dev).
    """
    raise NotImplementedError
