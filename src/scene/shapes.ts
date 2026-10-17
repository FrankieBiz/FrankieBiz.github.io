import { Mesh, Vector3 } from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import type { ShapeId } from '../content/site'
import { createRocketSilhouette } from './Rocket'
import { mulberry32 } from './textures'

/**
 * Point clouds for the contact particle field. Each returns `count` xyz
 * triples centred on the origin, roughly 5 units tall. All forms are
 * abstract — no third-party marks.
 */

type Rand = () => number

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function writer(count: number) {
  const out = new Float32Array(count * 3)
  let i = 0
  return {
    out,
    get full() {
      return i >= count
    },
    push(x: number, y: number, z: number) {
      if (i >= count) return
      out[i * 3] = x
      out[i * 3 + 1] = y
      out[i * 3 + 2] = z
      i++
    },
  }
}

function onSegment(a: Vector3, b: Vector3, t: number, jitter: number, rand: Rand): [number, number, number] {
  return [
    lerp(a.x, b.x, t) + (rand() - 0.5) * jitter,
    lerp(a.y, b.y, t) + (rand() - 0.5) * jitter,
    lerp(a.z, b.z, t) + (rand() - 0.5) * jitter,
  ]
}

function onSphere(rand: Rand, r: number): [number, number, number] {
  const u = rand() * 2 - 1
  const a = rand() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return [Math.cos(a) * s * r, u * r, Math.sin(a) * s * r]
}

function rocket(count: number): Float32Array {
  const mesh = new Mesh(createRocketSilhouette())
  const sampler = new MeshSurfaceSampler(mesh).build()
  const w = writer(count)
  const p = new Vector3()
  const scale = 0.46
  while (!w.full) {
    sampler.sample(p)
    // Lean slightly, centred on the midpoint of the vehicle.
    const y = (p.y - 4.9) * scale
    const x = p.x * scale
    const lean = -0.18
    w.push(x * Math.cos(lean) - y * Math.sin(lean), x * Math.sin(lean) + y * Math.cos(lean), p.z * scale)
  }
  return w.out
}

/** A branching commit graph: trunk, branches that fork and merge, commit nodes. */
function graph(count: number, rand: Rand): Float32Array {
  const w = writer(count)
  const trunkA = new Vector3(0, -2.5, 0)
  const trunkB = new Vector3(0, 2.5, 0)
  const branches = [
    { y0: -1.9, y1: -0.3, x: 1.25, z: 0.35, merge: true },
    { y0: -0.9, y1: 1.1, x: -1.15, z: -0.3, merge: true },
    { y0: 0.7, y1: 2.15, x: 1.0, z: 0.25, merge: false },
  ]
  const nodes: Vector3[] = [-2.2, -1.2, -0.3, 0.7, 1.6, 2.4].map((y) => new Vector3(0, y, 0))

  const branchPoint = (b: (typeof branches)[number], s: number) => {
    // Out-curve, straight run, return-curve.
    const bend = 0.22
    const len = b.y1 - b.y0
    const y = b.y0 + s * len
    let k: number
    if (s < bend) k = Math.sin((s / bend) * Math.PI * 0.5)
    else if (s > 1 - bend && b.merge) k = Math.sin(((1 - s) / bend) * Math.PI * 0.5)
    else k = 1
    return new Vector3(b.x * k, y, b.z * k)
  }
  branches.forEach((b) => {
    for (const s of [0.4, 0.75]) nodes.push(branchPoint(b, s))
    if (!b.merge) nodes.push(branchPoint(b, 1))
  })

  const lineShare = Math.floor(count * 0.55)
  for (let i = 0; i < lineShare; i++) {
    if (rand() < 0.38) {
      w.push(...onSegment(trunkA, trunkB, rand(), 0.05, rand))
    } else {
      const b = branches[Math.floor(rand() * branches.length)]
      const p = branchPoint(b, rand())
      w.push(p.x + (rand() - 0.5) * 0.05, p.y + (rand() - 0.5) * 0.05, p.z + (rand() - 0.5) * 0.05)
    }
  }
  while (!w.full) {
    const n = nodes[Math.floor(rand() * nodes.length)]
    // Rings facing the viewer, with a little depth.
    const a = rand() * Math.PI * 2
    const r = 0.17 + (rand() - 0.5) * 0.03
    w.push(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r, n.z + (rand() - 0.5) * 0.06)
  }
  return w.out
}

