# Style Frames: Generation Prompts and Model Details

This document records the exact final prompt text submitted and the image model used to generate the four cinematic style-frame reference images for the rocket-launch portfolio website.

## Model
- **Image Generation Model**: Google Imagen 3 (via Gemini Image Generation API)
- **Aspect Ratio / Resolution**: Native 16:9 generation (~1376x768), center-cropped to exact 16:9 and resized with Lanczos filter to 1920x1080 PNG.
- **Regenerations**: None. All frames complied with subject, style, and negative constraints on the first generation pass.

---

## 01-pad.png

- **Target File**: `docs/style-frames/01-pad.png`
- **Output Resolution**: 1920x1080 PNG
- **Model Used**: Google Imagen 3
- **Submitted Prompt**:
```
An original, fictional rocket (not resembling any real vehicle): slim white ceramic body, long pointed ogive nose, one narrow matte graphite band about halfway up, a black-and-white checkered roll pattern near the base, four large swept-back graphite fins, a single dark metal engine bell, a thin cable conduit up one side. No text, no logos, no watermarks. Shot like a feature film: anamorphic lens, shallow depth of field, film grain, restrained colour grade with deep navy shadows and frosted-white highlights; the only orange comes from fire or warning lights. The rocket stands at night on a concrete launch mount beside a dark steel lattice service tower with three access arms. Cold blue-white floodlights with volumetric beams through low ground fog, a faint starfield, a small orange beacon blinking on the tower mast. Low hero angle, rocket slightly right of centre.
```

---

## 02-ignition.png

- **Target File**: `docs/style-frames/02-ignition.png`
- **Output Resolution**: 1920x1080 PNG
- **Model Used**: Google Imagen 3
- **Submitted Prompt**:
```
An original, fictional rocket (not resembling any real vehicle): slim white ceramic body, long pointed ogive nose, one narrow matte graphite band about halfway up, a black-and-white checkered roll pattern near the base, four large swept-back graphite fins, a single dark metal engine bell, a thin cable conduit up one side. No text, no logos, no watermarks. Shot like a feature film: anamorphic lens, shallow depth of field, film grain, restrained colour grade with deep navy shadows and frosted-white highlights; the only orange comes from fire or warning lights. The moment of ignition, seen from a low angle near the pad: white-hot engine flame with visible shock diamonds, huge billowing exhaust smoke rolling sideways out of the flame trench, lit orange from below and cold blue from the floodlights above. Sparks and heat shimmer.
```

---

## 03-ascent.png

- **Target File**: `docs/style-frames/03-ascent.png`
- **Output Resolution**: 1920x1080 PNG
- **Model Used**: Google Imagen 3
- **Submitted Prompt**:
```
An original, fictional rocket (not resembling any real vehicle): slim white ceramic body, long pointed ogive nose, one narrow matte graphite band about halfway up, a black-and-white checkered roll pattern near the base, four large swept-back graphite fins, a single dark metal engine bell, a thin cable conduit up one side. No text, no logos, no watermarks. Shot like a feature film: anamorphic lens, shallow depth of field, film grain, restrained colour grade with deep navy shadows and frosted-white highlights; the only orange comes from fire or warning lights. The rocket climbing through thin high-altitude cloud at night, a long glowing exhaust plume trailing below, the sky fading from deep navy to black with stars appearing, the curve of the horizon faintly visible. Telephoto tracking shot.
```

---

## 04-orbit.png

- **Target File**: `docs/style-frames/04-orbit.png`
- **Output Resolution**: 1920x1080 PNG
- **Model Used**: Google Imagen 3
- **Submitted Prompt**:
```
A hexagonal glass payload capsule with dark graphite end caps floating in orbit, a polished metal knot sculpture suspended inside it. Below, a photoreal Earth at the day/night terminator: orange city lights on the night side, a thin blue atmosphere line, the sun just cresting the limb with a soft lens flare. Feature-film look, anamorphic lens, shallow depth of field on the capsule, film grain. No text, no logos, no watermarks.
```
