import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CATALOGUE } from '@/game/catalogue'
import { openEnds } from '@/game/connections'
import { GRID, dirDelta, tileCenter } from '@/game/grid'
import { useGameStore } from '@/store/gameStore'
import { RAIL_HEIGHT } from './geometry/tracks'

/** Subtle grid lines: visible in Build mode, faded out in Play mode (AC-3.1). */
export function GridLines() {
  const material = useRef<THREE.LineBasicMaterial>(null)
  const geometry = useMemo(() => {
    const pts: number[] = []
    const h = GRID / 2
    for (let i = 0; i <= GRID; i++) {
      const v = i - h
      pts.push(v, 0, -h, v, 0, h, -h, 0, v, h, 0, v)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  useFrame((_, dt) => {
    const m = material.current
    if (!m) return
    const target = useGameStore.getState().mode === 'build' ? 0.32 : 0
    m.opacity += (target - m.opacity) * Math.min(1, dt * 10)
    m.visible = m.opacity > 0.01
  })
  return (
    <lineSegments geometry={geometry} position={[0, 0.006, 0]} renderOrder={1}>
      <lineBasicMaterial ref={material} color="#7a5a3c" transparent opacity={0.32} depthWrite={false} />
    </lineSegments>
  )
}

const highlightGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/** Highlights the tile (or 2×2 footprint) under the pointer in Build mode (AC-3.2). */
export function TileHighlight() {
  const tile = useGameStore((s) => (s.mode === 'build' ? s.hoverTile : null))
  const tool = useGameStore((s) => s.drag?.type ?? s.selectedTool)
  if (!tile) return null
  const size = tool ? CATALOGUE[tool].size : 1
  const c = tileCenter(tile.gx, tile.gz)
  const off = (size - 1) / 2
  return (
    <mesh geometry={highlightGeo} position={[c.x + off, 0.008, c.z + off]} scale={[size * 0.96, 1, size * 0.96]} renderOrder={1}>
      <meshBasicMaterial color="#fff4dc" transparent opacity={0.32} depthWrite={false} />
    </mesh>
  )
}

const pegGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.035, 16)
const pegMat = new THREE.MeshStandardMaterial({ color: '#c4704f', roughness: 0.75 })
const MAX_PEGS = 512

/** Small terracotta pegs on every open track end, Build mode only (AC-7.4). Instanced. */
export function OpenEndMarkers() {
  const pieces = useGameStore((s) => s.pieces)
  const visible = useGameStore((s) => s.mode === 'build')
  const mesh = useRef<THREE.InstancedMesh>(null)
  const ends = useMemo(() => openEnds(pieces), [pieces])
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const o = new THREE.Object3D()
    const count = Math.min(ends.length, MAX_PEGS)
    for (let i = 0; i < count; i++) {
      const p = byId.get(ends[i].pieceId)!
      const c = tileCenter(p.gridX, p.gridZ)
      const d = dirDelta(ends[i].dir)
      o.position.set(c.x + d.dx * 0.42, RAIL_HEIGHT + 0.03, c.z + d.dz * 0.42)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.count = count
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [ends, byId])

  useFrame(({ clock }) => {
    if (mesh.current) mesh.current.position.y = Math.sin(clock.elapsedTime * 3) * 0.012
  })

  return <instancedMesh ref={mesh} args={[pegGeo, pegMat, MAX_PEGS]} visible={visible} frustumCulled={false} />
}
