# Frankie Bisignano — Launch to Orbit

A scroll-driven WebGL portfolio. One continuous Three.js scene: a night launch
pad, ignition and ascent, a transition through the atmosphere, then orbit,
where each project is a glass payload module, and a contact section where
particles reshape around each link.

Everything visual is procedural (no image, model or audio files).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally
npm test           # unit tests (choreography, scramble, telemetry, quality tiers, manifest)
```

Requires Node 22.12+.

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
shown is not representative of real hardware.

Behavioural checks (navigation, keyboard, focus, sound, contact morphs, resize,
GPU resource stability, console errors, and an optional axe accessibility scan):

```bash
node scripts/qa-interact.mjs
AXE_PATH=/path/to/axe-core/axe.min.js node scripts/qa-interact.mjs   # with axe
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to
`main`. In the repository settings set **Pages → Source** to **GitHub Actions**.
The build uses a relative base, so it works at `username.github.io` or at a
project sub-path.

After the first deploy, change `og:image` in `index.html` to the absolute URL
(e.g. `https://<user>.github.io/og.jpg`) — social crawlers ignore relative paths.

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
  core/        renderer, loop, scroll, pointer, quality tiers, generative audio
  director/    act layout, shared state, the scroll-scrubbed GSAP timeline
  scene/       rocket, pad, exhaust, sky, planet, payloads, particle field, camera
  post/        bloom + tone mapping, lens/transition effect, vignette, grain
  ui/          DOM rendering, loader, HUD, beat-driven reveals, text scramble, cursor
```

The scroll position (in viewport units) drives a paused GSAP timeline that
writes plain numbers into one state object; scene systems, post-processing and
the HUD only read it. All choreography lives in `src/director/timeline.ts`.
