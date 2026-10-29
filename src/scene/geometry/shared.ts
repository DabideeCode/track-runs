import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

export interface Placement {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  s?: number
}

const tmp = new THREE.Object3D()

/** Bake a transform into a geometry (returns the same geometry). */
export function place<T extends THREE.BufferGeometry>(geo: T, p: Placement = {}): T {
  tmp.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  tmp.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)
  tmp.scale.setScalar(p.s ?? 1)
  tmp.updateMatrix()
  geo.applyMatrix4(tmp.matrix)
  return geo
}

/** Rounded box sitting on y = 0 unless placed otherwise; radius keeps edges soft (§6). */
export function rbox(w: number, h: number, d: number, r = 0.02, p: Placement = {}) {
  const radius = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)
  return place(new RoundedBoxGeometry(w, h, d, 2, radius), p)
}

export function cyl(rTop: number, rBottom: number, h: number, p: Placement = {}, segments = 20) {
  return place(new THREE.CylinderGeometry(rTop, rBottom, h, segments), p)
}

/** Merge geometries that share a material into one, so each piece is 1–3 meshes (D28). */
export function mergeParts(specs: Array<[THREE.BufferGeometry, THREE.Material]>): Part[] {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const [geo, mat] of specs) {
    const flat = geo.index ? geo.toNonIndexed() : geo
    flat.deleteAttribute('uv1')
    flat.deleteAttribute('uv2')
    if (!flat.getAttribute('uv')) {
      flat.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((flat.getAttribute('position').count) * 2), 2))
    }
    const list = byMaterial.get(mat) ?? []
    list.push(flat)
    byMaterial.set(mat, list)
  }
  return [...byMaterial.entries()].map(([material, geos]) => {
    const geometry = mergeGeometries(geos, false)!
    geometry.computeBoundingSphere()
    return { geometry, material }
  })
}

/**
 * Annular sector lying on the ground (top at y = h), centred at local (cx, cz).
 * Angles are world angles in the x/z plane (x = cx + r cos a, z = cz + r sin a).
 */
export function ringSector(
  cx: number,
  cz: number,
  rInner: number,
  rOuter: number,
  a0: number,
  a1: number,
  h: number,
  bevel = 0,
) {
  // Shape space (x, y) maps to world (x, -z) after rotateX(-π/2); world angle a becomes −a.
  const s0 = -a1
  const s1 = -a0
  const ri = rInner + bevel
  const ro = rOuter - bevel
  const shape = new THREE.Shape()
  shape.moveTo(cx + ro * Math.cos(s0), -cz + ro * Math.sin(s0))
  shape.absarc(cx, -cz, ro, s0, s1, false)
  shape.lineTo(cx + ri * Math.cos(s1), -cz + ri * Math.sin(s1))
  shape.absarc(cx, -cz, ri, s1, s0, true)
  shape.closePath()
  const depth = Math.max(0.001, h - 2 * bevel)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 24,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, bevel, 0)
  return geo
}

/** A profile (r, y) pairs revolved around Y. */
export function lathe(points: Array<[number, number]>, segments = 28, p: Placement = {}) {
  return place(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), p)
}
