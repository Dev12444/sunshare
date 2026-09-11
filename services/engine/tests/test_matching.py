"""Matching tests — our hand-rolled MCMF must agree with networkx."""

import pytest


@pytest.mark.skip(reason="TODO(Dev, H9-H11.5): implement MinCostMaxFlow")
def test_mcmf_matches_networkx_on_random_graphs():
    """Generate 50 random bipartite instances, assert identical min cost."""
    ...


@pytest.mark.skip(reason="TODO(Dev, H9-H11.5)")
def test_prefers_closer_seller_at_equal_price():
    """Two identical asks, one on the same feeder — the near one must win."""
    ...


@pytest.mark.skip(reason="TODO(Dev, H9-H11.5)")
def test_congested_edge_forces_alternative_match():
    """This is demo step 6. It must be a test, not a hope."""
    ...
