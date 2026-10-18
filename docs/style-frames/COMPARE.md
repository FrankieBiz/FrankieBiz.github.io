# Style frames vs the site

Reference frames (`01-pad.png` … `04-orbit.png`, generated with Imagen 3, prompts in
`PROMPTS.md`) and side-by-side comparisons (`compare-*.png`: frame left, site right,
1920×1080, high tier, real GPU) are kept locally and not committed.

Approved direction (2026-10-18): build toward frames 01, 02 and 04 as they are; use 03
only for the plume and the horizon curve (it came out as a daylight shot). Ignition smoke
stays bright steam, with frame 02's fire glow, sparks and a visible flame.

## What changed toward each frame

### 01 — pad at night (vu 0)

| Element | Before | Now |
| --- | --- | --- |
| Ground fog | three flat noise layers, edge-on from the low hero camera | + floodlit fog banks: wide, low sprites from the smoke flipbook (`GroundFog.ts`), 64 / 42 / 16 per tier, faded when seen from steeply above |
| Floodlamps | small glare + streak | + haze halos (9 m around each head) |
| Beams | `pow(facing, 2.2)`, 0.075 | broader and brighter: `pow(facing, 1.6)`, 0.11 |
| Beacon | bleached white by tone mapping | stays orange (0.25 + blink × 2.6) with its own blinking halo |
| Tower steel | roughness 0.55 / metalness 0.65, decks blew out under the spots | 0.8 / 0.45 (weathered steel) |

### 02 — ignition (vu 4.6–5.0)

| Element | Before | Now |
| --- | --- | --- |
| Steam | flipbook smoke, faint orange near the base | fire inside the steam: yellow-white at the heart, orange further out, falling off fast (`exp(-d × 0.48)`) so the cloud stays pale |
| Sparks | none | ballistic streaks cooling yellow-white → red (`Sparks.ts`), 380 / 240 / 90 per tier, gone once the rocket clears the tower |
| Flame | hidden by the mount at ignition | unchanged geometry; visible from liftoff. The frame's low trench-level camera was not adopted (it would hide the hero rocket's base) |

### 03 — ascent (vu 5.6–6.6), plume and horizon only

| Element | Before | Now |
| --- | --- | --- |
| Camera | below the rocket looking up through MAX-Q and MECO | telephoto tracking shot from just above (fov 30–31, subject shifted right of the copy) |
| Horizon | uniform black space in every direction | the night Earth below a horizon that sinks as the sky turns to space, with a thin airglow line; stars set behind it (sky dome + stars, `uLimb`) |

### 04 — orbit (vu 7.6–13.8)

| Element | Before | Now |
| --- | --- | --- |
| Earth | a sliver of limb in the bottom-right corner | night side with city lights fills the lower half (planet centre y −172 → −153) |
| Sun | off-frame to the right | crests the limb beside each capsule, rim-lighting it (`SUN_DIR` (0.75, 0.16, −1) → (0.27, 0.07, −1)) |
| Depth of field | 0.9 on payloads | 0.6: the nearer Earth bloomed city lights into large bokeh |

## Tonal range (luminance percentiles, 0–255)

| Frame | p5 | p25 | p50 | p75 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 frame | 4 | 13 | 23 | 52 | 132 | 214 |
| 01 site | 3 | 8 | 18 | 31 | 153 | 218 |
| 02 frame | 7 | 25 | 37 | 60 | 189 | 246 |
| 02 site | 3 | 12 | 44 | 119 | 155 | 220 |
| 04 frame | 3 | 14 | 29 | 85 | 201 | 245 |
| 04 site | 4 | 10 | 28 | 74 | 170 | 236 |

The grade was left as is. Shadows and highlights already sit in the frames' range. Frame
01's lifted, teal-leaning midtones come from its heavy fog and Imagen's palette, while the
brief asks for deep navy. Ignition's brighter midtones are the bright-steam choice.

## Cost

Every change together adds about 0.3 ms of GPU time on the medium tier (Intel Panther Lake
iGPU, DPR 1.5). Every beat on every tier holds 60 fps (`node scripts/qa-perf.mjs`), and the
fog banks and sparks ship as a 2.3 KB lazy chunk.
