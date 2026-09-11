"""Smart-meter simulator — Dev, H1-H4. Everything downstream blocks on this.

Generation model:
    clear-sky irradiance from true solar position
      (declination -> hour angle -> solar zenith)
    x panel capacity kW
    x cloud factor from live weather
    x seeded noise

Consumption model:
    household archetype base load + morning/evening peaks + seeded noise

The clock is simulated: SIM_SPEED simulated minutes pass per real second, so a
full solar day runs in ~24 minutes at the default of 60. SIM_SEED fixes the
noise, which is what makes the pitch reproducible.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from .models import MeterReading, Tick


def solar_elevation(lat: float, lng: float, sim_time_iso: str) -> float:
    """Solar elevation angle in degrees; negative means the sun is down.

    TODO(Dev): day-of-year -> declination; local solar time -> hour angle;
    then sin(elev) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(hour).
    """
    raise NotImplementedError


def clear_sky_irradiance(elevation_deg: float) -> float:
    """W/m^2 on a horizontal plane for a given solar elevation."""
    raise NotImplementedError


def generation_kw(panel_kw: float, irradiance_wm2: float, cloud_pct: float) -> float:
    """Panel output. Cloud cover attenuates, it does not zero out."""
    raise NotImplementedError


def consumption_kw(archetype: str, hour_of_day: float, seed: int) -> float:
    """Household draw for one of the seeded archetypes."""
    raise NotImplementedError


async def tick_stream() -> AsyncIterator[Tick]:
    """Yield one Tick per SIM_TICK_SECONDS, forever.

    TODO(Dev): advance the sim clock, refresh weather on its own cadence,
    build MeterReading per meter, roll up MarketState, increment seq.
    """
    raise NotImplementedError


def current_readings() -> list[MeterReading]:
    """Latest reading per meter, for REST callers that do not hold the socket."""
    raise NotImplementedError


if __name__ == "__main__":
    # Fixture capture for the frontend pair — see fixtures/README.md.
    # TODO(Dev): argparse --capture N, print a JSON array of N ticks to stdout.
    raise SystemExit("TODO(Dev): implement --capture")
