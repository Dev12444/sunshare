"""Shared test configuration.

The engine loads services/engine/.env at import time so a real key can be
configured for manual verification. Tests must NOT inherit that: a suite that
makes live API calls is slow, flaky, costs money, and stops being a test of our
code at all.

So every test runs with the provider forced off unless it explicitly opts in.
That also keeps the guarantee we actually care about under continuous test:
with no provider configured, the broker still works.

To verify the live path deliberately, run scripts/check_llm.py instead.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def no_live_llm(monkeypatch):
    """Force the rule-based path for every test unless overridden locally."""
    from app import config

    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "", raising=False)
    monkeypatch.setattr(config, "OPENAI_API_KEY", "", raising=False)
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto", raising=False)
    # Weather too: "auto" reaches Open-Meteo whenever the real sun is up, which
    # made the suite take 26s and produce different numbers depending on the
    # actual weather in Gujarat.
    monkeypatch.setattr(config, "WEATHER_MODE", "synthetic", raising=False)
