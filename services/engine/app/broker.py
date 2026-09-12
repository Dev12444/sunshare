"""Agentic AI Energy Broker — Dev, H13-H15. Feature #1.

The user writes a goal in plain language:

    "sell fast before sunset but never below 4.50"

A language model turns that into ONE validated BrokerPolicy object, and a
deterministic executor then acts on that policy each slot. Anthropic and OpenAI
are both supported; the guardrails below are applied to whichever answered, so
they do not depend on the vendor.

GUARDRAILS — these are the design, not decoration:

  * the model's only output is a BrokerPolicy, produced through a tool schema
    so it is structured by construction rather than parsed out of prose
  * min/max prices are clamped into the price corridor AFTER the model returns,
    so a hallucinated price simply cannot escape the corridor
  * the model never signs a transaction, never settles, never moves money, and
    never chooses a counterparty - the matcher does that
  * every executor decision is logged with a human-readable reason, which is
    what the Agent Activity feed shows the judges
  * if the API errors, times out, or is not configured, parse_fallback() maps
    the goal onto one of four preset policies. The demo cannot break on a
    network hiccup, and the feature degrades to "rule-based" rather than "gone"

The blast radius of a completely adversarial model response is therefore: a
policy inside the corridor, with a reserve between 0 and the household's own
surplus, that sells energy at a price no worse than the grid would have paid.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta

from . import config
from .models import (
    BrokerDecision,
    BrokerDecisionInputs,
    BrokerPolicy,
    Listing,
    MarketState,
    MeterReading,
    TariffContext,
)
from .pricing import clamp_to_corridor

# Structured output, not free text. The model fills this in or we do not use it.
POLICY_TOOL = {
    "name": "set_trading_policy",
    "description": (
        "Convert the user's plain-language energy trading goal into a structured "
        "policy for an automated rooftop-solar broker. All prices are in paise "
        "per kWh (100 paise = 1 rupee)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "objective": {
                "type": "string",
                "enum": ["MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY"],
                "description": (
                    "MAX_PROFIT: hold out for the best price. "
                    "SELL_FAST: prioritise selling everything before sunset. "
                    "BEAT_GRID: track the market, staying below the retail tariff. "
                    "MAX_COMMUNITY: prioritise donating to the community pool."
                ),
            },
            "minPricePaise": {
                "type": "integer",
                "description": "Never sell below this. Paise per kWh.",
            },
            "maxPricePaise": {
                "type": "integer",
                "description": "Opening ask. Paise per kWh.",
            },
            "urgency": {
                "type": "number",
                "description": "0 = patient, 1 = sell immediately at almost any price.",
            },
            "reserveKwh": {
                "type": "number",
                "description": "Energy held back for the household's own use.",
            },
            "communityDonationPct": {
                "type": "number",
                "description": "Percentage of surplus routed to the community pool.",
            },
            "rationale": {
                "type": "string",
                "description": "One sentence, addressed to the user, explaining the policy.",
            },
        },
        "required": [
            "objective", "minPricePaise", "maxPricePaise", "urgency",
            "reserveKwh", "communityDonationPct", "rationale",
        ],
    },
}

SYSTEM_PROMPT = """You configure an automated broker that sells a household's \
surplus rooftop solar energy on a local peer-to-peer marketplace.

Market facts you must respect:
- Prices are in paise per kWh. 100 paise = 1 rupee.
- The seller's feed-in tariff (what the utility pays for export) is {floor} paise.
- The buyer's retail tariff (what the utility charges) is {ceiling} paise.
- Every trade clears between those two numbers, so a price outside that range \
is meaningless. Keep minPricePaise and maxPricePaise inside it.
- minPricePaise must be less than or equal to maxPricePaise.

Interpret the user's goal faithfully. If they name a rupee figure, convert it to \
paise. If they do not mention donating, set communityDonationPct to 0. If they \
do not mention holding energy back, set reserveKwh to 0.

