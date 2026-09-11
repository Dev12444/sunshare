"""Live weather for the simulator — Dev, H1-H3.

Open-Meteo needs no API key and returns cloud cover + shortwave radiation,
which is exactly what the generation model wants. If it is slow or down we fall
back to a synthetic clear-sky curve so the demo can never be blocked by a
third-party outage.
"""

from __future__ import annotations

from .models import WeatherSnapshot


async def fetch_weather(lat: float, lng: float) -> WeatherSnapshot:
    """Current cloud cover / irradiance / temperature at the demo location.

    TODO(Dev): httpx.AsyncClient GET config.OPEN_METEO_URL with
    current=cloud_cover,shortwave_radiation,temperature_2m
    Cache for WEATHER_REFRESH_SECONDS. On timeout or non-200, return
    synthetic_weather().
    """
    raise NotImplementedError


def synthetic_weather(hour_of_day: float) -> WeatherSnapshot:
    """Deterministic fallback: clear sky, mild scattered cloud after noon."""
    raise NotImplementedError
