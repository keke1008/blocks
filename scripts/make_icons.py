"""Generates the PWA icons in public/icons. Run: python3 scripts/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
BG = (11, 14, 20)
# A small stack of blocks (column, row, color) on a 4x4 grid.
BLOCKS = [
    (1, 0, (173, 77, 156)), (0, 1, (173, 77, 156)), (1, 1, (173, 77, 156)), (2, 1, (173, 77, 156)),
    (3, 1, (49, 199, 239)), (3, 2, (49, 199, 239)), (3, 3, (49, 199, 239)),
    (0, 2, (247, 211, 8)), (1, 2, (247, 211, 8)), (0, 3, (247, 211, 8)), (1, 3, (247, 211, 8)),
    (2, 2, (239, 32, 41)), (2, 3, (239, 32, 41)),
]


def icon(size: int, padding: float) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    inner = size * (1 - 2 * padding)
    cell = inner / 4
    off = size * padding
    gap = max(2, cell * 0.08)
    for cx, cy, color in BLOCKS:
        x0 = off + cx * cell + gap / 2
        y0 = off + cy * cell + gap / 2
        d.rounded_rectangle([x0, y0, x0 + cell - gap, y0 + cell - gap], radius=cell * 0.12, fill=color)
    return img


OUT.mkdir(parents=True, exist_ok=True)
icon(192, 0.14).save(OUT / "icon-192.png")
icon(512, 0.14).save(OUT / "icon-512.png")
icon(512, 0.24).save(OUT / "icon-maskable-512.png")
