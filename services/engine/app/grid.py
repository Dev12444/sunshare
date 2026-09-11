"""Grid graph + line losses — Dev, H6.5-H9.

The local network is a radial tree: HOUSE -> FEEDER -> SUBSTATION. Two houses on
the same feeder are electrically close; two houses under different substations
are not. That distinction is the whole point of feature #2 — a shorter
electrical path means less energy lost as heat, which is better for the seller,
the buyer, and the DISCOM all at once.

Because distribution networks are radial (a tree, not a mesh), the path between
any two nodes is forced: up to the lowest common ancestor, then back down. No
shortest-path search is needed, which is both correct and fast.

Loss model, deliberately interpretable rather than a load-flow solver:

    same feeder        0.5%
    same substation    2.0%
    cross substation   5.0%
    + 0.06% per km along the path

A judge can read that off one slide and check it. A Newton-Raphson power flow
would be more "correct" and completely unexplainable in a three-minute pitch.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from . import config
from .models import GridEdge, GridNode, GridTopology

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def load_topology(path: str | Path | None = None) -> GridTopology:
    """Read the demo network from disk."""
    target = Path(path) if path else DATA_DIR / "grid.json"
    return GridTopology.model_validate(json.loads(target.read_text()))


class GridIndex:
    """Adjacency and parent lookups over a topology.

    Built once per topology and reused; rebuilding these dicts inside the
    matching loop would dominate the runtime.
    """

    def __init__(self, topo: GridTopology) -> None:
        self.topo = topo
        self.nodes: dict[str, GridNode] = {n.id: n for n in topo.nodes}
        self.edges: dict[str, GridEdge] = {e.id: e for e in topo.edges}

        # Undirected edge lookup keyed by the unordered node pair.
        self._edge_between: dict[tuple[str, str], GridEdge] = {}
        for e in topo.edges:
            self._edge_between[(e.from_node_id, e.to_node_id)] = e
            self._edge_between[(e.to_node_id, e.from_node_id)] = e

    # -- tree navigation ---------------------------------------------------

    def ancestors(self, node_id: str) -> list[str]:
        """Node ids from `node_id` up to the root, inclusive of both."""
        chain: list[str] = []
        seen: set[str] = set()
        current: str | None = node_id
        while current is not None and current not in seen:
            seen.add(current)
            chain.append(current)
            node = self.nodes.get(current)
            current = node.parent_id if node else None
        return chain

    def substation_of(self, node_id: str) -> str | None:
        for anc in self.ancestors(node_id):
            node = self.nodes.get(anc)
            if node and node.kind == "SUBSTATION":
                return anc
        return None

    def feeder_of(self, node_id: str) -> str | None:
        for anc in self.ancestors(node_id):
            node = self.nodes.get(anc)
            if node and node.kind == "FEEDER":
                return anc
        return None

    def path_between(self, a_node: str, b_node: str) -> list[str]:
        """Node ids along the radial path a -> LCA -> b, inclusive.

        Returns [] if the two nodes share no ancestor (disconnected islands),
        which the caller must treat as "not tradable".
        """
        if a_node == b_node:
            return [a_node]

        up_a = self.ancestors(a_node)
        up_b = self.ancestors(b_node)
        index_b = {n: i for i, n in enumerate(up_b)}

        for i, node in enumerate(up_a):
            if node in index_b:
                # a -> ... -> LCA, then LCA -> ... -> b (excluding the LCA itself)
                return up_a[: i + 1] + list(reversed(up_b[: index_b[node]]))
        return []

    def edge_between(self, a: str, b: str) -> GridEdge | None:
        return self._edge_between.get((a, b))

    # -- physical quantities ----------------------------------------------

    def path_distance_km(self, path: list[str]) -> float:
        total = 0.0
        for a, b in zip(path, path[1:]):
            edge = self.edge_between(a, b)
            if edge:
                total += edge.length_km
        return total

    def path_edges(self, path: list[str]) -> list[GridEdge]:
        out: list[GridEdge] = []
        for a, b in zip(path, path[1:]):
            edge = self.edge_between(a, b)
            if edge:
                out.append(edge)
        return out

    def hop_tier_loss_pct(self, a_node: str, b_node: str) -> float:
        """Base loss percentage from how far apart the two nodes sit in the tree."""
        if self.feeder_of(a_node) and self.feeder_of(a_node) == self.feeder_of(b_node):
            return config.LOSS_SAME_FEEDER_PCT
        sub_a, sub_b = self.substation_of(a_node), self.substation_of(b_node)
        if sub_a is not None and sub_a == sub_b:
            return config.LOSS_SAME_SUBSTATION_PCT
        return config.LOSS_CROSS_SUBSTATION_PCT

    def loss_fraction(self, a_node: str, b_node: str) -> float:
        """Fraction of energy lost in transit, 0..1.

        Capped at 25% — beyond that the trade is nonsense and should simply not
        be matched, but an uncapped formula could otherwise produce >100% loss
        on a pathological topology.
        """
        # Nothing is transmitted, so nothing is lost. Self-pairs are excluded by
        # the matcher anyway, but the physics should be right regardless.
        if a_node == b_node:
            return 0.0
        path = self.path_between(a_node, b_node)
        if not path:
            return 1.0
        pct = self.hop_tier_loss_pct(a_node, b_node)
        pct += self.path_distance_km(path) * config.LOSS_PER_KM_PCT
        return min(pct / 100.0, 0.25)

    def efficiency_pct(self, a_node: str, b_node: str) -> float:
        return (1.0 - self.loss_fraction(a_node, b_node)) * 100.0

    # -- congestion --------------------------------------------------------

    @staticmethod
    def edge_utilisation(edge: GridEdge) -> float:
        if edge.capacity_kw <= 0:
            return 1.0
        return min(edge.current_load_kw / edge.capacity_kw, 1.0)

    def path_utilisation(self, path: list[str]) -> float:
        """Worst edge utilisation along the path — a chain is as congested as
        its most loaded link."""
        edges = self.path_edges(path)
        if not edges:
            return 0.0
        return max(self.edge_utilisation(e) for e in edges)

    def congestion_penalty_paise(self, path: list[str]) -> int:
        """Cost added per kWh for routing through loaded lines.

        Zero below the 'high' threshold, then ramping to
        CONGESTION_PENALTY_MAX_PAISE at full utilisation. Below the threshold
        the network has headroom and we should not distort prices.
        """
        util = self.path_utilisation(path)
        if util <= config.CONGESTION_HIGH_THRESHOLD:
            return 0
        span = 1.0 - config.CONGESTION_HIGH_THRESHOLD
        ramp = (util - config.CONGESTION_HIGH_THRESHOLD) / span if span > 0 else 1.0
        return int(round(ramp * config.CONGESTION_PENALTY_MAX_PAISE))

    def headroom_kw(self, path: list[str]) -> float:
        """Spare capacity on the tightest edge of the path, in kW."""
        edges = self.path_edges(path)
        if not edges:
            return 0.0
        return max(0.0, min(e.capacity_kw - e.current_load_kw for e in edges))

    def congestion_index(self) -> float:
        """Worst edge utilisation across the whole network, 0..1.

        Drives the colour ramp on Maansi's map and the congestion term in the
        indicative price.
        """
        if not self.topo.edges:
            return 0.0
        return max(self.edge_utilisation(e) for e in self.topo.edges)

    def congestion_level(self, util: float | None = None) -> str:
        u = self.congestion_index() if util is None else util
        if u >= config.CONGESTION_CRITICAL_THRESHOLD:
            return "CRITICAL"
        if u >= config.CONGESTION_HIGH_THRESHOLD:
            return "HIGH"
        return "NORMAL"

    # -- load bookkeeping --------------------------------------------------

    def reset_loads(self) -> None:
        for e in self.topo.edges:
            e.current_load_kw = 0.0
        for n in self.topo.nodes:
            n.load_kw = 0.0

    def apply_house_load(self, node_id: str, net_draw_kw: float) -> None:
        """Push a house's net import (positive) or export (negative) up the tree.

        Magnitude is what loads a line: 5 kW flowing out congests a feeder just
        as much as 5 kW flowing in.
        """
        node = self.nodes.get(node_id)
        if node:
            node.load_kw = net_draw_kw
        chain = self.ancestors(node_id)
        for a, b in zip(chain, chain[1:]):
            edge = self.edge_between(a, b)
            if edge:
                edge.current_load_kw += abs(net_draw_kw)


@lru_cache(maxsize=1)
def default_index() -> GridIndex:
    """Process-wide index over the demo topology."""
    return GridIndex(load_topology())
