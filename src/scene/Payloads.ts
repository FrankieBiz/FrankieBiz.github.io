import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector3,
} from 'three'
import type { PayloadForm, Project } from '../content/projects'
import { PAYLOAD_FORMS } from '../content/projects'
import type { QualityBudget } from '../core/Quality'
import { modulePosition } from './layout'

const FROST = new Color('#e8eef5')
const IGNITE = new Color('#ff6a1a')
const SPOT_OFFSET = new Vector3(2.5, 2.5, 3.5)

interface Module {
  root: Group
  core: Group
  edges: LineBasicMaterial
  led: MeshBasicMaterial
  animate: (time: number, focus: number) => void
}

/**
 * Payload modules: hexagonal glass capsules capped in graphite, each holding a
 * different procedural object. The module in focus brightens and spins up.
 */
export class Payloads {
  readonly group = new Group()
  private modules: Module[] = []
  private spot: PointLight
  private chrome: MeshPhysicalMaterial

  constructor(projects: readonly Project[], budget: QualityBudget) {
    const glass = budget.transmission
      ? new MeshPhysicalMaterial({
          color: '#ffffff',
          transmission: 1,
          thickness: 0.55,
          roughness: 0.1,
          ior: 1.46,
          metalness: 0,
          clearcoat: 0.45,
          clearcoatRoughness: 0.12,
          attenuationColor: new Color('#cfe2ff'),
          attenuationDistance: 5,
          specularIntensity: 0.65,
        })
      : new MeshPhysicalMaterial({
          color: '#cfdcec',
          transparent: true,
          opacity: 0.2,
          roughness: 0.25,
          metalness: 0,
          clearcoat: 1,
          depthWrite: false,
        })
    const cap = new MeshPhysicalMaterial({ color: '#191e26', roughness: 0.58, metalness: 0.6, clearcoat: 0.12 })
    // Satin alloy rather than mirror chrome: space reflects black, so mirrors read murky.
    this.chrome = new MeshPhysicalMaterial({ color: '#e8eef5', roughness: 0.3, metalness: 0.55, clearcoat: 0.6 })

    const shellGeo = new CylinderGeometry(1.15, 1.15, 2.5, 6, 1)
    const capGeo = new CylinderGeometry(1.24, 1.24, 0.2, 6, 1)
    const edgeGeo = new EdgesGeometry(shellGeo)
    const ledGeo = new SphereGeometry(0.035, 8, 6)

    projects.forEach((project, i) => {
      const root = new Group()
      root.position.set(...modulePosition(i))
      root.rotation.y = 0.35 + i * 0.4
      root.rotation.z = (i % 2 ? -1 : 1) * 0.08

      const shell = new Mesh(shellGeo, glass)
      shell.renderOrder = 6
      root.add(shell)
      const edges = new LineBasicMaterial({ color: FROST, transparent: true, opacity: 0.25 })
      root.add(new LineSegments(edgeGeo, edges))
      for (const y of [-1.35, 1.35]) {
        const c = new Mesh(capGeo, cap)
        c.position.y = y
        root.add(c)
      }
      const led = new MeshBasicMaterial({ color: IGNITE.clone().multiplyScalar(4) })
      const ledMesh = new Mesh(ledGeo, led)
      ledMesh.position.set(0, 1.47, 1.02)
      root.add(ledMesh)

      const form = PAYLOAD_FORMS.includes(project.form) ? project.form : PAYLOAD_FORMS[i % PAYLOAD_FORMS.length]
      const { core, animate } = this.buildCore(form)
      root.add(core)
      this.group.add(root)
      this.modules.push({ root, core, edges, led, animate })
    })

    this.spot = new PointLight('#e6eeff', 16, 18, 1.6)
    this.group.add(this.spot)
  }

