"""Proximity-weighted matching — Dev, H6.5-H11.5. Feature #2.

Min-cost max-flow over the REAL grid topology, not an abstract bipartite graph.
Every physical line in the network is an arc:

    SOURCE  -> seller house      capacity = listed kWh,     cost 0
    node    -> node              capacity = line headroom,  cost = loss + congestion
    buyer house -> SINK          capacity = bid kWh,        cost 0

This is the honest formulation. Congestion is not a penalty bolted onto a
distance score: a loaded feeder is an arc with little remaining capacity, so
the solver physically cannot push more through it and re-allocates to a
different seller on its own. Likewise "proximity" is not a heuristic — a
nearer seller is cheaper because the arcs along its path have lower losses,
which are the same per-segment numbers shown on the slide.

Decomposition of responsibility, which is also how we explain it:

    the double auction decides WHO trades and AT WHAT PRICE  (pricing.py)
    the flow problem decides WHO SERVES WHOM                 (this file)

Doing it in that order keeps all arc costs non-negative, because once the
uniform clearing price is fixed the only remaining costs are physical ones.

Solver: successive shortest paths with SPFA (Bellman-Ford queue variant) and
Johnson potentials, written out rather than imported. Cross-checked against
networkx.max_flow_min_cost in the tests.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from . import config
from .grid import GridIndex
from .models import Bid, Listing, MatchPair, MatchRequest, MatchResult, TariffContext
from .pricing import clear_slot

# Flow is in Wh (integers). Costs are scaled so they stay integral too;
# the scale cancels out and never reaches the API.
WH_PER_KWH = 1000
COST_SCALE = 1000


@dataclass
class _Arc:
    to: int
    cap: int
    cost: int
    rev: int
    flow: int = 0


class MinCostMaxFlow:
    """Successive shortest paths with potentials.

    Costs here are non-negative by construction, but SPFA is used for the
    initial labelling anyway so the class stays correct if that ever changes.
    """

    def __init__(self, n: int) -> None:
        self.n = n
        self.graph: list[list[_Arc]] = [[] for _ in range(n)]

    def add_edge(self, u: int, v: int, cap: int, cost: int) -> None:
        if cap <= 0:
            return
        self.graph[u].append(_Arc(to=v, cap=cap, cost=cost, rev=len(self.graph[v])))
        self.graph[v].append(_Arc(to=u, cap=0, cost=-cost, rev=len(self.graph[u]) - 1))

    def flow(self, s: int, t: int, limit: int | None = None) -> tuple[int, int]:
        """Push flow from s to t. Returns (total_flow, total_cost)."""
        import heapq

        INF = float("inf")
        total_flow = 0
        total_cost = 0
        potential = [0] * self.n
        remaining = limit if limit is not None else (1 << 62)

        # SPFA once to establish potentials (safe with negative costs).
        dist = [INF] * self.n
        dist[s] = 0
        in_queue = [False] * self.n
        queue = [s]
        in_queue[s] = True
        while queue:
            u = queue.pop()
            in_queue[u] = False
            for arc in self.graph[u]:
                if arc.cap - arc.flow > 0 and dist[u] + arc.cost < dist[arc.to]:
                    dist[arc.to] = dist[u] + arc.cost
                    if not in_queue[arc.to]:
                        in_queue[arc.to] = True
                        queue.append(arc.to)
        potential = [0 if d == INF else int(d) for d in dist]

        while remaining > 0:
            # Dijkstra on reduced costs.
            dist = [INF] * self.n
            dist[s] = 0
            prev_node = [-1] * self.n
            prev_arc = [-1] * self.n
            heap = [(0, s)]
            while heap:
                d, u = heapq.heappop(heap)
                if d > dist[u]:
                    continue
                for i, arc in enumerate(self.graph[u]):
                    if arc.cap - arc.flow <= 0:
                        continue
                    nd = d + arc.cost + potential[u] - potential[arc.to]
                    if nd < dist[arc.to]:
                        dist[arc.to] = nd
                        prev_node[arc.to] = u
                        prev_arc[arc.to] = i
                        heapq.heappush(heap, (nd, arc.to))

            if dist[t] == INF:
                break  # no augmenting path left

            for v in range(self.n):
                if dist[v] < INF:
                    potential[v] += int(dist[v])

            # Bottleneck along the path.
            push = remaining
            v = t
            while v != s:
                arc = self.graph[prev_node[v]][prev_arc[v]]
                push = min(push, arc.cap - arc.flow)
                v = prev_node[v]

            v = t
            while v != s:
                arc = self.graph[prev_node[v]][prev_arc[v]]
                arc.flow += push
                self.graph[v][arc.rev].flow -= push
                total_cost += push * arc.cost
                v = prev_node[v]

            total_flow += push
            remaining -= push

        return total_flow, total_cost


# ------------------------------------------------------------ matching ---


@dataclass
class _Network:
    mcmf: MinCostMaxFlow
    node_index: dict[str, int]
    index_node: dict[int, str]
    source: int
    sink: int
    seller_of: dict[str, list[Listing]] = field(default_factory=dict)
    buyer_of: dict[str, list[Bid]] = field(default_factory=dict)


def _build_network(
    grid: GridIndex,
    listings: list[Listing],
    bids: list[Bid],
    clearing_price: int,
) -> _Network:
    slot_hours = config.SLOT_MINUTES / 60.0

    ids = [n.id for n in grid.topo.nodes]
    node_index = {nid: i + 2 for i, nid in enumerate(ids)}
    index_node = {i + 2: nid for i, nid in enumerate(ids)}
    mcmf = MinCostMaxFlow(len(ids) + 2)
    source, sink = 0, 1

    # Physical lines, both directions. Energy can flow either way along a wire.
    for edge in grid.topo.edges:
        headroom_kw = max(0.0, edge.capacity_kw - edge.current_load_kw)
        cap_wh = int(headroom_kw * slot_hours * WH_PER_KWH)
        if cap_wh <= 0:
            continue

        loss_frac = grid.segment_loss_pct(edge) / 100.0
        # What the lost energy is worth, plus what congestion should discourage.
        cost_per_kwh = loss_frac * clearing_price
        cost_per_kwh += grid.congestion_penalty_paise([edge.from_node_id, edge.to_node_id])
        cost = int(round(cost_per_kwh * COST_SCALE))

        u = node_index[edge.from_node_id]
        v = node_index[edge.to_node_id]
        mcmf.add_edge(u, v, cap_wh, cost)
        mcmf.add_edge(v, u, cap_wh, cost)

    seller_of: dict[str, list[Listing]] = {}
    buyer_of: dict[str, list[Bid]] = {}

    for listing in listings:
        if listing.node_id not in node_index:
            continue
        cap = int(listing.kwh * WH_PER_KWH)
        mcmf.add_edge(source, node_index[listing.node_id], cap, 0)
        seller_of.setdefault(listing.node_id, []).append(listing)

    for bid in bids:
        if bid.node_id not in node_index:
            continue
        cap = int(bid.kwh * WH_PER_KWH)
        mcmf.add_edge(node_index[bid.node_id], sink, cap, 0)
        buyer_of.setdefault(bid.node_id, []).append(bid)

    return _Network(mcmf, node_index, index_node, source, sink, seller_of, buyer_of)


def _decompose(net: _Network) -> list[tuple[str, str, list[str], int]]:
    """Break the solved flow into (seller_node, buyer_node, path, wh) journeys.

    Standard flow decomposition: repeatedly walk one source->sink path through
    arcs that still carry flow, take its bottleneck, subtract it, repeat.
    """
    g = net.mcmf.graph
    journeys: list[tuple[str, str, list[str], int]] = []

    def find_path() -> list[tuple[int, int]] | None:
        """Return [(node, arc_index)] from source to sink, or None."""
        stack = [(net.source, [])]
        seen = {net.source}
        while stack:
            u, trail = stack.pop()
            if u == net.sink:
                return trail
            for i, arc in enumerate(g[u]):
                if arc.flow > 0 and arc.to not in seen:
                    seen.add(arc.to)
                    stack.append((arc.to, trail + [(u, i)]))
        return None

    guard = 0
    while guard < 10_000:
        guard += 1
        trail = find_path()
        if not trail:
            break

        bottleneck = min(g[u][i].flow for u, i in trail)
        if bottleneck <= 0:
            break

        for u, i in trail:
            arc = g[u][i]
            arc.flow -= bottleneck
            g[arc.to][arc.rev].flow += bottleneck

        # Strip the synthetic source/sink arcs to recover the physical path.
        physical = [net.index_node[u] for u, _ in trail if u in net.index_node]
        last = g[trail[-1][0]][trail[-1][1]].to
        if last in net.index_node:
            physical.append(net.index_node[last])
        if len(physical) < 1:
            continue

        journeys.append((physical[0], physical[-1], physical, bottleneck))

    return journeys


def match_slot(req: MatchRequest) -> MatchResult:
    """Clear one 15-minute slot: auction for price, flow for allocation."""
    started = time.perf_counter()
    grid = GridIndex(req.grid)

    clearing_price, auction_volume = clear_slot(req.listings, req.bids, req.tariff)

    # Only orders that clear participate in the allocation. A seller asking
    # above the clearing price does not sell; a buyer bidding below does not buy.
    active_listings = [l for l in req.listings if l.ask_price_paise <= clearing_price and l.kwh > 0]
    active_bids = [b for b in req.bids if b.max_price_paise >= clearing_price and b.kwh > 0]

    supply_kwh = sum(l.kwh for l in req.listings)
    demand_kwh = sum(b.kwh for b in req.bids)

    if not active_listings or not active_bids:
        return MatchResult(
            slot_id=req.slot_id,
            clearing_price_paise=clearing_price,
            pairs=[],
            total_matched_kwh=0.0,
            total_delivered_kwh=0.0,
            total_loss_kwh=0.0,
            avg_efficiency_pct=100.0,
            unmatched_supply_kwh=round(supply_kwh, 4),
            unmatched_demand_kwh=round(demand_kwh, 4),
            grid_backfill_kwh=round(demand_kwh, 4),
            compute_ms=round((time.perf_counter() - started) * 1000, 3),
            algorithm="mcmf",
        )

    net = _build_network(grid, active_listings, active_bids, clearing_price)
    net.mcmf.flow(net.source, net.sink)
    journeys = _decompose(net)

    # Turn journeys into MatchPairs, consuming listing and bid quantities in
    # order so every pair references a real order id.
    listing_left = {l.id: l.kwh for l in active_listings}
    bid_left = {b.id: b.kwh for b in active_bids}
    pairs: list[MatchPair] = []

    for seller_node, buyer_node, path, wh in journeys:
        kwh = wh / WH_PER_KWH
        if kwh <= 1e-6 or seller_node == buyer_node:
            continue

        seller_orders = net.seller_of.get(seller_node, [])
        buyer_orders = net.buyer_of.get(buyer_node, [])
        if not seller_orders or not buyer_orders:
            continue

        remaining = kwh
        for listing in seller_orders:
            if remaining <= 1e-6 or listing_left.get(listing.id, 0) <= 1e-6:
                continue
            take_from_listing = min(remaining, listing_left[listing.id])

            for bid in buyer_orders:
                if take_from_listing <= 1e-6 or bid_left.get(bid.id, 0) <= 1e-6:
                    continue
                qty = min(take_from_listing, bid_left[bid.id])

                loss_frac = sum(grid.segment_loss_pct(e) for e in grid.path_edges(path)) / 100.0
                loss_frac = min(loss_frac, 0.25)
                delivered = qty * (1.0 - loss_frac)
                distance = grid.path_distance_km(path)

                pairs.append(
                    MatchPair(
                        listing_id=listing.id,
                        bid_id=bid.id,
                        seller_id=listing.seller_id,
                        buyer_id=bid.buyer_id,
                        kwh=round(qty, 4),
                        delivered_kwh=round(delivered, 4),
                        loss_kwh=round(qty - delivered, 4),
                        distance_km=round(distance, 4),
                        efficiency_pct=round((1.0 - loss_frac) * 100.0, 3),
                        path_node_ids=path,
                        congestion_penalty_paise=grid.congestion_penalty_paise(path),
                    )
                )

                listing_left[listing.id] -= qty
                bid_left[bid.id] -= qty
                take_from_listing -= qty
                remaining -= qty

    matched = sum(p.kwh for p in pairs)
    delivered = sum(p.delivered_kwh for p in pairs)
    loss = sum(p.loss_kwh for p in pairs)
    avg_eff = (delivered / matched * 100.0) if matched > 0 else 100.0

    return MatchResult(
        slot_id=req.slot_id,
        clearing_price_paise=clearing_price,
        pairs=pairs,
        total_matched_kwh=round(matched, 4),
        total_delivered_kwh=round(delivered, 4),
        total_loss_kwh=round(loss, 4),
        avg_efficiency_pct=round(avg_eff, 3),
        unmatched_supply_kwh=round(max(0.0, supply_kwh - matched), 4),
        unmatched_demand_kwh=round(max(0.0, demand_kwh - delivered), 4),
        # Demand the local market could not serve falls back to the grid.
        grid_backfill_kwh=round(max(0.0, demand_kwh - delivered), 4),
        compute_ms=round((time.perf_counter() - started) * 1000, 3),
        algorithm="mcmf",
    )
