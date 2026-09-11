"""Pricing — Dev, H4-H7.

Uniform-price double auction on 15-minute slots: asks ascending, bids
descending, clear where they cross. Every buyer who clears pays the same price
and every seller who clears receives it, which is both simpler to explain and
harder to game than pay-as-bid.

Then the hard invariant, carried over from Phase 1 — the PRICE CORRIDOR:

    feed_in_tariff <= clearing_price <= retail_tariff

Above the floor the seller beats exporting to the grid; below the ceiling the
buyer beats importing from it. Neither party can ever be worse off than not
trading at all. That is the entire economic argument of the project, so it is
enforced here, again in the matcher, and again in EnergyEscrow.sol. A single
check would be a single point of failure.

The DISCOM's wheeling charge comes off the top: the utility is a partner whose
wires we are using, not something we route around.
"""

from __future__ import annotations

from . import config
from .models import Bid, Listing, TariffContext


def clamp_to_corridor(price_paise: int, tariff: TariffContext) -> int:
    """The invariant. Every price that reaches a trade passes through here."""
    return max(
        tariff.feed_in_tariff_paise,
        min(int(price_paise), tariff.retail_tariff_paise),
    )


def clear_slot(
    listings: list[Listing],
    bids: list[Bid],
    tariff: TariffContext,
) -> tuple[int, float]:
    """Return (clearing_price_paise, matched_volume_kwh).

    Walks the supply and demand curves together. At each step we take the
    cheapest unsold ask and the highest unfilled bid; while the bid is willing
    to pay at least the ask, that volume can trade. The clearing price is the
    midpoint of the last crossing pair — the standard compromise between
    favouring buyers and favouring sellers.

    With no crossing at all, volume is zero and we return the indicative price
    so the UI still has something sensible to display.
    """
    asks = sorted((l for l in listings if l.kwh > 0), key=lambda l: l.ask_price_paise)
    offers = sorted((b for b in bids if b.kwh > 0), key=lambda b: -b.max_price_paise)

    if not asks or not offers:
        return clamp_to_corridor(config.BASE_PRICE_PAISE, tariff), 0.0

    i = j = 0
    ask_left = asks[0].kwh
    bid_left = offers[0].kwh
    volume = 0.0
    last_ask: int | None = None
    last_bid: int | None = None

    while i < len(asks) and j < len(offers):
        ask, bid = asks[i], offers[j]
        if bid.max_price_paise < ask.ask_price_paise:
            break  # the curves have crossed; nothing further can trade

        traded = min(ask_left, bid_left)
        volume += traded
        ask_left -= traded
        bid_left -= traded
        last_ask, last_bid = ask.ask_price_paise, bid.max_price_paise

        if ask_left <= 1e-9:
            i += 1
            if i < len(asks):
                ask_left = asks[i].kwh
        if bid_left <= 1e-9:
            j += 1
            if j < len(offers):
                bid_left = offers[j].kwh

    if last_ask is None or last_bid is None:
        return clamp_to_corridor(config.BASE_PRICE_PAISE, tariff), 0.0

    midpoint = (last_ask + last_bid) // 2
    return clamp_to_corridor(midpoint, tariff), round(volume, 4)


def indicative_price(
    supply_kwh: float,
    demand_kwh: float,
    congestion_index: float,
    tariff: TariffContext,
) -> int:
    """Reference price shown before a slot clears.

        base + demand pressure - supply pressure + congestion

    Pressure is expressed as a fraction of the corridor width, so the formula
    cannot push the price outside the corridor no matter how lopsided the
    market gets. Deliberately interpretable: a judge can read this off a slide
    and verify it against the dashboard.
    """
    corridor = tariff.retail_tariff_paise - tariff.feed_in_tariff_paise
    base = (tariff.feed_in_tariff_paise + tariff.retail_tariff_paise) / 2.0

    total = supply_kwh + demand_kwh
    if total <= 1e-9:
        return clamp_to_corridor(int(round(base)), tariff)

    # -1 (pure supply) .. +1 (pure demand)
    imbalance = (demand_kwh - supply_kwh) / total

    price = base + 0.35 * corridor * imbalance
    price += 0.15 * corridor * max(0.0, min(congestion_index, 1.0))

    return clamp_to_corridor(int(round(price)), tariff)


def split_settlement(
    delivered_kwh: float, price_paise: int, tariff: TariffContext
) -> tuple[int, int, int]:
    """Return (gross_paise, wheeling_fee_paise, net_to_seller_paise).

    Settlement pays on DELIVERED kWh, not contracted kWh. Line losses are real
    and the buyer should not be billed for electricity that never arrived.
    """
    gross = int(round(delivered_kwh * price_paise))
    wheeling = int(round(delivered_kwh * tariff.wheeling_charge_paise))
    # The fee can never exceed the gross, however the tariffs are configured.
    wheeling = min(wheeling, gross)
    return gross, wheeling, gross - wheeling
