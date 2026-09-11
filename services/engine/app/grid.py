"""Grid graph + line losses — Dev, H6.5-H9.

The local network is a radial tree: HOUSE -> FEEDER -> SUBSTATION. Two houses
on the same feeder are electrically close; two houses under different
substations are not. That distinction is the entire point of feature #2 —
shorter path, less energy lost as heat, better for everyone including the DISCOM.

Loss is hop-tiered (interpretable) plus a small distance term:
    same feeder        0.5%
    same substation    2.0%
    cross substation   5.0%
    + 0.06% per km
"""

from __future__ import annotations

from .models import GridTopology


def load_topology(path: str = "data/grid.json") -> GridTopology:
    """Read the demo network. TODO(Dev)."""
    raise NotImplementedError


def path_between(topo: GridTopology, a_node: str, b_node: str) -> list[str]:
    """Node ids along the radial path a -> common ancestor -> b.

    TODO(Dev): walk both up to the root, find the lowest common ancestor,
    splice. No Dijkstra needed — the distribution network is a tree.
    """
    raise NotImplementedError


def loss_fraction(topo: GridTopology, a_node: str, b_node: str) -> float:
    """Fraction of energy lost in transit, 0..1. TODO(Dev)."""
    raise NotImplementedError


def path_distance_km(topo: GridTopology, path: list[str]) -> float:
    """Sum of edge lengths along a path. TODO(Dev)."""
    raise NotImplementedError


def congestion_penalty_paise(topo: GridTopology, path: list[str]) -> int:
    """Penalty for routing through loaded lines.

    Scales from 0 below CONGESTION_HIGH_THRESHOLD to
    CONGESTION_PENALTY_MAX_PAISE at full utilisation. TODO(Dev).
    """
    raise NotImplementedError


def congestion_index(topo: GridTopology) -> float:
    """Worst edge utilisation across the network, 0..1. Drives the map ramp."""
    raise NotImplementedError