  private buildCore(form: PayloadForm): { core: Group; animate: (t: number, focus: number) => void } {
    const core = new Group()
    switch (form) {
      case 'knot': {
        const knot = new Mesh(new TorusKnotGeometry(0.42, 0.12, 260, 28, 2, 3), this.chrome)
        core.add(knot)
        return {
          core,
          animate: (t, f) => {
            knot.rotation.x = t * (0.25 + f * 0.25)
            knot.rotation.y = t * (0.35 + f * 0.3)
          },
        }
      }
      case 'gyroscope': {
        const rings = [0.78, 0.62, 0.46].map((r, i) => {
          const ring = new Mesh(new TorusGeometry(r, 0.028, 16, 120), i === 1 ? this.chrome : new MeshStandardMaterial({ color: '#8a97a8', metalness: 1, roughness: 0.3 }))
          core.add(ring)
          return ring
        })
        const heart = new Mesh(new SphereGeometry(0.16, 32, 16), new MeshBasicMaterial({ color: FROST.clone().multiplyScalar(2.2) }))
        core.add(heart)
        return {
          core,
          animate: (t, f) => {
            const s = 0.6 + f * 0.8
            rings[0].rotation.set(t * 0.4 * s, 0, 0)
            rings[1].rotation.set(0, t * 0.55 * s, Math.PI / 2)
            rings[2].rotation.set(t * 0.7 * s, t * 0.3 * s, 0)
            heart.scale.setScalar(1 + Math.sin(t * 2.4) * 0.06 * f)
          },
        }
      }
      case 'cluster': {
        const hub = new Mesh(new IcosahedronGeometry(0.3, 0), this.chrome)
        core.add(hub)
        const shell = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(0.66, 1)), new LineBasicMaterial({ color: FROST, transparent: true, opacity: 0.35 }))
        core.add(shell)
        const satGeo = new IcosahedronGeometry(0.075, 0)
        const sats: Mesh[] = []
        for (let i = 0; i < 9; i++) {
          const s = new Mesh(satGeo, this.chrome)
          sats.push(s)
          core.add(s)
        }
        const axis = new Vector3()
        return {
          core,
          animate: (t, f) => {
            hub.rotation.set(t * 0.3, t * 0.45, 0)
            shell.rotation.set(-t * 0.08, t * 0.12, 0)
            sats.forEach((s, i) => {
              const a = t * (0.4 + f * 0.4) + i * 0.698
              axis.set(Math.cos(i * 1.7), Math.sin(i * 2.3), Math.cos(i * 0.9)).normalize()
              s.position.set(Math.cos(a) * 0.5, Math.sin(a * 1.3 + i) * 0.35, Math.sin(a) * 0.5).applyAxisAngle(axis, i)
              s.rotation.set(t * 2 + i, t + i, 0)
            })
          },
        }
      }
      case 'lattice':
      default: {
        const n = 4
        const count = n * n * n
        const cube = new InstancedMesh(new BoxGeometry(0.13, 0.13, 0.13), this.chrome, count)
        core.add(cube)
        const m = new Matrix4()
        const dummy = new Object3D()
        return {
          core,
          animate: (t, f) => {
            let k = 0
            for (let x = 0; x < n; x++)
              for (let y = 0; y < n; y++)
                for (let z = 0; z < n; z++) {
                  const px = (x - 1.5) * 0.24
                  const py = (y - 1.5) * 0.24
                  const pz = (z - 1.5) * 0.24
                  const wave = Math.sin(t * 1.8 - (x + y + z) * 0.6) * 0.5 + 0.5
                  dummy.position.set(px, py, pz)
                  dummy.scale.setScalar(0.45 + wave * (0.45 + f * 0.25))
                  dummy.rotation.set(wave * f, 0, 0)
                  dummy.updateMatrix()
                  m.copy(dummy.matrix)
                  cube.setMatrixAt(k++, m)
                }
            cube.instanceMatrix.needsUpdate = true
            core.rotation.y = t * 0.2
            core.rotation.x = 0.4
          },
        }
      }
    }
  }

  update(time: number, focus: number) {
    this.modules.forEach((mod, i) => {
      const f = Math.max(0, 1 - Math.abs(focus - i))
      mod.animate(time, f)
      mod.core.position.y = Math.sin(time * 0.8 + i) * 0.06
      mod.root.rotation.y += 0.0008 + f * 0.0012
      mod.edges.opacity = 0.18 + f * 0.4
      const blink = Math.sin(time * 3 + i) > 0.2 ? 1 : 0.15
      mod.led.color.copy(IGNITE).multiplyScalar(0.5 + blink * (2 + f * 4))
    })
    // A soft key light rides along with the focus.
    const idx = Math.min(Math.max(focus, 0), this.modules.length - 1)
    const a = this.modules[Math.floor(idx)]?.root.position
    const b = this.modules[Math.ceil(idx)]?.root.position
    if (a && b) {
      this.spot.position.lerpVectors(a, b, idx - Math.floor(idx)).add(SPOT_OFFSET)
    }
    this.spot.intensity = focus < 0 ? 0 : 16
  }

  get count() {
    return this.modules.length
  }
}
