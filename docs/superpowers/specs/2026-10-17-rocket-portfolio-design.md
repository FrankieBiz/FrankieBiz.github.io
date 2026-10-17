# Rocket Portfolio — Design Spec

**Date:** 2026-10-17
**Owner:** Frankie Bisignano
**Status:** Approved; implemented (see §10 for decisions made during the build)

## 1. Intent

A personal portfolio site that matches the look, motion, and craft level of
igloo.inc (Abeto / Bureaux, Awwwards Site of the Year 2024), with a **rocketship**
as the hero object instead of an igloo. It will later become a GitHub project
showcase; for now every project and manifesto slot is **placeholder content**.

### What the owner asked for
- igloo.inc-level visual quality and functionality.
- A rocketship replaces the igloo.
- Scroll-through content is placeholder.
- Future use: GitHub portfolio showcase.

### Assumptions (stated, not corrected)
- Personal portfolio for **Frankie Bisignano**.
- Static site, deployable to GitHub Pages.
- Desktop-first WebGL experience; graceful mobile, reduced-motion, and no-WebGL paths.
- **Original work.** Captures igloo's qualities (real-time 3D hero, scroll-driven
  camera through one continuous scene, scramble/glitch type, HUD micro-typography,
  cinematic post-processing, transition effects, particle links section, sound)
  without copying igloo's code, assets, or copy. No third-party logos (e.g. the
  GitHub Octocat) rendered as shapes.

### Success criteria
1. Reads as an award-tier WebGL site: cinematic loader, continuous camera path,
   cohesive art direction, polished micro-interactions.
2. Holds ~60fps on a mid-range laptop (integrated GPU) at the default quality tier.
3. Placeholders are swapped by editing **one file** (`src/content/projects.ts`;
   manifesto/contact copy in `src/content/site.ts`).
4. All content is real DOM text (accessible, indexable).
5. `npm run build` produces a static `dist/` that works from any base path.

## 2. Art Direction — "Launch → Orbit"

- **Palette:** near-black navy `#05070B` (void), deep navy `#0A1220` (night sky),
  frost white `#E8EEF5` (primary type / rocket hull), cold steel `#8A97A8`
  (secondary type / HUD), hairline `rgba(232,238,245,0.14)`.
  **Single accent: ignition orange `#FF6A1A`** — reserved for engine flame,
  "live" indicators, and city lights on the night side of the planet.
- **Typography:** Display — **Archivo** variable at max width (`wdth 125`),
  uppercase, tight tracking, weights 300–800. HUD/body — **Geist Mono**.
  Both self-hosted via `@fontsource` packages (no external font CDN).
- **Image finish:** one merged post-processing pass — mipmap bloom, subtle
  chromatic aberration, film grain, vignette — plus a custom **transition effect**
  (displacement + chromatic split + frost/heat noise) driven by a single uniform.
- **Motion language:** long, eased, scrubbed camera moves; characters decode via
  scramble; HUD numbers tick; nothing bounces. Expo/quart-out easing for UI,
  scroll-scrubbed (linear-mapped, Lenis-smoothed) for camera.

## 3. Experience — Acts

One Three.js scene, one camera, one scroll timeline. DOM sections in normal flow
define scroll length; the WebGL canvas is fixed behind them.

