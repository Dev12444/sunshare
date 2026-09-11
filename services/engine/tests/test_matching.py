"""Matching tests — Dev, H9-H11.5.

The headline claim of feature #2 is that a nearer seller wins and a congested
line re-allocates. Those are demo steps 5 and 6, so they are tests, not hopes.

The solver itself is cross-checked against networkx: if our hand-rolled
min-cost max-flow ever disagrees with a reference implementation on a random
instance, we want to know from CI and not from a judge.
"""

from __future__ import annotations

import random

import networkx as nx
import pytest

from app.config import DEFAULT_TARIFF
from app.grid import GridIndex, load_topology
from app.matching import MinCostMaxFlow, match_slot
from app.models import Bid, Listing, MatchRequest


def _listing(i: int, node: str, kwh: float, price: int) -> Listing:
    return Listing(
        id=f"L{i}", seller_id=f"S{i}", meter_id=f"M{i}", node_id=node,
        kwh=kwh, ask_price_paise=price, slot_id="T", expires_at_sim="T", status="OPEN",
    )


def _bid(i: int, node: str, kwh: float, price: int) -> Bid:
    return Bid(
        id=f"B{i}", buyer_id=f"U{i}", meter_id=f"N{i}", node_id=node,
        kwh=kwh, max_price_paise=price, slot_id="T", status="OPEN",
    )


# ----------------------------------------------------- solver correctness ---


@pytest.mark.parametrize("trial", range(30))
def test_mcmf_agrees_with_networkx(trial: int) -> None:
    """Random layered networks; our min cost must equal networkx's exactly."""
    rng = random.Random(1000 + trial)

    n_sellers = rng.randint(1, 5)
    n_buyers = rng.randint(1, 5)
    n = 2 + n_sellers + n_buyers
    source, sink = 0, 1
    sellers = list(range(2, 2 + n_sellers))
    buyers = list(range(2 + n_sellers, n))

    arcs: list[tuple[int, int, int, int]] = []
    for s in sellers:
        arcs.append((source, s, rng.randint(1, 40), 0))
    for b in buyers:
        arcs.append((b, sink, rng.randint(1, 40), 0))
    for s in sellers:
        for b in buyers:
            if rng.random() < 0.75:
                arcs.append((s, b, rng.randint(1, 30), rng.randint(0, 50)))

    mine = MinCostMaxFlow(n)
    for u, v, cap, cost in arcs:
        mine.add_edge(u, v, cap, cost)
    my_flow, my_cost = mine.flow(source, sink)

    g = nx.DiGraph()
    g.add_nodes_from(range(n))
    for u, v, cap, cost in arcs:
        if g.has_edge(u, v):
            g[u][v]["capacity"] += cap
        else:
            g.add_edge(u, v, capacity=cap, weight=cost)

    ref_flow_value = nx.maximum_flow_value(g, source, sink)
    ref = nx.max_flow_min_cost(g, source, sink)
    ref_cost = nx.cost_of_flow(g, ref)

    assert my_flow == ref_flow_value, f"flow differs: {my_flow} vs {ref_flow_value}"
    assert my_cost == ref_cost, f"cost differs: {my_cost} vs {ref_cost}"


def test_mcmf_handles_no_path() -> None:
    m = MinCostMaxFlow(4)
    m.add_edge(0, 2, 10, 1)  # 2 is a dead end; nothing reaches the sink
    flow, cost = m.flow(0, 1)
    assert flow == 0
    assert cost == 0


def test_mcmf_ignores_zero_capacity_edges() -> None:
    m = MinCostMaxFlow(2)
    m.add_edge(0, 1, 0, 5)
    assert m.flow(0, 1) == (0, 0)


# --------------------------------------------------------- market behaviour ---


