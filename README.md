# Frankie Bisignano — Launch to Orbit

A scroll-driven WebGL portfolio. One continuous Three.js scene: a night launch
pad, ignition and ascent, a transition through the atmosphere, then orbit,
where each project is a glass payload module, and a contact section where
particles reshape around each link.

The rocket, launch pad and tower are modelled by scripts in headless Blender,
with baked ambient occlusion. The exhaust smoke is a simulated Mantaflow flipbook,
the pad's reflections come from an environment path-traced in Blender, and the
Earth is built from NASA imagery. Each of these assets is optional: if one fails
to load, the site falls back to its procedural version, so a bad network never
blanks the page. Sound is generated live (there are no audio files).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally
npm test           # unit tests (choreography, quality tiers, assets, shaders, flipbook, …)
```

Requires Node 22.12+. The built assets are committed (`public/assets/`), so none of
the asset tooling below is needed just to run or deploy the site.

## Assets

Sources live in `assets-src/` (gitignored); `npm run assets` turns them into
per-tier files in `public/assets/` (WebP textures, meshopt-compressed GLB, HDR) plus
`manifest.json` with their real sizes. Steps to regenerate everything from scratch:

```bash
npm run assets:fetch                                    # NASA Earth imagery (~45 MB of sources)
npm run assets:grade                                    # colour-grade LUT + lens dirt (needs uv)
npm run assets:blender -- tools/blender/rocket.py       # rocket GLB + baked hull AO
npm run assets:blender -- tools/blender/pad.py          # tower, mount, arms, floods + AO atlas + ground contact shadows
npm run assets:blender -- tools/blender/environment.py  # pad environment HDR (needs pad.glb)
npm run assets:blender -- tools/blender/smoke.py        # Mantaflow smoke flipbook (~15 min, CPU)
npm run assets                                          # build public/assets + manifest
```

Blender runs headless (`blender` on PATH, or the Flatpak `org.blender.Blender`);
each script also writes a `.blend` and a preview render next to its outputs.
Per-tier download budgets (high 15 MB, medium 10 MB, low 6 MB) are enforced by the
manifest validation; the first-load JavaScript budget (300 KB gzip) by `npm run build`.

## Swap the placeholders

| What | Where |
|------|-------|
| Projects (title, summary, tags, repo/live links, the object inside each glass module) | `src/content/projects.ts` |
| Name, role, intro, manifesto lines, launch captions, contact links | `src/content/site.ts` |

`projects.ts` supports 1–6 entries; the orbit scene, scroll length and cards are
generated from the list. Empty `repo` / `live` values render as "not public yet".
Contact links with `href: '#'` are placeholders; replace them with real URLs.

## URL flags

| Flag | Effect |
|------|--------|
| `?quality=high\|medium\|low` | Force a quality tier (default is auto-detected from the GPU and device) |
| `?motion=reduced` | Preview the reduced-motion experience |
| `?debug` | FPS / draw-call overlay; exposes `window.__mission` |

## Visual QA

With the dev server running:

```bash
npm run qa                                  # desktop screenshots of every act → qa-shots/
npm run qa -- --mobile --quality=low        # phone viewport, low tier
npm run qa -- --only=4.6,8.6                # specific scroll positions (in viewport units)
```

Screenshots use software rendering (SwiftShader), so they're slow and the FPS
shown is not representative of real hardware. SwiftShader also hides driver-specific
shader bugs (a NaN that blacked out frames on Intel/Mesa never showed there), so
check on the machine's real GPU too:

```bash
node scripts/qa-perf.mjs          # fps, p95 frame time and adaptive DPR per tier × act
node scripts/qa-gpu.mjs           # GPU ms per post pass + scene cost per group (timer queries)
node scripts/qa-gpu-sanity.mjs    # whole timeline: NaN pixels and black frames (exits 1 on any)
```

`qa-gpu` samples the Intel GPU clock where the driver exposes it, because laptop
GPUs throttle under sustained load and skew back-to-back numbers.

Behavioural checks (navigation, keyboard, focus, sound, contact morphs, resize,
GPU resource stability, console errors, blocked and slow assets, reduced motion,
lost WebGL context, and an optional axe accessibility scan):

```bash
node scripts/qa-interact.mjs
AXE_PATH=/path/to/axe-core/axe.min.js node scripts/qa-interact.mjs   # with axe
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to
`main`. In the repository settings set **Pages → Source** to **GitHub Actions**.
The build uses a relative base, so it works at `username.github.io` or at a
project sub-path.

Live at **https://frankiebiz.github.io/**. Social crawlers ignore relative paths, so
`og:image`, `og:url` and the canonical link in `index.html` use that absolute URL;
update them if the site moves.

## Social preview image

`index.html` expects `public/og.jpg` (1200×630). Prompt for Gemini:

> Generate a high-resolution 1200×630 social preview image for a software
> engineer's portfolio themed as a rocket launch. Style: cinematic night
> photography, cold near-monochrome palette of deep navy (#05070B, #0A1220) and
> frosted white (#E8EEF5), with a single accent of ignition orange (#FF6A1A)
> only in the engine glow. Subject: a slender white ceramic rocket with a
> graphite interstage band and four swept graphite fins, standing on a concrete
> launch mount beside a dark lattice service tower, lit by cold floodlights
> with visible light beams through low ground fog; a faint starfield above.
> Low camera angle, rocket placed slightly right of centre, generous negative
> space on the left. Subtle film grain and gentle chromatic aberration at the
> edges. No text, no logos, no watermarks. Save to `public/og.jpg`.

## Structure

```
src/
  content/     site copy + project manifest (edit these)
  assets/      manifest, streaming loader, decoders (glTF, HDR, LUT, textures)
  core/        renderer + adaptive resolution, loop, scroll, pointer, quality tiers, audio
  director/    act layout, shared state, the scroll-scrubbed GSAP timeline
  scene/       rocket, pad, exhaust, smoke flipbook, fog, sparks, sky, planet, payloads,
               particle field, camera
  post/        AO, depth of field, light shafts, bloom + tone mapping, lens, grade, grain
  ui/          DOM rendering, loader, HUD, beat-driven reveals, text scramble, cursor
tools/blender/ headless Blender scripts for the authored assets
scripts/       asset build, bundle budget, visual / behavioural / real-GPU QA
docs/          design spec, plans, style-frame notes
```

The scroll position (in viewport units) drives a paused GSAP timeline that
writes plain numbers into one state object; scene systems, post-processing and
the HUD only read it. All choreography lives in `src/director/timeline.ts`.

## Credits

- Earth imagery: NASA Earth Observatory, public domain. Sources are Blue Marble Next
  Generation (July), Black Marble 2016 and the cloud composite.
- Built with [three.js](https://threejs.org), [postprocessing](https://github.com/pmndrs/postprocessing),
  [N8AO](https://github.com/N8python/n8ao), [GSAP](https://gsap.com) and [Lenis](https://lenis.darkroom.engineering).
  Fonts: Archivo and Geist Mono (via Fontsource).
- The rocket, pad, environment and smoke assets are original, generated by the scripts
  in `tools/blender/`. The style frames used for art direction (`docs/style-frames/`)
  are reference only and aren't shipped.