/** A signal ring with a tilted orbit and a bright centre. */
function ring(count: number, rand: Rand): Float32Array {
  const w = writer(count)
  while (!w.full) {
    const pick = rand()
    const a = rand() * Math.PI * 2
    if (pick < 0.62) {
      const R = 1.95
      const tube = 0.07 * Math.sqrt(rand())
      const ta = rand() * Math.PI * 2
      const rr = R + Math.cos(ta) * tube
      w.push(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(ta) * tube)
    } else if (pick < 0.88) {
      const R = 2.55
      const x = Math.cos(a) * R
      const y = Math.sin(a) * R * 0.32
      const tilt = 0.5
      w.push(x, y * Math.cos(tilt), y * Math.sin(tilt) + (rand() - 0.5) * 0.03)
    } else {
      const [x, y, z] = onSphere(rand, 0.28 * Math.cbrt(rand()))
      w.push(x, y, z)
    }
  }
  return w.out
}

/** A node network on a sphere, each node linked to its nearest neighbours. */
function lattice(count: number, rand: Rand): Float32Array {
  const w = writer(count)
  const N = 26
  const nodes: Vector3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const a = i * golden
    nodes.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(2.15))
  }
  const edges: Array<[Vector3, Vector3]> = []
  const seen = new Set<string>()
  nodes.forEach((n, i) => {
    const nearest = nodes
      .map((m, j) => ({ j, d: n.distanceTo(m) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
    for (const { j } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([n, nodes[j]])
    }
  })
  const edgeShare = Math.floor(count * 0.66)
  for (let i = 0; i < edgeShare; i++) {
    const [a, b] = edges[Math.floor(rand() * edges.length)]
    w.push(...onSegment(a, b, rand(), 0.025, rand))
  }
  while (!w.full) {
    const n = nodes[Math.floor(rand() * nodes.length)]
    const [x, y, z] = onSphere(rand, 0.1)
    w.push(n.x + x, n.y + y, n.z + z)
  }
  return w.out
}

/** A small stack of pages, the front one set with lines of text. */
function sheets(count: number, rand: Rand): Float32Array {
  const w = writer(count)
  const W = 1.85
  const H = 2.5
  const sheetCount = 4
  const place = (s: number, x: number, y: number, z = 0): [number, number, number] => {
    const k = sheetCount - 1 - s
    const rot = -0.05 * k
    const ox = -0.32 * k + 0.45
    const oy = 0.2 * k - 0.3
    const oz = -0.38 * k
    return [x * Math.cos(rot) - y * Math.sin(rot) + ox, x * Math.sin(rot) + y * Math.cos(rot) + oy, z + oz]
  }
  const rows: Array<[number, number]> = []
  for (let y = H / 2 - 0.32; y > -H / 2 + 0.3; y -= 0.17) {
    const indent = rows.length % 5 === 0 ? 0.2 : 0
    rows.push([y, (W - 0.5 - indent) * (0.45 + rand() * 0.55)])
  }
  while (!w.full) {
    const pick = rand()
    const s = rand() < 0.62 ? sheetCount - 1 : Math.floor(rand() * (sheetCount - 1))
    if (pick < 0.32) {
      // Outline.
      const t = rand() * 2 * (W + H)
      let x: number
      let y: number
      if (t < W) [x, y] = [-W / 2 + t, H / 2]
      else if (t < W + H) [x, y] = [W / 2, H / 2 - (t - W)]
      else if (t < 2 * W + H) [x, y] = [W / 2 - (t - W - H), -H / 2]
      else [x, y] = [-W / 2, -H / 2 + (t - 2 * W - H)]
      w.push(...place(s, x + (rand() - 0.5) * 0.02, y + (rand() - 0.5) * 0.02))
    } else if (pick < 0.85 && s === sheetCount - 1) {
      const [y, len] = rows[Math.floor(rand() * rows.length)]
      const indent = Math.abs(y - (H / 2 - 0.32)) < 0.01 ? 0 : 0
      const x = -W / 2 + 0.25 + indent + rand() * len
      w.push(...place(s, x, y + (rand() - 0.5) * 0.035))
    } else {
      w.push(...place(s, (rand() - 0.5) * W, (rand() - 0.5) * H, (rand() - 0.5) * 0.02))
    }
  }
  return w.out
}

export function scatter(count: number, seed = 97): Float32Array {
  const rand = mulberry32(seed)
  const w = writer(count)
  while (!w.full) {
    const [x, y, z] = onSphere(rand, 6 + rand() * 7)
    w.push(x * 1.4, y * 0.8, z)
  }
  return w.out
}

export function buildShape(id: ShapeId, count: number): Float32Array {
  const rand = mulberry32(id.length * 977 + 13)
  switch (id) {
    case 'rocket':
      return rocket(count)
    case 'graph':
      return graph(count, rand)
    case 'ring':
      return ring(count, rand)
    case 'lattice':
      return lattice(count, rand)
    case 'sheets':
      return sheets(count, rand)
  }
}
