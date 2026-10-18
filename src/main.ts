import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/geist-mono'
import 'lenis/dist/lenis.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/hud.css'
import './styles/loader.css'
import './styles/sections.css'

import gsap from 'gsap'
import { Vector2 } from 'three'
import { loadAssets } from './assets/load'
import { EMPTY_MANIFEST, selectTier, validateManifest, type AssetManifest } from './assets/manifest'
import { MAX_PROJECTS, projects as allProjects, validateProjects } from './content/projects'
import { site, type ShapeId } from './content/site'
import { Audio } from './core/Audio'
import { Loop } from './core/Loop'
import { Pointer } from './core/Pointer'
import { detectQuality, webglAvailable } from './core/Quality'
import { Renderer } from './core/Renderer'
import { Scroll } from './core/Scroll'
import { layoutActs, type ActId } from './director/acts'
import { createState, warpIntensity } from './director/state'
import { buildTimeline, computeBeats, keyTimes } from './director/timeline'
import { heatIntensity, shaftsEnabled } from './post/gates'
import { gradeAssets } from './post/Grade'
import { PostFX } from './post/PostFX'
import { World } from './scene/World'
import { Cursor } from './ui/Cursor'
import { Hud } from './ui/Hud'
import { Loader } from './ui/Loader'
import { renderSections } from './ui/render'
import { Sections } from './ui/Sections'

/** Scroll position saved across a reload after the GPU context is restored. */
const RESUME_KEY = 'fb:resume-vu'

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

async function loadFonts() {
  // allSettled: a font that fails to load must not take the whole site down.
  const fonts = Promise.allSettled([
    document.fonts.load('200 64px "Archivo Variable"'),
    document.fonts.load('600 64px "Archivo Variable"'),
    document.fonts.load('400 14px "Geist Mono Variable"'),
  ])
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))])
}

/** The build writes assets/manifest.json; a missing or invalid one means "no assets". */
async function fetchManifest(): Promise<AssetManifest> {
  try {
    const response = await fetch('assets/manifest.json', { cache: 'no-cache' })
    const isJson = response.headers.get('content-type')?.includes('json')
    if (!response.ok || !isJson) {
      if (import.meta.env.DEV) console.info('[assets] no manifest served; using the procedural scene. Run `npm run assets`.')
      return EMPTY_MANIFEST
    }
    const manifest = (await response.json()) as AssetManifest
    const problems = validateManifest(manifest)
    if (problems.length) {
      console.warn('[assets] manifest rejected:', problems.join('; '))
      return EMPTY_MANIFEST
    }
    return manifest
  } catch {
    return EMPTY_MANIFEST
  }
}

