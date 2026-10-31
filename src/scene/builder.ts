import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export type Slot = 'wood' | 'paint' | 'plastic'
export const SLOTS: Slot[] = ['wood', 'paint', 'plastic']

export type Merged = Partial<Record<Slot, THREE.BufferGeometry>>

/** The texture repeats about every 1.4 tiles. */
const GRAIN_SCALE = 0.7

export const colors = {
  honey: '#dcb37a',
  maple: '#e9cf9f',
  walnut: '#a9774a',
  cream: '#efe3cb',
  sage: '#94a784',
  moss: '#7d9270',
  dusty: '#88a4b3',
  deepBlue: '#5f7f91',
  terracotta: '#c47e5e',
  rust: '#a9624a',
  mustard: '#d9b25f',
  charcoal: '#4b4640',
  ash: '#8a8176',
}

/** Collects parts and merges them per material slot. */
export class Builder {
  private parts: Record<Slot, THREE.BufferGeometry[]> = { wood: [], paint: [], plastic: [] }
  private seed = 0

  add(geometry: THREE.BufferGeometry, slot: Slot, color: string, matrix?: THREE.Matrix4) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (matrix) flat.applyMatrix4(matrix)
    flat.deleteAttribute('uv2')
    paint(flat, color)
    projectUvs(flat, (this.seed += 0.37))
    this.parts[slot].push(flat)
    return this
  }

  box(
    size: [number, number, number],
    position: [number, number, number],
    slot: Slot,
    color: string,
    radius = 0.02,
    rotation: [number, number, number] = [0, 0, 0],
  ) {
    const r = Math.min(radius, Math.min(...size) / 2 - 0.0005)
    const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 1, r)
    return this.add(geometry, slot, color, compose(position, rotation))
  }

  /** Upright turned shape from radius/height points, bottom to top. */
  lathe(
    points: [number, number][],
    position: [number, number, number],
    slot: Slot,
    color: string,
    segments = 16,
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) {
    const curve = points.map(([r, y]) => new THREE.Vector2(r, y))
    return this.add(
      new THREE.LatheGeometry(curve, segments),
      slot,
      color,
      compose(position, rotation, scale),
    )
  }

  /** A cylinder with softened rims, standing on its base at `position`. */
  peg(
    radius: number,
    height: number,
    position: [number, number, number],
    slot: Slot,
    color: string,
    rotation: [number, number, number] = [0, 0, 0],
    segments = 14,
  ) {
    const b = Math.min(radius * 0.3, height * 0.3, 0.02)
    return this.lathe(
      [
        [0, 0],
        [radius - b, 0],
        [radius, b],
        [radius, height - b],
        [radius - b, height],
        [0, height],
      ],
      position,
      slot,
      color,
      segments,
      rotation,
    )
  }

  /** A wheel: a peg lying on its side across the track. */
  wheel(radius: number, width: number, x: number, y: number, z: number, color: string) {
    return this.peg(
      radius,
      width,
      [x - width / 2, y, z],
      'plastic',
      color,
      [0, 0, -Math.PI / 2],
      12,
    )
  }

  sphere(
    radius: number,
    position: [number, number, number],
    slot: Slot,
    color: string,
    scale: [number, number, number] = [1, 1, 1],
  ) {
    return this.add(
      new THREE.SphereGeometry(radius, 16, 12),
      slot,
      color,
      compose(position, [0, 0, 0], scale),
    )
  }

  build(): Merged {
    const merged: Merged = {}
    for (const slot of SLOTS) {
      if (this.parts[slot].length === 0) continue
      merged[slot] = mergeGeometries(this.parts[slot])
      this.parts[slot].forEach((part) => part.dispose())
    }
    return merged
  }
}

export const compose = (
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  )

const paint = (geometry: THREE.BufferGeometry, hex: string) => {
  const color = new THREE.Color(hex)
  const count = geometry.getAttribute('position').count
  const data = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) data.set([color.r, color.g, color.b], i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
}

