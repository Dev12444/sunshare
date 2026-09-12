"""Generate the PWA icon set from the SunShare mark.

Mirrors components/shell/brand.tsx: a sun rising over banded terraces, held in
a disc. Kept in step with that file by hand — if the mark changes, rerun this.

Pure standard library on purpose. Pillow is not a dependency of this repo and
adding one to produce four static PNGs that change once a year is a poor
trade; the whole rasteriser below is shorter than the install would be.

    python3 scripts/make_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "icons"

# Tokens copied from globals.css. Kept literal so the icon does not depend on
# a CSS build to know what colour it is.
PAPER = (247, 244, 238)
SOLAR = (224, 138, 12)
FOREST = (15, 61, 58)
FOREST_2 = (20, 78, 72)
FOREST_3 = (46, 109, 99)

SS = 4  # supersampling factor; 4x is enough to hide the stair-stepping


def terrace_top(x: float) -> float:
    """Top edge of the first band, in 48-unit space.

    A shallow parabola rather than the SVG's bezier: at icon sizes the two are
    indistinguishable, and this inverts to a simple per-pixel comparison.
    """
    t = (x - 24.0) / 26.0
    return 24.2 + 2.8 * t * t


def furrow_x(index: int, y: float) -> float:
    """Where furrow `index` sits at height `y`. They splay out as they descend."""
    base = (13.0, 25.0, 36.0)[index]
    spread = (-3.5, 0.0, 3.5)[index]
    k = max(0.0, (y - 24.0) / 20.0)
    return base + spread * k * k


def sample(x: float, y: float) -> tuple[int, int, int, int]:
    """Colour of the mark at a point in 48-unit space. Alpha 0 outside the disc."""
    dx, dy = x - 24.0, y - 24.0
    if dx * dx + dy * dy > 23.0 * 23.0:
        return (0, 0, 0, 0)

    top = terrace_top(x)

    # Furrows sit on top of the bands, so they are tested first.
    if y >= top - 1.0:
        for i in range(3):
            if abs(x - furrow_x(i, y)) < 0.7:
                return (*PAPER, 255)

    if y < top:
        sdx, sdy = x - 24.0, y - 21.0
        if sdx * sdx + sdy * sdy <= 13.5 * 13.5:
            return (*SOLAR, 255)
        return (*PAPER, 255)

    if y < top + 6.0:
        return (*FOREST_3, 255)
    if y < top + 12.0:
        return (*FOREST_2, 255)
    return (*FOREST, 255)


def render(size: int, safe: float = 1.0) -> bytes:
    """Rasterise to raw RGBA rows.

    `safe` shrinks the artwork for maskable icons, whose outer 20% may be
    cropped to whatever shape the launcher fancies.
    """
    rows: list[bytes] = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    u = (px + (sx + 0.5) / SS) / size
                    v = (py + (sy + 0.5) / SS) / size
                    # Map into 48-unit space, scaled about the centre for `safe`.
                    x = 24.0 + (u - 0.5) * 48.0 / safe
                    y = 24.0 + (v - 0.5) * 48.0 / safe
                    sr, sg, sb, sa = sample(x, y)
                    r += sr * sa
                    g += sg * sa
                    b += sb * sa
                    a += sa
            n = SS * SS
            if a == 0:
                # Outside the disc: paper, so the icon is never transparent on
                # a launcher that does not expect it.
                row += bytes((*PAPER, 255))
            else:
                row += bytes((r // a, g // a, b // a, a // n))
        rows.append(bytes(row))
    return b"".join(b"\x00" + r for r in rows)


def write_png(path: Path, size: int, safe: float = 1.0) -> None:
    raw = render(size, safe)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"  {path.name}  {size}x{size}  {len(png) // 1024} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "icon-192.png", 192)
    write_png(OUT / "icon-512.png", 512)
    write_png(OUT / "icon-maskable-512.png", 512, safe=0.76)
    write_png(OUT / "apple-touch-icon.png", 180)


if __name__ == "__main__":
    main()