async function boot() {
  const root = document.documentElement
  const problems = validateProjects(allProjects)
  if (problems.length) console.warn('[projects.ts]', problems.join('\n'))
  const placeholders = site.contact.links.filter((l) => !/^(https?:|mailto:)/.test(l.href)).map((l) => l.label)
  if (import.meta.env.DEV && placeholders.length) console.info('[site.ts] placeholder contact links:', placeholders.join(', '))
  const projects = allProjects.slice(0, MAX_PROJECTS)

  const layout = layoutActs(projects.length)
  const main = document.querySelector<HTMLElement>('#mission')!
  renderSections(main, site, projects, layout)

  const quality = detectQuality()
  const reduced = quality.reducedMotion
  root.classList.toggle('reduced-motion', reduced)

  const scroll = new Scroll(reduced)
  scroll.jumpToTop()
  const pointer = new Pointer()
  const cursor = new Cursor(pointer)
  const audio = new Audio()
  const state = createState()
  const timeline = buildTimeline(state, layout, projects.length)
  const k = keyTimes(layout, projects.length)
  const beats = computeBeats(layout, projects.length, site.manifesto.length, site.launch.length)
  let ready = false
  let pending: number | null = null
  /** Fly somewhere; requests made during the loader are applied once it finishes. */
  const go = (vu: number) => {
    if (ready) scroll.toVu(vu)
    else pending = vu
  }
  const sections = new Sections(beats, reduced, go)
  const hud = new Hud(layout)

  // Navigation: every in-page link flies along the trajectory instead of jumping.
  const destinations: Record<ActId, number> = {
    pad: 0,
    manifesto: layout.byId.manifesto.start + 0.45,
    launch: layout.byId.launch.start,
    payloads: k.moduleStart(0) + 0.6,
    contact: Math.min(k.contactStart + 0.9, layout.scrollable),
  }
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null
    // Placeholder links (no real URL yet) stay focusable for the particle demo but go nowhere.
    if (target?.closest('a[aria-disabled="true"]')) {
      e.preventDefault()
      return
    }
    // Let modified clicks (new tab/window) behave natively.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const nav = target?.closest<HTMLAnchorElement>('[data-nav-to]')
    if (nav) {
      e.preventDefault()
      go(destinations[nav.dataset.navTo as ActId] ?? 0)
      return
    }
    if (target?.closest('[data-action="top"]')) go(0)
    if (target?.closest('.skip')) {
      e.preventDefault()
      go(destinations.payloads)
      document.querySelector<HTMLElement>('.payloads-intro__heading')?.focus({ preventScroll: true })
    }
  })

  const soundButton = document.querySelector<HTMLButtonElement>('.sound')!
  soundButton.addEventListener('click', () => {
    const on = audio.toggle()
    soundButton.setAttribute('aria-pressed', String(on))
    soundButton.querySelector('.sound__label')!.textContent = on ? 'Sound on' : 'Sound off'
  })
  document.addEventListener('pointerover', (e) => {
    if ((e.target as Element | null)?.closest('a, button')) audio.tick()
  })
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden))

  const loop = new Loop()

  /** Static, fully readable experience — used without WebGL or if the 3D boot fails. */
  const startPlain = () => {
    root.classList.remove('webgl')
    root.classList.add('no-webgl', 'is-ready')
    document.querySelector('.loader')?.remove()
    scroll.unlock()
    ready = true
    loop.add((dt) => {
      scroll.update(dt)
      const vu = Math.min(Math.max(scroll.vu, 0), layout.scrollable)
      timeline.time(vu)
      hud.update(state, vu)
      sections.update(vu)
    })
    loop.start()
    resume()
  }

  /** Where to go once the visitor can scroll: a saved position, else the URL hash. */
  const resume = () => {
    const saved = Number(sessionStorage.getItem(RESUME_KEY))
    sessionStorage.removeItem(RESUME_KEY)
    if (saved > 0) {
      scroll.jumpTo(Math.min(saved, layout.scrollable))
      return
    }
    if (pending !== null) {
      scroll.toVu(pending)
      pending = null
      return
    }
    const hash = location.hash.slice(1) as ActId
    if (hash in destinations && hash !== 'pad') scroll.toVu(destinations[hash])
  }

  if (!webglAvailable()) {
    startPlain()
    return
  }
  root.classList.add('webgl')

  // --------------------------------------------------------- pre-flight
  const loader = new Loader(reduced)
  scroll.lock()
  let renderer: Renderer
  let world: World
  let post: PostFX
  try {
    await loadFonts()
    loader.progress = 0.1

    // Authored assets (models, textures, environments). Any required failure
    // keeps the procedural scene, so a bad network never blanks the site.
    const manifest = await fetchManifest()
    // Loaders (glTF, HDR, LUT) and the AO pass are separate chunks, fetched only when needed.
    const { createDecoder } = await import('./assets/decoders')
    const aoModule = quality.budget.ao !== 'off' ? import('n8ao').catch(() => null) : Promise.resolve(null)
    const loaded = await loadAssets(selectTier(manifest, quality.budget.tier), {
      decode: createDecoder(),
      onProgress: (p) => (loader.progress = 0.1 + p * 0.4),
    })
    if (!loaded.ok) console.warn(`[assets] unavailable (${loaded.failed.join(', ')}); using the procedural scene.`)
    await nextFrame()

    const canvas = document.querySelector<HTMLCanvasElement>('canvas.gl')!
    renderer = new Renderer(canvas, quality.budget)
    // Render targets (baked planet, sky, environment maps) don't survive a lost
    // context; three restores the rest, so reload and come back to the same spot.
    canvas.addEventListener('webglcontextrestored', () => {
      sessionStorage.setItem(RESUME_KEY, String(scroll.vu))
      location.reload()
    })
    loader.progress = 0.55
    await nextFrame()

    world = new World(renderer.gl, quality, projects, site.name, loaded.ok ? loaded.assets : new Map())
    loader.progress = 0.7
    await nextFrame()

    const AOPass = (await aoModule)?.N8AOPostPass
    post = new PostFX(renderer.gl, world.scene, world.rig.camera, quality.budget, {
      grade: gradeAssets(loaded.ok ? loaded.assets : new Map()),
      AOPass,
      depthOfField: !reduced,
      shaftSource: world.exhaust.shaftSource,
    })
    const r = renderer
    const w = world
    const p = post
    r.onResize((width, height, dpr) => {
      w.resize(width, height, dpr)
      p.setSize(width, height)
    })

    // Compile every material up front, then render both worlds once so
    // textures, shadow maps and transmission targets are uploaded before launch.
    world.setAllVisible(true)
    try {
      await renderer.gl.compileAsync(world.scene, world.rig.camera)
    } catch (err) {
      console.warn('Shader pre-compilation failed; continuing.', err)
    }
    loader.progress = 0.85
    await nextFrame()
    const warmups: Array<Partial<typeof state>> = [
      { warp: 1, assemble: 1 },
      { warp: 0, assemble: 0, ignition: 1, smoke: 1, thrust: 1, altitude: 20 },
    ]
    for (const patch of warmups) {
      Object.assign(state, patch)
      world.update(1 / 60, 0, state, pointer)
      post.render(1 / 60, 0)
      await nextFrame()
    }
    world.setAllVisible(false)
    // Restore every value the warm-up touched: tracks that start later in the
    // timeline don't write until the scroll reaches them.
    const fresh = createState()
    Object.assign(state, { ...fresh, cam: state.cam })
    Object.assign(state.cam, fresh.cam)
    timeline.time(0)
    loader.progress = 0.95
  } catch (err) {
    console.error('3D boot failed; showing the static site instead.', err)
    loader.dispose()
    startPlain()
    return
  }

  // ------------------------------------------------------------- loop
  const veil = document.querySelector<HTMLElement>('.veil')!
  const heatA = new Vector2()
  const heatB = new Vector2()
  const intro = { amount: reduced ? 0 : 1 }
  const debug = new URLSearchParams(location.search).has('debug') ? createDebugOverlay() : null
  if (debug) Object.assign(window, { __mission: { scroll, state, timeline, layout, world, post, renderer } })

  loop.add((dt, t) => {
    scroll.update(dt)
    const vu = Math.min(Math.max(scroll.vu, 0), layout.scrollable)
    timeline.time(vu)
    pointer.update(dt)
    cursor.update(dt)
    world.update(dt, t, state, pointer)
    renderer.gl.info.reset()

    post.setFocus(world.rig.focusPoint, state.dofAmount)
    const orbit = world.current === 'orbit'
    const tier = quality.budget.tier
    const heat = heatIntensity({ ignition: state.ignition, orbit, reduced, tier })
    post.lens.setHeat(heat > 0 && world.flameScreenSegment(heatA, heatB) ? heat : 0, heatA, heatB)
    // Shafts need smoke to scatter off: full in the pad plume, faint once the camera tracks the climb.
    post.setShafts(shaftsEnabled({ ignition: state.ignition, orbit, tier }), state.ignition * (1 - state.follow * 0.85))
    const warp = warpIntensity(state.warp)
    post.lens.amount = reduced ? 0 : Math.max(intro.amount, warp)
    veil.style.opacity = reduced ? String(warp) : '0'
    post.render(dt, t)
    renderer.adapt(dt)

    hud.update(state, vu)
    if (ready) sections.update(vu)
    audio.update(state, world.current === 'orbit')
    root.classList.toggle('is-past-hero', vu > 0.6)
    debug?.(dt, renderer, quality.budget.tier, vu)
  })
  loop.start()

  // Contact channels reshape the particle field.
  let leaveTimer = 0
  const shapeFor = (el: Element | null) => el?.closest<HTMLElement>('[data-shape]')?.dataset.shape as ShapeId | undefined
  const enter = (e: Event) => {
    const shape = shapeFor(e.target as Element)
    if (!shape) return
    clearTimeout(leaveTimer)
    world.field.morphTo(shape)
  }
  const leave = (e: Event) => {
    if (!shapeFor(e.target as Element)) return
    clearTimeout(leaveTimer)
    leaveTimer = window.setTimeout(() => world.field.morphTo('rocket'), 350)
  }
  document.addEventListener('pointerover', enter)
  document.addEventListener('focusin', enter)
  document.addEventListener('pointerout', leave)
  document.addEventListener('focusout', leave)

  // ------------------------------------------------------------ launch
  await loader.complete(reduced ? 0.4 : 1.6)
  root.classList.add('is-ready')
  void loader.hide()
  if (reduced) {
    world.name.reveal = 1
  } else {
    gsap.to(intro, { amount: 0, duration: 1.8, ease: 'power3.out' })
    gsap.fromTo(world.name, { reveal: 0 }, { reveal: 1, duration: 2.2, delay: 0.35, ease: 'power2.inOut' })
  }
  scroll.unlock()
  ready = true
  resume()
}

function createDebugOverlay() {
  const el = document.createElement('pre')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'position:fixed;top:72px;left:12px;z-index:60;margin:0;padding:8px 10px;background:rgba(5,7,11,.8);color:#e8eef5;font:11px/1.5 ui-monospace,monospace;pointer-events:none'
  document.body.appendChild(el)
  let frames = 0
  let acc = 0
  return (dt: number, renderer: Renderer, tier: string, vu: number) => {
    frames++
    acc += dt
    if (acc < 0.5) return
    const info = renderer.gl.info.render
    el.textContent = `fps   ${(frames / acc).toFixed(0)}\ncalls ${info.calls}\ntris  ${(info.triangles / 1000).toFixed(0)}k\ndpr   ${renderer.pixelRatio.toFixed(2)}\ntier  ${tier}\nvu    ${vu.toFixed(2)}`
    frames = 0
    acc = 0
  }
}

boot().catch((err) => {
  console.error(err)
  const status = document.querySelector('.loader__status')
  if (status) status.textContent = 'Launch scrubbed. Reload to try again.'
  document.querySelector('.loader')?.classList.add('is-failed')
})
