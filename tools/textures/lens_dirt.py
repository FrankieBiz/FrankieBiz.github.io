#!/usr/bin/env python3
# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Generate a procedural lens-dirt texture (grayscale, 2048x1024).

Soft smudges, out-of-focus dust rings and fine specks, weighted toward the
frame edges like a real lens. It multiplies the bloom, so it only shows where
bright light hits it. Deterministic (seeded).
Run: uv run tools/textures/lens_dirt.py
"""
import os

import numpy as np
from PIL import Image

W, H = 2048, 1024
OUT = os.path.join("assets-src", "grade", "lens-dirt.png")


def stamp(img: np.ndarray, cx: float, cy: float, radius: float, amount: float, ring: bool) -> None:
    """Add a soft disc (or a dust ring with a brighter rim) in a local window."""
    r = int(radius * 2.5) + 2
    x0, x1 = max(int(cx) - r, 0), min(int(cx) + r, W)
    y0, y1 = max(int(cy) - r, 0), min(int(cy) + r, H)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    if ring:
        shape = np.exp(-((d - 1.0) ** 2) / 0.02) * 0.8 + np.exp(-(d**2) / 0.5) * 0.25
    else:
        shape = np.exp(-(d**2) * 1.6)
    img[y0:y1, x0:x1] += shape * amount


def main() -> None:
    rng = np.random.default_rng(11)
    img = np.zeros((H, W), dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    nx = (xx / W - 0.5) * 2.0
    ny = (yy / H - 0.5) * 2.0
    edge = np.clip(np.sqrt(nx**2 * 0.7 + ny**2), 0.0, 1.4)

    def edge_at(x: float, y: float) -> float:
        return float(edge[min(int(y), H - 1), min(int(x), W - 1)])

    # Broad smudges, stronger toward the edges.
    for _ in range(70):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        stamp(img, x, y, rng.uniform(40, 220), rng.uniform(0.04, 0.16) * (0.35 + edge_at(x, y)), ring=False)
    # Out-of-focus dust rings.
    for _ in range(90):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        stamp(img, x, y, rng.uniform(5, 26), rng.uniform(0.15, 0.5) * (0.4 + edge_at(x, y)), ring=True)
    # Fine specks.
    for _ in range(420):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        stamp(img, x, y, rng.uniform(0.8, 2.4), rng.uniform(0.2, 0.7), ring=False)

    img = np.clip(img / np.percentile(img, 99.7), 0.0, 1.0) ** 0.9
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray((img * 255).astype(np.uint8), mode="L").save(OUT)
    print(f"wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