| # | Act | Scroll length | Content & behavior |
|---|-----|---------------|--------------------|
| 0 | **Pre-flight (loader)** | — (blocks scroll) | Black screen. Mono counter `000→100` tracks real progress (fonts ready, geometry built, shaders compiled via `renderer.compileAsync`). Checklist lines tick ✓ (`GUIDANCE`, `TELEMETRY`, `PROPULSION`, `PAYLOAD`, `RANGE SAFETY`). Minimum ~1.6s. Exits with the transition effect wiping to the scene. |
| 1 | **Pad (hero)** | 100vh | Night launch pad: rocket beside a service gantry, lit fog, ground haze, pad floodlights. Camera low, slight pointer parallax + idle drift. Giant wide-set name **FRANKIE BISIGNANO**, role line, "SCROLL TO LAUNCH" cue. |
| 2 | **Manifesto** | ~200vh | Camera cranes up the fuselage. 3 placeholder manifesto lines scramble in sequentially. HUD shows FUEL / LOX PRESSURE readouts filling. |
| 3 | **Ignition → Ascent** | ~250vh | Scroll-scrubbed launch: engine flame ignites, exhaust particles + billowing smoke ring, camera shake proportional to thrust, rocket climbs. Sky gradient shifts navy→black, fog thins, stars fade in. At the "Max-Q / Kármán line" beat the transition effect peaks and the environment swaps from pad-world to orbit-world. |
| 4 | **Orbit / Payloads** | ~100vh per project (4 placeholders) | Rocket coasting above a stylized planet limb (procedural surface, fresnel atmosphere, orange city lights on the night side). Camera flies module-to-module. Each **payload module** = glass capsule (physical transmission material) encasing a different procedural object (torus knot, gyroscope rings, icosahedron cluster, lattice cube). Pinned DOM card: `PAYLOAD 0N`, title, description, tech tags, `REPO` / `LIVE` links. |
| 5 | **Transmission (contact)** | ~150vh | GPU particle field (~20k desktop) morphs between shapes as links are hovered/focused: idle = rocket silhouette; GitHub = branching commit graph; Email = torus ring; LinkedIn = node lattice; Résumé = stacked sheets. Curl-noise swirl during morphs, color shifts with morph velocity (frost → orange), glow via bloom. Footer: ©, "RETURN TO PAD" (scroll to top), build credit. |

### Persistent HUD (DOM, fixed)
- **Top-left:** `FB—01` mark + name.
- **Top-right:** nav (Manifesto / Payloads / Contact) + sound toggle (animated bars).
- **Bottom-left:** live telemetry bound to scene state — `ALT`, `VEL`, `T±` mission clock.
- **Bottom-right:** act index `0N / 05` + thin scroll progress rail.
- **Cursor:** small crosshair reticle (pointer: fine only) that expands over interactive elements.

## 4. Architecture

Stack: **Vite + TypeScript (strict) + Three.js + GSAP + Lenis +
`postprocessing` (pmndrs)**. Vitest for unit tests. No framework.

### Data flow
```
Lenis (smooth scroll) ──► scroll position in vu ──► master GSAP timeline (paused; time = vu)
                                               │ tweens plain numbers on
                                               ▼
                                       Director state object
                    { camT, ignition, altitude, transition, orbitT, contactT, ... }
                                               │ read every frame
               ┌───────────────┬───────────────┼───────────────┬──────────────┐
               ▼               ▼               ▼               ▼              ▼
          CameraRig         Rocket        Exhaust/Sky     PostFX uniforms   HUD telemetry
```
- One `requestAnimationFrame` loop (`core/Loop`) calls `update(dt, t)` on every
  registered system, then renders through the composer.
- The scroll timeline only writes to the **Director state**; scene systems only
  read it. This keeps choreography in one place (`director/timeline.ts`).
- DOM copy is shown by beat windows (vu ranges) computed alongside the timeline;
  entering a window toggles `is-active` and decodes `[data-scramble]` text.

### Module layout
```
src/
  main.ts                 boot: quality → renderer → scene → loader → timeline
  styles/                 tokens.css, base.css, hud.css, sections.css, loader.css
  content/
    site.ts               name, role, manifesto lines, contact links (placeholder)
    projects.ts           payload placeholders (single swap point)
  core/
    Renderer.ts           WebGLRenderer, DPR cap, resize
    Loop.ts               single RAF, system registry, debug FPS (?debug)
    Scroll.ts             Lenis + ScrollTrigger wiring, scrollTo
    Pointer.ts            normalized pointer + smoothed parallax
    Quality.ts            tier detection (high / medium / low) → budgets
    Audio.ts              WebAudio generative drone + ignition rumble + UI ticks
  director/
    state.ts              Director state shape + defaults
    timeline.ts           master scrubbed timeline (all choreography)
  scene/
    World.ts              scene graph, env map (PMREM RoomEnvironment), world swap
    CameraRig.ts          follow / parallax / shake / portrait framing on top of the timeline's camera keys
    Rocket.ts             procedural rocket (lathe hull, fins, nozzle, panels, decal)
    LaunchPad.ts          pad, gantry, floodlights, ground fog
    Exhaust.ts            stateless GPU particles + flame cone + smoke ring
    Sky.ts                gradient dome + twinkling star field
    Planet.ts             procedural planet + atmosphere rim + city lights
    Payloads.ts           glass capsules + inner objects
    ParticleField.ts      morphing contact particles
    shaders/              *.glsl
  post/
    PostFX.ts             composer, merged effect pass
    TransitionEffect.ts   custom displacement / chroma / frost effect
  ui/
    scramble.ts           text decode utility
    Loader.ts             pre-flight sequence
    Hud.ts                telemetry, act index, progress rail, nav
    Cursor.ts             reticle
    Sections.ts           section reveals, payload cards, contact hover → shape
```