/** World-scale box projection, so grain density matches across parts of any size. */
export const projectUvs = (geometry: THREE.BufferGeometry, offset: number) => {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    let u = x
    let v = z
    if (nx >= ny && nx >= nz) {
      u = z
      v = y
    } else if (nz >= ny) {
      u = x
      v = y
    }
    uv[i * 2] = u * GRAIN_SCALE + offset
    uv[i * 2 + 1] = v * GRAIN_SCALE + offset * 0.61
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Rail cross-section, left to right over the top: width 0.42 with two wheel grooves. */
const RAIL_PROFILE: [number, number][] = [
  [-0.21, 0],
  [-0.21, 0.07],
  [-0.195, 0.085],
  [-0.125, 0.085],
  [-0.115, 0.06],
  [-0.075, 0.06],
  [-0.065, 0.085],
  [0.065, 0.085],
  [0.075, 0.06],
  [0.115, 0.06],
  [0.125, 0.085],
  [0.195, 0.085],
  [0.21, 0.07],
  [0.21, 0],
]

export const RAIL_TOP = 0.085
export const RAIL_GROOVE = 0.06

interface PathPoint {
  x: number
  z: number
  /** Unit direction across the rail. */
  ox: number
  oz: number
}

const sweep = (path: PathPoint[]) => {
  const positions: number[] = []
  const normals: number[] = []
  const pushQuad = (
    a: number[],
    b: number[],
    c: number[],
    d: number[],
    na: number[],
    nb: number[],
  ) => {
    // a, b on the first ring; c, d on the next. na at a/b, nb at c/d.
    positions.push(...a, ...b, ...c, ...c, ...b, ...d)
    normals.push(...na, ...na, ...nb, ...nb, ...na, ...nb)
  }
  const at = (p: PathPoint, u: number, y: number) => [p.x + p.ox * u, y, p.z + p.oz * u]

  for (let edge = 0; edge < RAIL_PROFILE.length - 1; edge++) {
    const [u0, y0] = RAIL_PROFILE[edge]
    const [u1, y1] = RAIL_PROFILE[edge + 1]
    const len = Math.hypot(u1 - u0, y1 - y0)
    // Profile runs left to right over the top, so its outward normal is (-dy, dx).
    const nu = -(y1 - y0) / len
    const ny = (u1 - u0) / len
    for (let i = 0; i < path.length - 1; i++) {
      const p = path[i]
      const q = path[i + 1]
      pushQuad(
        at(p, u0, y0),
        at(p, u1, y1),
        at(q, u0, y0),
        at(q, u1, y1),
        [p.ox * nu, ny, p.oz * nu],
        [q.ox * nu, ny, q.oz * nu],
      )
    }
  }

  // End caps show the sawn end of the rail.
  const shape = RAIL_PROFILE.map(([u, y]) => new THREE.Vector2(u, y))
  const triangles = THREE.ShapeUtils.triangulateShape(shape, [])
  const cap = (p: PathPoint, normal: number[]) => {
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map((i) => at(p, RAIL_PROFILE[i][0], RAIL_PROFILE[i][1]))
      const ux = b[0] - a[0]
      const uy = b[1] - a[1]
      const uz = b[2] - a[2]
      const vx = c[0] - a[0]
      const vy = c[1] - a[1]
      const vz = c[2] - a[2]
      const facing =
        (uy * vz - uz * vy) * normal[0] +
        (uz * vx - ux * vz) * normal[1] +
        (ux * vy - uy * vx) * normal[2]
      positions.push(...a, ...(facing > 0 ? b : c), ...(facing > 0 ? c : b))
      normals.push(...normal, ...normal, ...normal)
    }
  }
  const direction = (p: PathPoint, q: PathPoint) => {
    const length = Math.hypot(q.x - p.x, q.z - p.z)
    return [(q.x - p.x) / length, 0, (q.z - p.z) / length]
  }
  cap(path[0], direction(path[1], path[0]))
  cap(path[path.length - 1], direction(path[path.length - 2], path[path.length - 1]))

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

/** Straight rail along z, from south (+z) to north (-z). */
export const straightRail = (southZ = 0.5, northZ = -0.5) => {
  const point = (z: number): PathPoint => ({ x: 0, z, ox: 1, oz: 0 })
  return sweep([point(southZ), point(northZ)])
}

/** Quarter circle radius 0.5 about the tile's south-east corner, joining S to E. */
export const curvedRail = () => {
  const steps = 14
  const path: PathPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI + (i / steps) * (Math.PI / 2)
    const ox = -Math.cos(angle)
    const oz = -Math.sin(angle)
    path.push({ x: 0.5 - ox * 0.5, z: 0.5 - oz * 0.5, ox, oz })
  }
  return sweep(path)
}

export const addRail = (builder: Builder, geometry: THREE.BufferGeometry, color: string) => {
  builder.add(geometry, 'wood', color)
  geometry.dispose()
}
