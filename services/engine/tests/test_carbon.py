import pytest

from app.config import CO2_AVOIDED_PER_KWH


def test_avoided_factor_is_sane():
    # (0.71 - 0.04) * 1.17
    assert 0.75 < CO2_AVOIDED_PER_KWH < 0.85


@pytest.mark.skip(reason="TODO(Dev, H11.5-H12.5)")
def test_tree_equivalence():
    ...
