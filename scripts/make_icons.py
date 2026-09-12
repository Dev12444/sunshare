"""Generate the PWA icon set — Dev, standing in for Diya's H0-H1 item.

Lighthouse will not call the app installable without at least a 192 and a 512,
and the custom install prompt has nothing to show until they exist.

Mark: a sun low over a rooftop carrying a solar array, in the app's own
sun/grid palette, drawn to stay legible at 48px on a home screen.

    python3 scripts/make_icons.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "icons"

GROUND = (15, 23, 42)       # grid-900
SUN = (251, 191, 36)        # sun-400
SUN_CORE = (253, 230, 138)  # sun-200
ROOF = (248, 250, 252)
PANEL = (56, 132, 255)


def draw(size: int, safe: float = 1.0) -> Image.Image:
    """Render at 4x and downsample, for clean edges without antialiasing tricks.

    `safe` shrinks the artwork for maskable icons, whose outer 20% may be
    cropped to any shape the launcher chooses.
    """
    s = size * 4
    img = Image.new("RGBA", (s, s), GROUND)
    d = ImageDraw.Draw(img)

    cx, cy = s / 2, s / 2
    scale = safe

    # Sun disc, sitting above the roof line.
    r = s * 0.17 * scale
    sun_y = cy - s * 0.13 * scale
    d.ellipse([cx - r, sun_y - r, cx + r, sun_y + r], fill=SUN)
    d.ellipse(
        [cx - r * 0.62, sun_y - r * 0.62, cx + r * 0.62, sun_y + r * 0.62],
        fill=SUN_CORE,
    )

    # Rays, skipping only the lower arc that the roof hides.
    # ang = i*45 - 90, so i=3,4,5 point down-right, down, down-left.
    ray_len, ray_w = s * 0.075 * scale, s * 0.028 * scale
    for i in range(8):
        if 135 <= (i * 45) <= 225:
            continue
        ang = math.radians(i * 45 - 90)
        x0 = cx + math.cos(ang) * (r * 1.28)
        y0 = sun_y + math.sin(ang) * (r * 1.28)
        x1 = cx + math.cos(ang) * (r * 1.28 + ray_len)
        y1 = sun_y + math.sin(ang) * (r * 1.28 + ray_len)
        d.line([x0, y0, x1, y1], fill=SUN, width=max(1, int(ray_w)))

    # Roof: a wide, shallow gable.
    roof_y = cy + s * 0.10 * scale
    half = s * 0.30 * scale
    apex = s * 0.13 * scale
    d.polygon([(cx - half, roof_y), (cx, roof_y - apex), (cx + half, roof_y)], fill=ROOF)

    # Solar array on the near slope, as three slats.
    for i in range(3):
        t0 = 0.12 + i * 0.26
        t1 = t0 + 0.20
        y_off = s * 0.018 * scale
        p0 = (cx - half + (half * t0), roof_y - apex * t0 + y_off)
        p1 = (cx - half + (half * t1), roof_y - apex * t1 + y_off)
        d.line([p0, p1], fill=PANEL, width=max(1, int(s * 0.030 * scale)))

    # Wall below the roof.
    d.rectangle(
        [cx - half * 0.72, roof_y, cx + half * 0.72, roof_y + s * 0.13 * scale],
        fill=ROOF,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = [
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        # Maskable art must survive an aggressive circular crop, so it is drawn
        # inside the 80% safe zone.
        ("icon-maskable-512.png", 512, 0.72),
        ("apple-touch-icon.png", 180, 1.0),
        ("favicon-32.png", 32, 1.0),
    ]
    for name, size, safe in specs:
        draw(size, safe).convert("RGB").save(OUT / name, "PNG", optimize=True)
        print(f"  {name:26s} {size}x{size}")


if __name__ == "__main__":
    main()
