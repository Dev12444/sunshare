"""Scripted demo scenario — Dev, H19-H21.

Three minutes on stage is not enough time to wait for a simulated day to
unfold, and improvising with sliders in front of judges is how demos die. So
the pitch is a sequence of named beats, each of which puts the engine into an
exact, reproducible state with one call.

    POST /sim/scenario {"beat": "midday_surplus"}

Every beat is deterministic under SIM_SEED for a given calendar date, so a
rehearsal on the day matches the stage. The household noise is seeded per slot
and the slot id carries the date, so figures move by a few paise from one day
to the next — which is why watch_for quotes rounded numbers. The beats follow the story the judges already read in
the Phase 1 submission, which is deliberate — we are delivering against the
document they scored, not a different pitch.

Maansi drives these from the UI; the order is in docs/DEMO_SCRIPT.md.
"""

from __future__ import annotations

from dataclasses import dataclass

# The service drop feeding H-01, the near seller in the proximity story.
# Congesting this is what forces the re-allocation in beat 5.
DEMO_CONGESTED_EDGE = "e-F-1-H-01"


@dataclass(frozen=True)
class Beat:
    key: str
    title: str
    hour: float
    congest: bool
    speed: float
    narration: str
    watch_for: str


BEATS: tuple[Beat, ...] = (
    Beat(
        key="dawn",
        title="Before sunrise",
        hour=6.0,
        congest=False,
        speed=1.0,
        narration=(
            "Six in the morning. No generation yet, and the neighbourhood is "
            "drawing everything it needs from the grid at the full retail tariff."
        ),
        watch_for="Supply zero, price about ₹5.90, near the ₹6.50 ceiling. Everything comes off the grid.",
    ),
    Beat(
        key="morning_ramp",
        title="Generation begins",
        hour=8.0,
        congest=False,
        speed=1.0,
        narration=(
            "The sun clears the horizon and the eight rooftop arrays start "
            "producing. Most households still consume more than they make, so "
            "only a trickle is tradable and the grid covers the rest."
        ),
        watch_for="First trades appear, roughly half a kWh. Most demand still backfilled by the grid.",
    ),
    Beat(
        key="midday_surplus",
        title="Peak surplus",
        hour=12.0,
        congest=False,
        speed=1.0,
        narration=(
            "Midday. Around thirty-six kilowatts of generation against the "
            "neighbourhood's own demand, and the school and the shop are both "
            "drawing hard. This is the surplus that today gets exported to the "
            "utility for two rupees fifteen while the buyer next door pays "
            "six-fifty to import it."
        ),
        watch_for="Eight listings, ~7.4 kWh supply against ~2.7 kWh demand. Price falls to about ₹3.90.",
    ),
    Beat(
        key="local_match",
        title="Matched locally",
        hour=12.5,
        congest=False,
        speed=1.0,
        narration=(
            "The auction sets one price for everyone in the slot, well inside the "
            "corridor, and the matching engine allocates. "
            "The school is served by the two rooftops on its own feeder — the "
            "shortest electrical path available, and about ninety-nine and a half "
            "percent efficient. Almost nothing is lost as heat."
        ),
        watch_for="U-01 (~1 kWh) and U-02 serve the school on feeder F-1. Average efficiency ~99.45%. Compute ~0.3 ms.",
    ),
    Beat(
        key="congestion",
        title="A feeder congests",
        hour=12.5,
        congest=True,
        speed=1.0,
        narration=(
            "Now the service line feeding the nearest seller congests. The engine "
            "does not simply pay a penalty and carry on — that line has no capacity "
            "left, so the flow physically cannot pass. The school still gets its "
            "power, but from a rooftop on another feeder, over a longer path, at "
            "lower efficiency and a higher price. That is the transmission cost "
            "made visible."
        ),
        watch_for="U-01 drops from ~1 kWh to zero; U-04 routes in at 97.9% over F-2→SS-1→F-1. Average efficiency ~99.45%→~99.0%, price ~₹3.90→~₹4.30.",
    ),
    Beat(
        key="evening_peak",
        title="Evening peak",
        hour=19.5,
        congest=False,
        speed=1.0,
        narration=(
            "Sunset. Generation is zero and demand is at its highest of the day. "
            "The local market has nothing to offer, so the grid backfills it — and "
            "the price returns to the top of the corridor. This is exactly the gap "
            "that storage, or tomorrow's sun, has to fill."
        ),
        watch_for="Zero supply, ~23 kW of demand, price back up to about ₹5.97. The gap storage would fill.",
    ),
)

BY_KEY: dict[str, Beat] = {b.key: b for b in BEATS}


def beat_list() -> list[dict]:
    """Serialisable beat index, for the demo control strip in the UI."""
    return [
        {
            "key": b.key,
            "title": b.title,
            "hour": b.hour,
            "congest": b.congest,
            "narration": b.narration,
            "watchFor": b.watch_for,
        }
        for b in BEATS
    ]
