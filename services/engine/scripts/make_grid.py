"""
Generate the demo distribution network — Dev, H6.5.

Writes data/grid.json (topology, matching the GridTopology model) and
data/households.json (meters + archetypes).

Two substations on purpose: a trade between houses under different substations
travels a genuinely longer electrical path, which is what makes the
proximity-weighted matching visibly do something. One substation would make
every match look the same.

    SS-1 (Sector 21)            SS-2 (Sector 27)
     ├── F-1 ── H-01 H-02 H-03   └── F-4 ── H-10 H-11 H-12
     ├── F-2 ── H-04 H-05 H-06
     └── F-3 ── H-07 H-08 H-09

Edge lengths are computed from the coordinates with haversine, so the map and
the loss model cannot disagree.

    python scripts/make_grid.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

# Gandhinagar, Gujarat.
SS1 = (23.2156, 72.6369)
SS2 = (23.2280, 72.6500)


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def offset(base: tuple[float, float], dlat: float, dlng: float) -> tuple[float, float]:
    return (round(base[0] + dlat, 6), round(base[1] + dlng, 6))


# (feeder id, substation, feeder offset, [(house id, house offset)])
LAYOUT = [
    ("F-1", "SS-1", (0.0035, -0.0040), [
        ("H-01", (0.0012, -0.0015)),
        ("H-02", (0.0020, -0.0028)),
        ("H-03", (0.0008, -0.0052)),
    ]),
    ("F-2", "SS-1", (-0.0030, 0.0025), [
        ("H-04", (-0.0010, 0.0012)),
        ("H-05", (-0.0022, 0.0020)),
        ("H-06", (-0.0038, 0.0031)),
    ]),
    ("F-3", "SS-1", (0.0012, 0.0058), [
        ("H-07", (0.0006, 0.0016)),
        ("H-08", (0.0018, 0.0024)),
        ("H-09", (-0.0009, 0.0033)),
    ]),
    ("F-4", "SS-2", (0.0028, 0.0035), [
        ("H-10", (0.0010, 0.0014)),
        ("H-11", (0.0021, 0.0026)),
        ("H-12", (0.0033, 0.0009)),
    ]),
]

# House -> (panel kW, consumption archetype, display name).
# Four houses have no panels: they are pure consumers, which the market needs.
HOUSEHOLDS = {
    "H-01": (7.5, "FAMILY_4", "Patel Residence"),
    "H-02": (5.0, "FAMILY_3", "Sharma Nivas"),
    "H-03": (0.0, "FAMILY_5", "Desai House"),
    "H-04": (10.0, "FAMILY_4", "Mehta Bungalow"),
    "H-05": (3.0, "COUPLE", "Joshi Apartment"),
    "H-06": (0.0, "FAMILY_4", "Trivedi House"),
    "H-07": (6.0, "FAMILY_3", "Shah Residence"),
    "H-08": (8.5, "FAMILY_5", "Raval Farmhouse"),
    "H-09": (0.0, "COUPLE", "Bhatt Flat"),
    "H-10": (4.5, "FAMILY_3", "Chauhan House"),
    "H-11": (9.0, "FAMILY_4", "Solanki Residence"),
    "H-12": (0.0, "FAMILY_5", "Vyas Nivas"),
}

SUBSTATION_CAPACITY_KW = 500.0
FEEDER_CAPACITY_KW = 60.0      # low enough that congestion is reachable on stage
HOUSE_CAPACITY_KW = 15.0
HT_LINK_CAPACITY_KW = 200.0    # SS-1 <-> SS-2 high-tension link


def build() -> tuple[dict, dict]:
    nodes: list[dict] = []
    edges: list[dict] = []
    coords: dict[str, tuple[float, float]] = {}

    # SS-1 is the root (the grid supply point). SS-2 hangs off it via an HT
    # line, so the network stays a single connected tree — without this the two
    # substations are disconnected islands and cross-substation trades are
    # impossible rather than merely lossy, which is not what we want to model.
    for sid, base, parent in (("SS-1", SS1, None), ("SS-2", SS2, "SS-1")):
        coords[sid] = base
        nodes.append({
            "id": sid,
            "kind": "SUBSTATION",
            "name": f"Substation {sid[-1]}",
            "lat": base[0],
            "lng": base[1],
            "parentId": parent,
            "capacityKw": SUBSTATION_CAPACITY_KW,
            "loadKw": 0.0,
        })

    edges.append({
        "id": "e-SS-1-SS-2",
        "fromNodeId": "SS-1",
        "toNodeId": "SS-2",
        "lengthKm": round(haversine_km(SS1, SS2), 4),
        "capacityKw": HT_LINK_CAPACITY_KW,
        "currentLoadKw": 0.0,
    })

    for fid, ssid, foff, houses in LAYOUT:
        fpos = offset(coords[ssid], *foff)
        coords[fid] = fpos
        nodes.append({
            "id": fid,
            "kind": "FEEDER",
            "name": f"Feeder {fid[-1]}",
            "lat": fpos[0],
            "lng": fpos[1],
            "parentId": ssid,
            "capacityKw": FEEDER_CAPACITY_KW,
            "loadKw": 0.0,
        })
        edges.append({
            "id": f"e-{ssid}-{fid}",
            "fromNodeId": ssid,
            "toNodeId": fid,
            "lengthKm": round(haversine_km(coords[ssid], fpos), 4),
            "capacityKw": FEEDER_CAPACITY_KW,
            "currentLoadKw": 0.0,
        })

        for hid, hoff in houses:
            hpos = offset(fpos, *hoff)
            coords[hid] = hpos
            panel_kw, archetype, name = HOUSEHOLDS[hid]
            nodes.append({
                "id": hid,
                "kind": "HOUSE",
                "name": name,
                "lat": hpos[0],
                "lng": hpos[1],
                "parentId": fid,
                "capacityKw": HOUSE_CAPACITY_KW,
                "loadKw": 0.0,
            })
            edges.append({
                "id": f"e-{fid}-{hid}",
                "fromNodeId": fid,
                "toNodeId": hid,
                "lengthKm": round(haversine_km(fpos, hpos), 4),
                "capacityKw": HOUSE_CAPACITY_KW,
                "currentLoadKw": 0.0,
            })

    households = []
    for fid, _ss, _fo, houses in LAYOUT:
        for hid, _ho in houses:
            panel_kw, archetype, name = HOUSEHOLDS[hid]
            households.append({
                "meterId": f"M-{hid[2:]}",
                "userId": f"U-{hid[2:]}",
                "nodeId": hid,
                "name": name,
                "panelKw": panel_kw,
                "archetype": archetype,
                "role": "PROSUMER" if panel_kw > 0 else "CONSUMER",
            })

    return {"nodes": nodes, "edges": edges}, {"households": households}


if __name__ == "__main__":
    grid, households = build()
    (DATA / "grid.json").write_text(json.dumps(grid, indent=2) + "\n")
    (DATA / "households.json").write_text(json.dumps(households, indent=2) + "\n")

    total_panel = sum(h["panelKw"] for h in households["households"])
    print(f"nodes      {len(grid['nodes'])}")
    print(f"edges      {len(grid['edges'])}")
    print(f"households {len(households['households'])}")
    print(f"prosumers  {sum(1 for h in households['households'] if h['panelKw'] > 0)}")
    print(f"installed  {total_panel:.1f} kWp")
