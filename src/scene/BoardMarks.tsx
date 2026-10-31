import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GRID_HALF, GRID_SIZE, sideDelta, tileCenter } from '@/game/grid'
import { openEnds } from '@/game/rules'
import { useGame } from '@/game/store'

const LINE_WIDTH = 0.034
const GRID_OPACITY = 0.36

/** Subtle lines, faded out in Play mode. Thin strips rather than GL lines, so they keep their
 *  weight at every zoom and pixel ratio. */
export function GridLines() {
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(() => {
    const half = LINE_WIDTH / 2
    const positions: number[] = []
    const strip = (x0: number, z0: number, x1: number, z1: number) =>
      positions.push(x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z1, x1, 0, z0, x0, 0, z0)
    for (let i = 0; i <= GRID_SIZE; i++) {
      const at = i - GRID_HALF
      strip(at - half, -GRID_HALF - half, at + half, GRID_HALF + half)
      strip(-GRID_HALF - half, at - half, GRID_HALF + half, at + half)
    }
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return buffer
  }, [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#4f3c2a',
        transparent: true,
        opacity: GRID_OPACITY,
        depthWrite: false,
      }),
    [],
  )
  const mesh = useRef<THREE.Mesh>(null)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const goal = useGame.getState().mode === 'build' ? GRID_OPACITY : 0
    const step = goal - material.opacity
    if (step === 0) return
    material.opacity = Math.abs(step) < 0.004 ? goal : material.opacity + step * (1 - Math.exp(-9 * dt))
    if (mesh.current) mesh.current.visible = material.opacity > 0
    invalidate()
  })

  return <mesh ref={mesh} geometry={geometry} material={material} position={[0, 0.012, 0]} renderOrder={1} />
}

export function TileHighlight() {
  const tile = useGame((state) => (state.mode === 'build' ? state.hoverTile : null))
  const dragging = useGame((state) => state.drag !== null)
  if (!tile || dragging) return null
  const { x, z } = tileCenter(tile.gridX, tile.gridZ)
  return (
    <mesh position={[x, 0.014, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial color="#fdf2d8" transparent opacity={0.34} depthWrite={false} />
    </mesh>
  )
}

const MARKER_LIMIT = 512
const MARKER_INSET = 0.42

/** Small pegs at the open ends of tracks, Build mode only. */
export function OpenEndMarkers() {
  const pieces = useGame((state) => state.pieces)
  const build = useGame((state) => state.mode === 'build')
  const hidden = useGame((state) => state.drag?.pieceId ?? null)
  const invalidate = useThree((state) => state.invalidate)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#e8a64a', roughness: 0.6 }),
    [],
  )

  useEffect(() => {
    if (!mesh.current) return
    const dummy = new THREE.Object3D()
    const ends = openEnds(pieces.filter((piece) => piece.id !== hidden))
    ends.forEach((end, index) => {
      const { x, z } = tileCenter(end.gridX, end.gridZ)
      const [dx, dz] = sideDelta[end.side]
      dummy.position.set(x + dx * MARKER_INSET, 0.1, z + dz * MARKER_INSET)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(index, dummy.matrix)
    })
    mesh.current.count = ends.length
    mesh.current.instanceMatrix.needsUpdate = true
    invalidate()
  }, [pieces, hidden, invalidate])

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, MARKER_LIMIT]}
      visible={build}
      frustumCulled={false}
    />
  )
}
