"""Pricing — Dev, H4-H7.

Uniform-price double auction on 15-minute slots:
    asks ascending, bids descending, clear where they cross.

Then the hard invariant, carried over from Phase 1 — the PRICE CORRIDOR:

    feed_in_tariff <= clearing_price <= retail_tariff

Above the floor the seller beats exporting to the grid; below the ceiling the
buyer beats importing from it. Neither party can ever be worse off than not
trading, which is the whole economic argument of the project. The DISCOM's
wheeling charge comes off the top so the utility is a partner, not bypassed.
"""

from __future__ import annotations

from .models import Bid, Listing, TariffContext


def clear_slot(
    listings: list[Listing],
    bids: list[Bid],
    tariff: TariffContext,
) -> tuple[int, float]:
    """Return (clearing_price_paise, matched_volume_kwh).

    TODO(Dev): sort, walk the crossing point, take the midpoint of the last
    crossing pair, then clamp into the corridor.
    """
    raise NotImplementedError


def clamp_to_corridor(price_paise: int, tariff: TariffContext) -> int:
    """Hard invariant. Every price that reaches a trade passes through here."""
    return max(
        tariff.feed_in_tariff_paise,
        min(price_paise, tariff.retail_tariff_paise),
    )


def indicative_price(
    supply_kwh: float,
    demand_kwh: float,
    congestion_index: float,
    tariff: TariffContext,
) -> int:
    """Reference price shown before a slot clears.

    base + demand pressure - supply pressure + congestion, then clamped.
    Deliberately interpretable: judges can read this off one slide.
    """
    raise NotImplementedError


def split_settlement(
    delivered_kwh: float, price_paise: int, tariff: TariffContext
) -> tuple[int, int, int]:
    """Return (gross_paise, wheeling_fee_paise, net_to_seller_paise).

    Settlement pays on DELIVERED kWh, not contracted kWh — line losses are real
    and the buyer should not pay for electricity that never arrived.
    """
    raise NotImplementedError