Call set_trading_policy exactly once."""


def _policy_from_fields(
    user_id: str,
    raw_goal: str,
    fields: dict,
    tariff: TariffContext,
    source: str,
    valid_until_sim: str,
) -> BrokerPolicy:
    """Validate, clamp, and stamp. Everything from the model passes through here."""
    lo = clamp_to_corridor(int(fields.get("minPricePaise", tariff.feed_in_tariff_paise)), tariff)
    hi = clamp_to_corridor(int(fields.get("maxPricePaise", tariff.retail_tariff_paise)), tariff)
    if lo > hi:
        lo, hi = hi, lo

    objective = fields.get("objective", "BEAT_GRID")
    if objective not in ("MAX_PROFIT", "SELL_FAST", "BEAT_GRID", "MAX_COMMUNITY"):
        objective = "BEAT_GRID"

    return BrokerPolicy(
        id=f"bp_{uuid.uuid4().hex[:10]}",
        user_id=user_id,
        raw_goal=raw_goal,
        objective=objective,  # type: ignore[arg-type]
        min_price_paise=lo,
        max_price_paise=hi,
        urgency=max(0.0, min(1.0, float(fields.get("urgency", 0.5)))),
        reserve_kwh=max(0.0, float(fields.get("reserveKwh", 0.0))),
        community_donation_pct=max(0.0, min(100.0, float(fields.get("communityDonationPct", 0.0)))),
        valid_until_sim=valid_until_sim,
        rationale=str(fields.get("rationale", ""))[:400],
        source=source,  # type: ignore[arg-type]
        created_at=datetime.now().isoformat(),
    )


async def _policy_via_anthropic(goal: str, tariff: TariffContext) -> dict:
    """Ask Claude for a policy. Returns the raw tool input dict."""
    import anthropic

    client = anthropic.AsyncAnthropic(
        api_key=config.ANTHROPIC_API_KEY,
        timeout=config.BROKER_TIMEOUT_SECONDS,
    )
    response = await client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=700,
        system=SYSTEM_PROMPT.format(
            floor=tariff.feed_in_tariff_paise, ceiling=tariff.retail_tariff_paise
        ),
        tools=[POLICY_TOOL],
        tool_choice={"type": "tool", "name": POLICY_TOOL["name"]},
        messages=[{"role": "user", "content": goal}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return dict(block.input)
    raise ValueError("anthropic returned no tool_use block")


async def _policy_via_openai(goal: str, tariff: TariffContext) -> dict:
    """Ask an OpenAI model for a policy. Returns the raw function-call args.

    Same schema, same system prompt, same validation afterwards — only the
    wire format differs.
    """
    import json

    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=config.OPENAI_API_KEY,
        timeout=config.BROKER_TIMEOUT_SECONDS,
    )
    response = await client.chat.completions.create(
        model=config.OPENAI_MODEL,
        max_tokens=700,
        tools=[{
            "type": "function",
            "function": {
                "name": POLICY_TOOL["name"],
                "description": POLICY_TOOL["description"],
                "parameters": POLICY_TOOL["input_schema"],
            },
        }],
        tool_choice={"type": "function", "function": {"name": POLICY_TOOL["name"]}},
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    floor=tariff.feed_in_tariff_paise,
                    ceiling=tariff.retail_tariff_paise,
                ),
            },
            {"role": "user", "content": goal},
        ],
    )
    calls = response.choices[0].message.tool_calls
    if not calls:
        raise ValueError("openai returned no tool_call")
    return json.loads(calls[0].function.arguments)


async def build_policy(
    user_id: str,
    goal: str,
    tariff: TariffContext | None = None,
    valid_until_sim: str | None = None,
) -> BrokerPolicy:
    """Goal -> validated, corridor-clamped policy.

    Works with Anthropic, with OpenAI, or with neither. Whichever answers, the
    result goes through the same _policy_from_fields validation, so the
    guardrails are independent of the vendor.

    Falls back to the keyword parser on any failure whatsoever, including a
    missing key or an uninstalled SDK. Failure here must never reach the
    audience.
    """
    tariff = tariff or config.DEFAULT_TARIFF
    valid_until = valid_until_sim or (datetime.now() + timedelta(hours=12)).isoformat()

    provider = config.active_llm_provider()
    if provider == "none":
        return parse_fallback(user_id, goal, tariff, valid_until)

    try:
        if provider == "anthropic":
            fields = await _policy_via_anthropic(goal, tariff)
        else:
            fields = await _policy_via_openai(goal, tariff)
        return _policy_from_fields(user_id, goal, fields, tariff, "llm", valid_until)

    except Exception:
        # Timeout, auth failure, rate limit, schema drift, missing SDK, malformed
        # arguments — all handled identically. The feature degrades to
        # rule-based rather than disappearing.
        return parse_fallback(user_id, goal, tariff, valid_until)


# ------------------------------------------------------------- fallback ---

# How far under the indicative market price an urgent seller posts. Small on
# purpose: enough to be the cheaper option, not enough to give away the spread.
UNDERCUT_PAISE = 10

_RUPEE = re.compile(r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?|rs)?", re.I)

# A number followed by an energy or time unit is a quantity, not a price.
# "sell 5 kWh" must not become a floor of five rupees — and five rupees sits
# inside the corridor, so the corridor check alone cannot catch it.
_QUANTITY_UNIT = re.compile(r"^\s*(?:kwh|kw|wh|units?|kilowatt|%|hours?|hrs?|min)", re.I)


def _prices_in_goal(goal: str, tariff: TariffContext) -> list[int]:
    """Pull plausible rupee-per-kWh figures out of the text, as paise.

    A figure is treated as a price only if it is not immediately followed by a
    unit of energy or time, and it lands inside the corridor. Anything else is
    a quantity, a duration, or noise.
    """
    found: list[int] = []
    for match in _RUPEE.finditer(goal):
        try:
            value = float(match.group(1))
        except ValueError:
            continue
        if _QUANTITY_UNIT.match(goal[match.end():]):
            continue
        paise = int(round(value * 100))
        if tariff.feed_in_tariff_paise <= paise <= tariff.retail_tariff_paise:
            found.append(paise)
    return sorted(set(found))


def parse_fallback(
    user_id: str,
    goal: str,
    tariff: TariffContext | None = None,
    valid_until_sim: str | None = None,
) -> BrokerPolicy:
    """Keyword parser. Never fails, never touches the network."""
    tariff = tariff or config.DEFAULT_TARIFF
    valid_until = valid_until_sim or (datetime.now() + timedelta(hours=12)).isoformat()
    text = goal.lower()

    if any(w in text for w in ("community", "donate", "school", "charity", "neighbour in need")):
        objective, urgency, donation = "MAX_COMMUNITY", 0.4, 20.0
    elif any(w in text for w in ("fast", "quick", "sunset", "asap", "immediately", "dump", "now")):
        objective, urgency, donation = "SELL_FAST", 0.85, 0.0
    elif any(w in text for w in ("profit", "maximum", "maximise", "maximize", "best price", "highest")):
        objective, urgency, donation = "MAX_PROFIT", 0.15, 0.0
    else:
        objective, urgency, donation = "BEAT_GRID", 0.5, 0.0

    prices = _prices_in_goal(goal, tariff)
    if len(prices) >= 2:
        lo, hi = prices[0], prices[-1]
    elif len(prices) == 1:
        # A single figure in a goal is almost always a floor ("never below X").
        lo, hi = prices[0], tariff.retail_tariff_paise
    else:
        lo, hi = tariff.feed_in_tariff_paise, tariff.retail_tariff_paise

    reserve = 0.0
    keep = re.search(r"(?:keep|reserve|hold back|save)\s*(\d+(?:\.\d+)?)", text)
    if keep:
        reserve = float(keep.group(1))

    # An explicitly stated percentage overrides the objective's default
    # outright. "Give 15%" means 15, not "at least 15".
    pct = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
    if pct:
        donation = min(100.0, float(pct.group(1)))

    return _policy_from_fields(
        user_id,
        goal,
        {
            "objective": objective,
            "minPricePaise": lo,
            "maxPricePaise": hi,
            "urgency": urgency,
            "reserveKwh": reserve,
            "communityDonationPct": donation,
            "rationale": (
                f"Rule-based reading of your goal: {objective.replace('_', ' ').lower()}, "
                f"selling between ₹{lo / 100:.2f} and ₹{hi / 100:.2f} per kWh."
            ),
        },
        tariff,
        "fallback",
        valid_until,
    )


# ------------------------------------------------------------- executor ---


def execute(
    policy: BrokerPolicy,
    reading: MeterReading,
    market: MarketState,
    listing: Listing | None,
    minutes_to_sunset: float,
    forecast_cloud_pct: float,
    tariff: TariffContext | None = None,
) -> BrokerDecision:
    """One deterministic step for one user, once per slot.

    No model call happens here. The policy is data; this is ordinary code, and
    it is what actually decides the ask price. That separation is the point.
    """
    tariff = tariff or config.DEFAULT_TARIFF
    inputs = BrokerDecisionInputs(
        surplus_kwh=round(max(0.0, reading.surplus_kw) * config.SLOT_MINUTES / 60.0, 4),
        minutes_to_sunset=round(minutes_to_sunset, 1),
        forecast_cloud_pct=round(forecast_cloud_pct, 1),
        market_price_paise=market.indicative_price_paise,
        congestion_index=round(market.congestion_index, 4),
    )

    sellable = max(0.0, inputs.surplus_kwh - policy.reserve_kwh)
    current = listing.ask_price_paise if listing else None

    def decision(action: str, kwh: float, to_price: int | None, reason: str) -> BrokerDecision:
        return BrokerDecision(
            id=f"bd_{uuid.uuid4().hex[:10]}",
            policy_id=policy.id,
            slot_id=market.slot_id,
            ts_sim=market.slot_start_sim,
            action=action,  # type: ignore[arg-type]
            kwh=round(kwh, 4),
            from_price_paise=current,
            to_price_paise=to_price,
            reason=reason,
            inputs=inputs,
        )

    # Nothing to sell.
    if sellable <= 0.01:
        if listing is not None:
            return decision(
                "WITHDRAW", 0.0, None,
                f"No surplus left this slot after reserving {policy.reserve_kwh:.2f} kWh "
                f"for your own use, so I pulled the listing.",
            )
        return decision(
            "HOLD", 0.0, current,
            f"Generation is {reading.generation_kw:.2f} kW against "
            f"{reading.consumption_kw:.2f} kW of your own demand — nothing spare to sell yet.",
        )

    # Community obligation comes first when that is the stated objective.
    if policy.community_donation_pct > 0 and policy.objective == "MAX_COMMUNITY":
        donate = sellable * policy.community_donation_pct / 100.0
        return decision(
            "DONATE", donate, None,
            f"Routing {policy.community_donation_pct:.0f}% of this slot's surplus "
            f"({donate:.2f} kWh) to the community pool, as you asked.",
        )

    span = policy.max_price_paise - policy.min_price_paise

    if policy.objective == "SELL_FAST":
        # Undercut the market, then walk down towards the floor as the deadline
        # approaches. Urgency steepens the descent; the floor is never crossed.
        #
        # The anchor MUST be the market, not policy.max_price_paise. That
        # ceiling is whatever the model inferred from the user's words, and it
        # is normally the retail tariff -- an ask pinned there costs the buyer
        # exactly what the grid costs, so it never clears. Anchoring on the
        # ceiling made SELL_FAST the slowest-selling objective we have, and
        # priced it ABOVE MAX_PROFIT, which is incoherent on its face.
        remaining = max(0.0, min(1.0, minutes_to_sunset / 240.0))
        decay = (1.0 - remaining) ** (1.0 + 2.0 * policy.urgency)
        anchor = min(
            policy.max_price_paise,
            market.indicative_price_paise - UNDERCUT_PAISE,
        )
        anchor = max(anchor, policy.min_price_paise)
        target = int(round(anchor - (anchor - policy.min_price_paise) * decay))
        reason = (
            f"{minutes_to_sunset:.0f} min of daylight left and you asked me to sell "
            f"before sunset, so I undercut the "
            f"₹{market.indicative_price_paise / 100:.2f} market at "
            f"₹{target / 100:.2f} to clear {sellable:.2f} kWh."
        )

    elif policy.objective == "MAX_PROFIT":
        # Hold high while the forecast says generation continues; concede only
        # when cloud is rolling in or the day is ending.
        pressure = max(forecast_cloud_pct / 100.0, 1.0 - min(1.0, minutes_to_sunset / 180.0))
        target = int(round(policy.max_price_paise - span * 0.4 * pressure))
        reason = (
            f"Holding near your ceiling at ₹{target / 100:.2f}: "
            f"{forecast_cloud_pct:.0f}% cloud forecast and {minutes_to_sunset:.0f} min "
            f"of daylight still ahead."
        )

    elif policy.objective == "MAX_COMMUNITY":
        target = int(round(policy.min_price_paise + span * 0.25))
        reason = (
            f"Pricing low at ₹{target / 100:.2f} so neighbours can afford it — "
            f"that is what you asked for."
        )

    else:  # BEAT_GRID
        # Track the market, undercutting the retail tariff so the buyer always
        # gains by trading locally.
        target = int(round(min(market.indicative_price_paise, tariff.retail_tariff_paise - 25)))
        reason = (
            f"Tracking the market at ₹{target / 100:.2f}, which undercuts the "
            f"₹{tariff.retail_tariff_paise / 100:.2f} grid rate for your neighbour."
        )

    # The clamp again. Belt and braces: the executor is ordinary code, but the
    # bounds it works from originated with a language model.
    target = clamp_to_corridor(target, tariff)
    target = max(policy.min_price_paise, min(target, policy.max_price_paise))

    if listing is None:
        return decision("LIST", sellable, target, reason)
    if current is not None and abs(current - target) < 5:
        return decision(
            "HOLD", sellable, current,
            f"Ask is already at ₹{current / 100:.2f}, within noise of where I want it. "
            f"Left it alone.",
        )
    return decision("REPRICE", sellable, target, reason)
