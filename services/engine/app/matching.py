"""Proximity-weighted matching — Dev, H6.5-H11.5. Feature #2.

Min-cost max-flow over a bipartite seller -> buyer network:

    SOURCE -> seller_i      capacity = listed kWh,        cost 0
    seller_i -> buyer_j     capacity = line headroom,     cost = see below
    buyer_j -> SINK         capacity = bid kWh,           cost 0

    cost(i, j) in paise/kWh
        = loss_penalty(distance, hops)      # energy lost as heat
        + congestion_penalty(path)          # loaded lines cost more
        - surplus_value(ask, bid)           # prefer genuinely good trades

Congestion is not bolted on: line capacity IS edge capacity in the flow
network, so an overloaded feeder simply cannot carry more flow and the
algorithm routes around it. That is the honest way to model it.

Implemented by hand (successive shortest paths + Johnson potentials) rather
than calling a library, then cross-checked against networkx in the tests.
"""

from __future__ import annotations

from .models import MatchRequest, MatchResult


class MinCostMaxFlow:
    """SPFA/Bellman-Ford successive shortest paths with potentials.

    Integer costs in paise; integer capacities in Wh (kWh * 1000) so the whole
    solver stays in exact integer arithmetic.
    """

    def __init__(self, n: int) -> None:
        self.n = n
        # TODO(Dev): adjacency list of edges [to, cap, cost, rev_index]
        raise NotImplementedError

    def add_edge(self, u: int, v: int, cap: int, cost: int) -> None:
        raise NotImplementedError

    def flow(self, s: int, t: int) -> tuple[int, int]:
        """Return (max_flow, min_cost)."""
        raise NotImplementedError


def match_slot(req: MatchRequest) -> MatchResult:
    """Run the auction + flow for one 15-minute slot.

    Order of operations:
      1. pricing.clear_slot -> uniform clearing price, clamped to the corridor
      2. build the flow network from the grid topology
      3. solve MCMF
      4. decode flow into MatchPairs, computing delivered kWh after losses
      5. anything unserved becomes grid_backfill_kwh

    TODO(Dev). Falls back to `greedy-fallback` (sort by distance, fill) if the
    solver throws — a worse match still beats a dead demo.
    """
    raise NotImplementedError