def test_prefers_closer_seller_at_equal_price() -> None:
    """Demo step 5. Same ask, same quantity — the same-feeder seller must win."""
    req = MatchRequest(
        slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
        listings=[_listing(1, "H-01", 5.0, 400), _listing(2, "H-10", 5.0, 400)],
        bids=[_bid(1, "H-02", 5.0, 500)],
    )
    result = match_slot(req)
    assert result.pairs, "nothing matched"
    assert {p.seller_id for p in result.pairs} == {"S1"}
    assert result.avg_efficiency_pct > 99.0


def test_congested_line_forces_alternative_seller() -> None:
    """Demo step 6. Saturate the near seller's service drop; the far seller
    must pick up the volume."""
    grid = GridIndex(load_topology())
    edge = grid.edge_between("F-1", "H-01")
    assert edge is not None
    edge.current_load_kw = edge.capacity_kw * 0.99

    req = MatchRequest(
        slot_id="T", tariff=DEFAULT_TARIFF, grid=grid.topo,
        listings=[_listing(1, "H-01", 5.0, 400), _listing(2, "H-10", 5.0, 400)],
        bids=[_bid(1, "H-02", 5.0, 500)],
    )
    result = match_slot(req)
    assert "S2" in {p.seller_id for p in result.pairs}


def test_clearing_price_always_inside_corridor() -> None:
    """The invariant, across a wide spread of random books."""
    rng = random.Random(7)
    nodes = [f"H-{i:02d}" for i in range(1, 13)]
    for _ in range(60):
        listings = [
            _listing(i, rng.choice(nodes), rng.uniform(0.5, 6.0), rng.randint(100, 900))
            for i in range(rng.randint(1, 6))
        ]
        bids = [
            _bid(i, rng.choice(nodes), rng.uniform(0.5, 6.0), rng.randint(100, 900))
            for i in range(rng.randint(1, 6))
        ]
        result = match_slot(
            MatchRequest(slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
                         listings=listings, bids=bids)
        )
        assert (
            DEFAULT_TARIFF.feed_in_tariff_paise
            <= result.clearing_price_paise
            <= DEFAULT_TARIFF.retail_tariff_paise
        )


def test_delivered_never_exceeds_matched() -> None:
    """Line losses only ever remove energy. EnergyEscrow.sol reverts otherwise."""
    req = MatchRequest(
        slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
        listings=[_listing(1, "H-01", 3.0, 300), _listing(2, "H-04", 3.0, 350)],
        bids=[_bid(1, "H-02", 2.0, 600), _bid(2, "H-12", 3.0, 550)],
    )
    result = match_slot(req)
    assert result.total_delivered_kwh <= result.total_matched_kwh + 1e-9
    for pair in result.pairs:
        assert pair.delivered_kwh <= pair.kwh + 1e-9
        assert pair.loss_kwh >= 0


def test_no_self_trade() -> None:
    """A house must never be matched with itself."""
    req = MatchRequest(
        slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
        listings=[_listing(1, "H-01", 5.0, 300)],
        bids=[_bid(1, "H-01", 5.0, 600)],
    )
    result = match_slot(req)
    for pair in result.pairs:
        assert pair.seller_id != pair.buyer_id


def test_empty_book_is_safe() -> None:
    result = match_slot(
        MatchRequest(slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
                     listings=[], bids=[])
    )
    assert result.pairs == []
    assert result.total_matched_kwh == 0.0
    assert DEFAULT_TARIFF.feed_in_tariff_paise <= result.clearing_price_paise


def test_unserved_demand_becomes_grid_backfill() -> None:
    """Demand the local market cannot serve must show up as backfill, not vanish."""
    req = MatchRequest(
        slot_id="T", tariff=DEFAULT_TARIFF, grid=load_topology(),
        listings=[_listing(1, "H-01", 0.5, 300)],
        bids=[_bid(1, "H-02", 5.0, 600)],
    )
    result = match_slot(req)
    assert result.grid_backfill_kwh > 0
    assert result.grid_backfill_kwh == pytest.approx(5.0 - result.total_delivered_kwh, abs=1e-6)