### Quality tiers (`core/Quality.ts`)
| Budget | high | medium | low (mobile / weak GPU) |
|--------|------|--------|-------------------------|
| DPR cap | 1.75 | 1.5 | 1.25 |
| Exhaust particles | 6k | 4k | 1.5k |
| Contact particles | 20k | 14k | 6k |
| Stars | 6k | 4k | 2k |
| Glass transmission | on | on | off (frosted fallback) |
| Bloom | mipmap, full | mipmap, half-res | off |

Tier comes from `prefers-reduced-motion`, pointer type, viewport, and a WebGL
renderer string heuristic; `?quality=high|medium|low` overrides.

## 5. Fallbacks & Accessibility
- **Reduced motion:** no camera shake, no chromatic transition (crossfade
  instead), scramble resolves instantly, Lenis disabled (native scroll).
- **No WebGL:** `html.no-webgl` — static gradient background, all sections and
  links fully readable, loader skipped.
- **Keyboard:** all links/buttons focusable with visible focus rings; contact
  link focus triggers the same particle morph as hover.
- **Semantics:** landmark elements, one `h1`, section headings, `aria-live="off"`
  on ticking telemetry (decorative, `aria-hidden`).
- **Audio:** off by default; only starts after explicit toggle.

## 6. Assets
Everything visual is procedural — no image, model, or audio files required.
`index.html` references `/og.jpg` (1200×630) for social cards; a Gemini prompt
for it is provided at handoff. Favicon is a minimal geometric SVG mark.

## 7. Verification
- `npm run typecheck` (tsc --noEmit, strict) and `npm run build` must pass.
- **Vitest** unit tests: scramble utility, camera path sampling/clamping,
  quality-tier selection, content schema (projects.ts shape).
- **Visual QA:** headless-browser screenshots at each act's scroll checkpoint,
  desktop (1440×900) and mobile (390×844); reviewed before claiming done.
- `?debug` shows an FPS/draw-call overlay for manual performance checks.

## 8. Deployment
- Vite `base: './'` so `dist/` works at a root domain or a project sub-path.
- GitHub Actions workflow builds and deploys `dist/` to GitHub Pages on push to `main`.

## 9. Out of Scope (YAGNI)
- Real project content, project detail pages, CMS, blog.
- Pulling live data from the GitHub API.
- WebGL-rendered UI text (DOM chosen for accessibility).
- Recorded audio/music assets.

## 10. Decisions made during implementation

- **No ScrollTrigger.** The paused master timeline's time is set directly to the
  scroll position in viewport units each frame. Every segment is an explicit
  `fromTo`, so flings and nav jumps land on identical state (unit-tested).
- **Camera keys instead of a spline.** Shots are keyframes tweened by the
  timeline (easing per segment, so the camera settles on text beats).
  `CameraRig` layers rocket-follow, parallax, thrust shake, a horizontal-only
  portrait dolly and framing via `setViewOffset`.
- **Fixed copy stages.** Each act's stage is `position: fixed`; visibility comes
  only from beat windows. Sticky stages drifted out of sync with the camera in
  the last viewport of each act.
- **Baked noise.** Planet surface, clouds and the galactic band are rendered once
  into equirectangular textures at load; ground fog and beam dust sample a
  tileable CPU-generated noise texture. Per-pixel fractal noise in the orbit
  shot was the dominant cost.
- **In-world name.** The hero name is a WebGL plane between the rocket and the
  tower (the rocket occludes it). Landscape: the rocket stands in the word gap.
  Portrait: the words stack above the nose cone. A visually hidden `h1` carries
  the name for assistive tech.
- **Keyboard access.** All copy stays in the accessibility tree; focusing an
  element in an inactive beat flies the scroll to that beat.
