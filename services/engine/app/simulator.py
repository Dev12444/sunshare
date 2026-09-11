"""Smart-meter simulator — Dev, H1-H4. Everything downstream blocks on this.

Generation uses real solar geometry rather than a hand-drawn bell curve:

    day of year  -> solar declination        (Cooper's equation)
    local time   -> equation of time, hour angle
    lat + above  -> solar elevation
    elevation    -> clear-sky irradiance     (air-mass attenuation)
    x panel kW, x cloud factor from live weather, x temperature derate

This matters for more than accuracy: when a judge asks "is this just a sine
wave?", the honest answer is no, and sunrise/sunset land where they actually
land for Gandhinagar on today's date.

Consumption is an archetype base load plus morning and evening peaks plus
seeded noise — households do not draw a constant 400 W.

The clock is simulated: SIM_SPEED simulated minutes pass per real second, so at
the default of 1 a full 24h day runs in 24 real minutes. SIM_SEED fixes all
noise, which is what makes the pitch reproducible: the same run twice gives the
same numbers.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import random
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config, weather
from .grid import GridIndex, load_topology
from .models import MarketState, MeterReading, Tick, WeatherSnapshot

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
IST = timezone(timedelta(hours=config.DEMO_TZ_OFFSET_HOURS))

# Consumption archetypes: (base kW, morning peak kW, evening peak kW).
# Evening peaks are larger than morning ones, which is what makes the
# "generation has stopped but demand is rising" moment in the demo real.
ARCHETYPES: dict[str, tuple[float, float, float]] = {
    "COUPLE": (0.25, 0.45, 0.90),
    "FAMILY_3": (0.35, 0.70, 1.40),
    "FAMILY_4": (0.45, 0.95, 1.90),
    "FAMILY_5": (0.55, 1.20, 2.40),
}


# --------------------------------------------------------------- solar ---


def solar_declination_deg(day_of_year: int) -> float:
    """Cooper's equation. Earth's tilt projected onto the date."""
    return 23.45 * math.sin(math.radians(360.0 * (284 + day_of_year) / 365.0))


def equation_of_time_min(day_of_year: int) -> float:
    """Correction for Earth's elliptical orbit and axial tilt, in minutes."""
    b = math.radians(360.0 * (day_of_year - 81) / 364.0)
    return 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)


def solar_elevation_deg(lat: float, lng: float, when: datetime) -> float:
    """Solar elevation in degrees. Negative means the sun is below the horizon."""
    day = when.timetuple().tm_yday
    decl = math.radians(solar_declination_deg(day))

    # Local solar time: clock time, corrected for longitude offset from the
    # timezone meridian, plus the equation of time.
    tz_meridian = config.DEMO_TZ_OFFSET_HOURS * 15.0
    clock_hours = when.hour + when.minute / 60.0 + when.second / 3600.0
    solar_hours = clock_hours + (lng - tz_meridian) * 4.0 / 60.0 + equation_of_time_min(day) / 60.0

    hour_angle = math.radians(15.0 * (solar_hours - 12.0))
    lat_rad = math.radians(lat)

    sin_elev = math.sin(lat_rad) * math.sin(decl) + math.cos(lat_rad) * math.cos(decl) * math.cos(
        hour_angle
    )
    return math.degrees(math.asin(max(-1.0, min(1.0, sin_elev))))


def clear_sky_irradiance(elevation_deg: float) -> float:
    """Clear-sky global horizontal irradiance in W/m^2.

    Uses a standard air-mass attenuation model: the lower the sun, the more
    atmosphere the light crosses, the more is scattered away.
    """
    if elevation_deg <= 0:
        return 0.0
    zenith = math.radians(90.0 - elevation_deg)
    # Kasten-Young air mass, guarded against the horizon singularity.
    denom = math.cos(zenith) + 0.50572 * (96.07995 - (90.0 - elevation_deg)) ** -1.6364
    air_mass = 1.0 / max(denom, 1e-3)
    direct = 1353.0 * (0.7 ** (air_mass**0.678))
    return max(0.0, direct * math.sin(math.radians(elevation_deg)))


def generation_kw(
    panel_kw: float,
    irradiance_wm2: float,
    cloud_pct: float,
    temp_c: float = 25.0,
) -> float:
    """Panel output in kW.

    Cloud attenuates but never zeroes — diffuse light still reaches the panel,
    which is why a fully overcast noon still produces something. Panels also
    lose roughly 0.4%/°C above 25°C, which is why peak output is usually just
    before the hottest part of the day rather than at it.
    """
    if panel_kw <= 0 or irradiance_wm2 <= 0:
        return 0.0

    cloud_factor = 1.0 - 0.75 * (max(0.0, min(cloud_pct, 100.0)) / 100.0)
    temp_derate = 1.0 - 0.004 * max(0.0, temp_c - 25.0)
    # 1000 W/m^2 is the standard test condition the panel's kW rating assumes.
    output = panel_kw * (irradiance_wm2 / 1000.0) * cloud_factor * temp_derate
    return max(0.0, round(output, 4))


