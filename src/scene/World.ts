import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  Object3D,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three'
import type { Project } from '../content/projects'
import type { Pointer } from '../core/Pointer'
import type { Quality } from '../core/Quality'
import { worldForWarp, type DirectorState } from '../director/state'
import { CameraRig } from './CameraRig'
import { Exhaust } from './Exhaust'
import { createFloodLensMaterial, LaunchPad } from './LaunchPad'
import { fieldPosition, ORBIT_ROCKET, PAD_ROCKET_Y } from './layout'
import { NamePlate } from './NamePlate'
import { PadModel } from './PadModel'
import { ParticleField } from './ParticleField'
import { Payloads } from './Payloads'
import { Planet } from './Planet'
import { planetTextures } from './planetTextures'
import { Rocket } from './Rocket'
import { RocketModel, type RocketLike } from './RocketModel'
import { Sky, SUN_DIR } from './Sky'
import { createNoiseTexture } from './bake'
import { createHullTextures, createPadTexture, createPuffTexture } from './textures'

export type WorldId = 'pad' | 'orbit'

/** Builds a tiny emissive scene and bakes it into a PMREM environment map. */
function bakeEnvironment(renderer: WebGLRenderer, top: Color, bottom: Color, panels: Array<[Vector3, Color, number]>): Texture {
  const scene = new Scene()
  const sphere = new SphereGeometry(50, 32, 16)
  const colors = new Float32Array(sphere.attributes.position.count * 3)
  const c = new Color()
  for (let i = 0; i < sphere.attributes.position.count; i++) {
    const y = sphere.attributes.position.getY(i) / 50
    c.copy(bottom).lerp(top, y * 0.5 + 0.5)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  sphere.setAttribute('color', new BufferAttribute(colors, 3))
  scene.add(new Mesh(sphere, new MeshBasicMaterial({ side: BackSide, vertexColors: true })))
  for (const [dir, color, size] of panels) {
    const panel = new Mesh(new PlaneGeometry(size, size * 0.6), new MeshBasicMaterial({ color, side: DoubleSide }))
    panel.position.copy(dir).normalize().multiplyScalar(40)
    panel.lookAt(0, 0, 0)
    scene.add(panel)
  }
  const pmrem = new PMREMGenerator(renderer)
  const tex = pmrem.fromScene(scene, 0.03).texture
  pmrem.dispose()
  return tex
}

export class World {
  readonly scene = new Scene()
  readonly rig: CameraRig
  readonly pad = new Group()
  readonly orbit = new Group()
  readonly rocket: RocketLike
  readonly launchPad: LaunchPad
  readonly exhaust: Exhaust
  readonly sky: Sky
  readonly planet: Planet
  readonly payloads: Payloads
  readonly field: ParticleField
  readonly name: NamePlate
  current: WorldId = 'pad'

  private envPad: Texture
  private envOrbit: Texture
  private fog = new FogExp2(0x1a2b42, 0.017)
  private fogColor = new Color()
  private follow = new Vector3()
  private nozzle = new Vector3()
  private tail = new Vector3()
  private down = new Vector3()
  private raycaster = new Raycaster()
  private ndc = new Vector2()
  private fieldPlane = new Plane(new Vector3(0, 0, 1), 0)
  private pointerHit = new Vector3()
  private restY = PAD_ROCKET_Y

  constructor(
    private renderer: WebGLRenderer,
    quality: Quality,
    projects: readonly Project[],
    name: { first: string; last: string },
    assets: Map<string, unknown> = new Map(),
  ) {
    const { budget } = quality
    const bakeWidth = budget.tier === 'low' ? 1024 : 2048
    const noise = createNoiseTexture()
    this.rig = new CameraRig(quality.reducedMotion)
    this.scene.add(this.pad, this.orbit)
    this.scene.fog = this.fog

    // Environments.
    this.envPad = bakeEnvironment(renderer, new Color('#1a2638'), new Color('#05070b'), [
      [new Vector3(12.5, 9, 9.5), new Color(5, 5.3, 6), 6],
      [new Vector3(-9.5, 9, -12.5), new Color(3.4, 3.8, 4.6), 6],
      [new Vector3(-13, 9, 7.5), new Color(2.2, 2.4, 2.8), 5],
    ])
    this.envOrbit = bakeEnvironment(renderer, new Color('#020305'), new Color('#1e3654'), [
      [SUN_DIR.clone(), new Color(40, 38, 34), 4],
    ])
    this.scene.environment = this.envPad

    // Shared rocket.
    // The Blender-authored rocket when it loaded; the procedural one otherwise.
    const paint = createHullTextures()
    const authored = assets.get('rocket') as { scene: Object3D } | undefined
    const hullAo = (assets.get('rocket-ao') as Texture | undefined) ?? null
    this.rocket = (authored && RocketModel.fromGltf(authored, paint, hullAo, budget.shadows)) || new Rocket(paint, budget.shadows)
    this.scene.add(this.rocket.group)

    // Pad world, with the Blender-authored structures when they loaded.
    const padGltf = assets.get('pad') as { scene: Object3D } | undefined
    const padAo = (assets.get('pad-ao') as Texture | undefined) ?? null
    const structures = (padGltf && PadModel.fromGltf(padGltf, padAo, createFloodLensMaterial(), budget.shadows)) || null
    const contactShadows = structures ? ((assets.get('ground-ao') as Texture | undefined) ?? null) : null
    this.launchPad = new LaunchPad(createPadTexture(contactShadows), noise, budget.shadows, structures)
    this.pad.add(this.launchPad.group)
    this.exhaust = new Exhaust(budget, createPuffTexture())
    this.rocket.nozzle.add(this.exhaust.flame)
    this.pad.add(this.exhaust.world)
    this.name = new NamePlate(name.first, name.last)
    this.pad.add(this.name.mesh)

    const hemi = new HemisphereLight('#24344d', '#06080b', 0.55)
    const moon = new DirectionalLight('#9fb6ff', 0.55)
    moon.position.set(-20, 30, -25)
    this.pad.add(hemi, moon)

    // Orbit world.
    this.planet = new Planet(renderer, bakeWidth, planetTextures(assets))
    this.payloads = new Payloads(projects, budget)
    this.field = new ParticleField(budget.contact, fieldPosition(projects.length))
    this.field.setReducedMotion(quality.reducedMotion)
    const sun = new DirectionalLight('#fff3e4', 3.2)
    sun.position.copy(SUN_DIR).multiplyScalar(100)
    const earthshine = new HemisphereLight('#05070b', '#2d4c70', 0.45)
    this.orbit.add(this.planet.group, this.payloads.group, this.field.group, sun, earthshine)
    this.orbit.visible = false

    this.sky = new Sky(renderer, budget.stars, bakeWidth)
    this.scene.add(this.sky.group)
  }

  resize(width: number, height: number, dpr: number) {
    this.rig.resize(width, height)
    this.name.layout(width / height, 21 * (width / height < 1 ? 1 + (1 - width / height) * 0.95 : 1), 34)
    this.exhaust.setProjection(height, 38, dpr)
    this.field.setProjection(height, 34, dpr)
    this.launchPad.setPixelRatio(dpr)
    this.sky.setPixelRatio(dpr)
  }

  /** Make every object visible once so shaders compile up front. */
  setAllVisible(on: boolean) {
    this.pad.visible = true
    this.orbit.visible = on
    this.field.group.visible = on
    this.exhaust.flame.visible = on
  }

  update(dt: number, time: number, state: DirectorState, pointer: Pointer) {
    const id = worldForWarp(state.warp)
    if (id !== this.current) this.setWorld(id)
    const orbit = id === 'orbit'

    // Rocket placement.
    const g = this.rocket.group
    if (!orbit) {
      const climb = state.altitude
      const turn = Math.pow(Math.min(climb / 560, 1), 1.6)
      g.position.set(climb * climb * 0.00022, this.restY + climb, 0)
      g.rotation.set(0, 0, -turn * 0.24)
      this.follow.set(g.position.x, g.position.y - this.restY, 0)
    } else {
      g.position.set(ORBIT_ROCKET[0] + Math.sin(time * 0.05) * 0.3, ORBIT_ROCKET[1] + Math.sin(time * 0.31) * 0.12, ORBIT_ROCKET[2])
      g.rotation.set(0.05, 0.25, -Math.PI / 2 + 0.1)
      this.rocket.body.rotation.y = time * 0.04
      this.follow.set(0, 0, 0)
    }
    this.rocket.setHeat(state.ignition)
    this.rocket.vibrate(time, state.ignition * state.thrust)

    this.rig.update(time, state, pointer, this.follow, orbit ? -Infinity : 0.5)
    const cam = this.rig.camera

    if (!orbit) {
      this.rocket.group.updateMatrixWorld()
      this.rocket.nozzle.getWorldPosition(this.nozzle)
      this.exhaust.update(dt, time, state, this.nozzle, state.altitude)
      this.launchPad.update(dt, time, state)
      this.name.setOpacity(state.hero)
      this.sky.horizonColor(state.sky, this.fogColor)
      this.fog.color.copy(this.fogColor)
      this.fog.density = 0.017 * (1 - state.sky * 0.92)
    } else {
      this.planet.update(time)
      this.payloads.update(time, state.focus)
      this.field.update(dt, time, state.assemble, this.pointerOnField(pointer))
    }
    this.sky.update(time, cam.position, orbit ? 1 : state.sky, orbit)
  }

  /**
   * The flame's screen-space segment (nozzle → ~7 units down the plume) in UV.
   * Returns false when the nozzle is behind the camera.
   */
  flameScreenSegment(a: Vector2, b: Vector2): boolean {
    const cam = this.rig.camera
    this.down.set(0, -1, 0).applyQuaternion(this.rocket.group.quaternion)
    this.tail.copy(this.nozzle).addScaledVector(this.down, 7)
    const pa = this.nozzle.clone().project(cam)
    const pb = this.tail.clone().project(cam)
    if (pa.z > 1 || pb.z > 1) return false
    a.set(pa.x * 0.5 + 0.5, pa.y * 0.5 + 0.5)
    b.set(pb.x * 0.5 + 0.5, pb.y * 0.5 + 0.5)
    return true
  }

  private pointerOnField(pointer: Pointer): Vector3 | null {
    if (!pointer.active || !this.field.group.visible) return null
    this.ndc.set(pointer.x, pointer.y)
    this.raycaster.setFromCamera(this.ndc, this.rig.camera)
    this.fieldPlane.constant = -this.field.group.position.z
    return this.raycaster.ray.intersectPlane(this.fieldPlane, this.pointerHit)
  }

  private setWorld(id: WorldId) {
    this.current = id
    const orbit = id === 'orbit'
    this.pad.visible = !orbit
    this.orbit.visible = orbit
    this.scene.environment = orbit ? this.envOrbit : this.envPad
    // Keep fog attached (avoids shader recompiles); orbit simply has none.
    if (orbit) this.fog.density = 0
    this.exhaust.flame.visible = !orbit
    this.rocket.body.rotation.y = 0
    this.renderer.shadowMap.needsUpdate = true
  }
}
