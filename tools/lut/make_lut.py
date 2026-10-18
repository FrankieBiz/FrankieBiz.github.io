#!/usr/bin/env python3
"""Generate the site's colour grade as a 17^3 .cube LUT in the sRGB domain.

Night-launch look: slightly desaturated, cool shadows, warm highlight roll-off,
gentle contrast, lifted blacks and a soft shoulder so whites never clip hard.
Run: uv run python tools/lut/make_lut.py
"""
import math
import os

# 17^3 is the standard size for gentle grades; GPU interpolation fills the gaps.
SIZE = 17
OUT = os.path.join("assets-src", "grade", "grade.cube")


def smoothstep(e0: float, e1: float, x: float) -> float:
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def shoulder(c: float) -> float:
    """Monotonic soft clip above 0.88 that approaches but never reaches 1."""
    knee = 0.88
    if c <= knee:
        return c
    return knee + (1.0 - knee) * math.tanh((c - knee) / (1.0 - knee))


def grade(r: float, g: float, b: float) -> tuple[float, float, float]:
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    # Gentle desaturation toward luma.
    r, g, b = (c + (luma - c) * 0.12 for c in (r, g, b))
    # Cool shadows, warm highlights.
    s = 1.0 - smoothstep(0.0, 0.45, luma)
    h = smoothstep(0.55, 1.0, luma)
    r += -0.012 * s + 0.022 * h
    g += 0.004 * s + 0.008 * h
    b += 0.026 * s - 0.018 * h

    def finish(c: float) -> float:
        c = 0.45 + (c - 0.45) * 1.06  # soft contrast around the mids
        c = c * 0.97 + 0.012  # lifted blacks
        return min(max(shoulder(c), 0.0), 1.0)

    return finish(r), finish(g), finish(b)


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    lines = [
        'TITLE "FB-01 night grade"',
        f"LUT_3D_SIZE {SIZE}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
    ]
    step = 1.0 / (SIZE - 1)
    # .cube ordering: red varies fastest, then green, then blue.
    for bi in range(SIZE):
        for gi in range(SIZE):
            for ri in range(SIZE):
                r, g, b = grade(ri * step, gi * step, bi * step)
                lines.append(f"{r:.5f} {g:.5f} {b:.5f}")
    with open(OUT, "w", encoding="ascii") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({SIZE}^3)")


if __name__ == "__main__":
    main()
