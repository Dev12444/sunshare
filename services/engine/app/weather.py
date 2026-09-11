"""Live weather for the simulator — Dev, H1-H3.

Open-Meteo needs no API key and returns cloud cover, shortwave radiation and
temperature, which is exactly what the generation model wants.

Every call is wrapped: if the API is slow, rate-limited, or down, we fall back
to a deterministic synthetic curve. A third-party outage must never be able to
stop the demo — that is a hard requirement, not a nicety.
"""

from __future__ import annotations

import math
import time

import httpx

from . import config
from .models import WeatherSnapshot

_cache: dict[str, object] = {"snapshot": None, "fetched_at": 0.0}


async def fetch_weather(
    lat: float | None = None,
    lng: float | None = None,
    hour_of_day: float = 12.0,
) -> WeatherSnapshot:
    """Current conditions, cached for WEATHER_REFRESH_SECONDS.

    `hour_of_day` is only used to build the synthetic fallback, so the fallback
    still tracks the simulated clock rather than returning a constant.
    """
    lat = config.DEMO_LAT if lat is None else lat
    lng = config.DEMO_LNG if lng is None else lng

    if config.WEATHER_MODE == "synthetic":
        return synthetic_weather(hour_of_day)

    # In "auto" mode, only trust Open-Meteo when the real sun is up at the demo
    # location. Rehearsing at 4am would otherwise paint a real overcast midnight
    # onto a simulated noon: a 100% cloud reading applied to a geometric
    # midday irradiance. The mixed snapshot is worse than either input alone,
    # so we pick one and report honestly which it was.
    if config.WEATHER_MODE == "auto" and not _real_sun_is_up(lat, lng):
        return synthetic_weather(hour_of_day)

    now = time.monotonic()
    cached = _cache.get("snapshot")
    if cached is not None and now - float(_cache["fetched_at"]) < config.WEATHER_REFRESH_SECONDS:
        return cached  # type: ignore[return-value]

    try:
        async with httpx.AsyncClient(timeout=config.WEATHER_TIMEOUT_SECONDS) as client:
            res = await client.get(
                config.OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "current": "cloud_cover,shortwave_radiation,temperature_2m",
                    "timezone": "Asia/Kolkata",
                },
            )
            res.raise_for_status()
            current = res.json()["current"]
            snapshot = WeatherSnapshot(
                cloud_cover_pct=float(current["cloud_cover"]),
                irradiance_wm2=float(current["shortwave_radiation"]),
                temp_c=float(current["temperature_2m"]),
                source="open-meteo",
            )
    except Exception:
        # Timeout, DNS failure, rate limit, schema change — all handled the same
        # way. The demo continues.
        snapshot = synthetic_weather(hour_of_day)

    _cache["snapshot"] = snapshot
    _cache["fetched_at"] = now
    return snapshot


def _real_sun_is_up(lat: float, lng: float) -> bool:
    """Is the sun above the horizon at the demo location right now, in reality?"""
    from datetime import datetime, timedelta, timezone

    from .simulator import solar_elevation_deg

    ist = timezone(timedelta(hours=config.DEMO_TZ_OFFSET_HOURS))
    return solar_elevation_deg(lat, lng, datetime.now(ist)) > 0


def synthetic_weather(hour_of_day: float) -> WeatherSnapshot:
    """Deterministic fallback: mostly clear, with light afternoon cloud build-up.

    Shaped to look like a plausible Gujarat winter day so the fallback is not
    obviously a fallback on screen.
    """
    # Cloud builds gently through the afternoon, peaking around 15:00.
    cloud = 12.0 + 18.0 * max(0.0, math.sin((hour_of_day - 9.0) / 9.0 * math.pi))

    # Rough clear-sky bell centred on solar noon, attenuated by that cloud.
    daylight = max(0.0, math.sin((hour_of_day - 6.5) / 11.5 * math.pi))
    irradiance = 950.0 * daylight * (1.0 - 0.6 * cloud / 100.0)

    temp = 22.0 + 9.0 * daylight

    return WeatherSnapshot(
        cloud_cover_pct=round(cloud, 1),
        irradiance_wm2=round(max(irradiance, 0.0), 1),
        temp_c=round(temp, 1),
        source="synthetic",
    )


def reset_cache() -> None:
    """Used by tests, and by /sim/control when jumping the clock."""
    _cache["snapshot"] = None
    _cache["fetched_at"] = 0.0