# --------------------------------------------------------- consumption ---


def consumption_kw(archetype: str, hour_of_day: float, rng: random.Random) -> float:
    """Household draw in kW: base load plus morning and evening peaks."""
    base, morning, evening = ARCHETYPES.get(archetype, ARCHETYPES["FAMILY_4"])

    def bump(centre: float, width: float, height: float) -> float:
        return height * math.exp(-(((hour_of_day - centre) / width) ** 2))

    load = base
    load += bump(7.5, 1.3, morning)    # breakfast, geyser, getting out
    load += bump(19.5, 2.0, evening)   # cooking, lights, TV, AC
    load += bump(13.5, 1.8, morning * 0.45)  # midday lull, not zero

    load *= rng.uniform(0.88, 1.12)    # nobody's load curve is smooth
    return max(0.05, round(load, 4))


# ------------------------------------------------------------ the sim ---


class Simulator:
    """Holds the simulated clock and produces ticks.

    One instance per process, created at app startup.
    """

    def __init__(
        self,
        start_sim: datetime | None = None,
        speed: float | None = None,
        seed: int | None = None,
    ) -> None:
        self.speed = config.SIM_SPEED if speed is None else speed
        self.seed = config.SIM_SEED if seed is None else seed
        self.grid = GridIndex(load_topology())
        self.households = json.loads((DATA_DIR / "households.json").read_text())["households"]

        # Start at 06:00 IST so a demo run opens just before sunrise and the
        # audience watches generation climb from zero.
        if start_sim is None:
            today = datetime.now(IST).replace(hour=6, minute=0, second=0, microsecond=0)
            start_sim = today
        self.sim_time = start_sim

        self.seq = 0
        self._day_generation_kwh: dict[str, float] = {h["meterId"]: 0.0 for h in self.households}
        self._day_index = self.sim_time.timetuple().tm_yday
        self._last_clearing_price: int | None = None
        self._forced_congestion: set[str] = set()

    # -- clock -------------------------------------------------------------

    @property
    def hour_of_day(self) -> float:
        return self.sim_time.hour + self.sim_time.minute / 60.0 + self.sim_time.second / 3600.0

    def advance(self, real_seconds: float) -> None:
        self.sim_time += timedelta(minutes=self.speed * real_seconds)
        # Reset daily accumulators when the simulated date rolls over.
        if self.sim_time.timetuple().tm_yday != self._day_index:
            self._day_index = self.sim_time.timetuple().tm_yday
            self._day_generation_kwh = {k: 0.0 for k in self._day_generation_kwh}

    def slot_id(self) -> str:
        """15-minute slot the current sim time falls in."""
        minute = (self.sim_time.minute // config.SLOT_MINUTES) * config.SLOT_MINUTES
        start = self.sim_time.replace(minute=minute, second=0, microsecond=0)
        return start.strftime("%Y-%m-%dT%H:%M")

    def slot_bounds(self) -> tuple[str, str]:
        minute = (self.sim_time.minute // config.SLOT_MINUTES) * config.SLOT_MINUTES
        start = self.sim_time.replace(minute=minute, second=0, microsecond=0)
        end = start + timedelta(minutes=config.SLOT_MINUTES)
        return start.isoformat(), end.isoformat()

    def minutes_to_sunset(self) -> float:
        """Minutes until solar elevation reaches zero. Used by the AI broker."""
        probe = self.sim_time
        for step in range(0, 16 * 60, 5):
            probe = self.sim_time + timedelta(minutes=step)
            if solar_elevation_deg(config.DEMO_LAT, config.DEMO_LNG, probe) <= 0:
                return float(step)
        return 0.0

    # -- readings ----------------------------------------------------------

    def readings(self, snapshot: WeatherSnapshot, elapsed_hours: float) -> list[MeterReading]:
        out: list[MeterReading] = []
        elevation = solar_elevation_deg(config.DEMO_LAT, config.DEMO_LNG, self.sim_time)

        # Prefer the live irradiance reading when the sun is actually up and the
        # API gave us one; otherwise fall back to the geometric clear-sky value.
        geometric = clear_sky_irradiance(elevation)
        if snapshot.source == "open-meteo" and elevation > 0 and snapshot.irradiance_wm2 > 0:
            irradiance = snapshot.irradiance_wm2
        else:
            irradiance = geometric

        self.grid.reset_loads()

        for house in self.households:
            meter_id = house["meterId"]
            # Seeded per meter and per slot: noise is random across houses but
            # identical across runs.
            rng = random.Random(f"{self.seed}:{meter_id}:{self.slot_id()}")

            gen = generation_kw(house["panelKw"], irradiance, snapshot.cloud_cover_pct, snapshot.temp_c)
            con = consumption_kw(house["archetype"], self.hour_of_day, rng)
            surplus = round(gen - con, 4)

            self._day_generation_kwh[meter_id] = round(
                self._day_generation_kwh[meter_id] + gen * elapsed_hours, 4
            )

            # Net draw loads the network: import is positive, export negative.
            self.grid.apply_house_load(house["nodeId"], -surplus)

            out.append(
                MeterReading(
                    meter_id=meter_id,
                    user_id=house["userId"],
                    node_id=house["nodeId"],
                    generation_kw=gen,
                    consumption_kw=con,
                    surplus_kw=surplus,
                    day_generation_kwh=self._day_generation_kwh[meter_id],
                )
            )

        for edge_id in self._forced_congestion:
            edge = self.grid.edges.get(edge_id)
            if edge:
                edge.current_load_kw = edge.capacity_kw * 0.97

        return out

    def market_state(self, readings: list[MeterReading]) -> MarketState:
        from .pricing import indicative_price  # imported here to avoid a cycle

        slot_start, slot_end = self.slot_bounds()
        hours = config.SLOT_MINUTES / 60.0

        supply = round(sum(max(0.0, r.surplus_kw) for r in readings) * hours, 4)
        demand = round(sum(max(0.0, -r.surplus_kw) for r in readings) * hours, 4)
        congestion = round(self.grid.congestion_index(), 4)

        return MarketState(
            slot_id=self.slot_id(),
            slot_start_sim=slot_start,
            slot_end_sim=slot_end,
            total_supply_kwh=supply,
            total_demand_kwh=demand,
            indicative_price_paise=indicative_price(
                supply, demand, congestion, config.DEFAULT_TARIFF
            ),
            last_clearing_price_paise=self._last_clearing_price,
            congestion_index=congestion,
            active_listings=sum(1 for r in readings if r.surplus_kw > 0.05),
            active_bids=sum(1 for r in readings if r.surplus_kw < -0.05),
        )

    def set_clearing_price(self, paise: int | None) -> None:
        self._last_clearing_price = paise

    def force_congestion(self, edge_id: str, on: bool = True) -> None:
        """Scripted congestion event for demo step 6."""
        if on:
            self._forced_congestion.add(edge_id)
        else:
            self._forced_congestion.discard(edge_id)

    # -- tick --------------------------------------------------------------

    async def build_tick(self, elapsed_real_seconds: float) -> Tick:
        snapshot = await weather.fetch_weather(hour_of_day=self.hour_of_day)
        elapsed_hours = (self.speed * elapsed_real_seconds) / 60.0
        readings = self.readings(snapshot, elapsed_hours)
        self.seq += 1
        return Tick(
            seq=self.seq,
            ts_sim=self.sim_time.isoformat(),
            ts_real=datetime.now(timezone.utc).isoformat(),
            speed=self.speed,
            weather=snapshot,
            meters=readings,
            market=self.market_state(readings),
        )

    async def stream(self) -> AsyncIterator[Tick]:
        """Yield one Tick per SIM_TICK_SECONDS, forever."""
        while True:
            tick = await self.build_tick(config.SIM_TICK_SECONDS)
            yield tick
            await asyncio.sleep(config.SIM_TICK_SECONDS)
            self.advance(config.SIM_TICK_SECONDS)


# ------------------------------------------------- fixture capture (H4) ---


async def capture(frames: int, speed: float, seed: int) -> list[dict]:
    """Produce `frames` ticks as fast as the event loop allows, no sleeping.

    This is the H4 handoff to the frontend pair.
    """
    sim = Simulator(speed=speed, seed=seed)
    out: list[dict] = []
    for _ in range(frames):
        tick = await sim.build_tick(config.SIM_TICK_SECONDS)
        out.append(tick.model_dump(by_alias=True))
        sim.advance(config.SIM_TICK_SECONDS)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="SunShare simulator")
    parser.add_argument("--capture", type=int, metavar="N", help="emit N ticks as JSON")
    parser.add_argument("--speed", type=float, default=config.SIM_SPEED)
    parser.add_argument("--seed", type=int, default=config.SIM_SEED)
    args = parser.parse_args()

    if not args.capture:
        parser.error("nothing to do: pass --capture N")

    frames = asyncio.run(capture(args.capture, args.speed, args.seed))
    # Compact: this fixture is imported by the Next.js client bundle.
    print(json.dumps(frames, separators=(",", ":")))


if __name__ == "__main__":
    main()
