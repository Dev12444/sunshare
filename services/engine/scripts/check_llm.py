"""Manual live check of the broker's LLM path — Dev.

Deliberately NOT a pytest test: it makes real API calls. Run it after changing
the prompt, the tool schema, or the model, and before the hackathon so a
broken key is found in advance rather than on stage.

    python scripts/check_llm.py

With no key configured it reports the fallback and exits 0 — the engine is
designed to work without one.
"""

from __future__ import annotations

import asyncio
import sys
import time

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from app.broker import build_policy  # noqa: E402
from app.config import DEFAULT_TARIFF as T  # noqa: E402
from app.config import OPENAI_MODEL, active_llm_provider  # noqa: E402

GOALS = [
    ("Maximize my profit", "MAX_PROFIT"),
    ("Sell fast before sunset but never below 4.50", "SELL_FAST"),
    ("Match the cheapest grid price", "BEAT_GRID"),
    ("Give 15% to the local school and keep 2 kWh for tonight", "MAX_COMMUNITY"),
]


async def main() -> int:
    provider = active_llm_provider()
    print(f"provider: {provider}   model: {OPENAI_MODEL if provider == 'openai' else '-'}\n")
    if provider == "none":
        print("No API key configured — the broker will use its rule-based fallback.")
        print("That is a supported mode; nothing is broken.")
        return 0

    failures = 0
    latencies: list[float] = []

    for goal, expected in GOALS:
        t0 = time.perf_counter()
        policy = await build_policy("U-01", goal, T)
        ms = (time.perf_counter() - t0) * 1000
        latencies.append(ms)

        ok = True
        notes = []
        if policy.source != "llm":
            ok = False
            notes.append("fell back — the provider call failed")
        if policy.objective != expected:
            notes.append(f"objective {policy.objective}, expected {expected}")
        if not (
            T.feed_in_tariff_paise
            <= policy.min_price_paise
            <= policy.max_price_paise
            <= T.retail_tariff_paise
        ):
            ok = False
            notes.append("CORRIDOR BREACH")

        failures += 0 if ok else 1
        print(f"[{'ok ' if ok else 'FAIL'}] {goal}")
        print(
            f"       {policy.objective}  ₹{policy.min_price_paise / 100:.2f}"
            f"–₹{policy.max_price_paise / 100:.2f}  urgency {policy.urgency}  "
            f"reserve {policy.reserve_kwh}  donate {policy.community_donation_pct}%  ({ms:.0f} ms)"
        )
        if notes:
            print(f"       note: {'; '.join(notes)}")

    print(
        f"\nlatency: min {min(latencies):.0f} ms  max {max(latencies):.0f} ms  "
        f"avg {sum(latencies) / len(latencies):.0f} ms"
    )
    print(
        "\nThe model is called once per goal, not per slot — the executor that "
        "moves the price is pure code."
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
