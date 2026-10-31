import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CATALOG, DECORATION_TYPES, TRACK_TYPES } from '@/game/catalog'
import { pieceCenter } from '@/game/grid'
import { useGame } from '@/game/store'
import type { Piece, PieceType } from '@/game/types'
import { SLOTS, type Slot } from './builder'
import { contactBlobTexture, outlineMaterial, type TextureSet, sharedMaterials } from './materials'
import { ghostPose } from './motion'
import { pieceGeometry } from './pieces'

const CAPACITY = 256
const ALL_TYPES: PieceType[] = [...TRACK_TYPES, ...DECORATION_TYPES]

const LAND_TIME = 0.26
const LAND_CONTACT = 0.06
const ROTATE_TIME = 0.15
const HOVER_RISE = 0.05
const LIFT = 0.3
const MAX_FRAME = 0.05

interface Anim {
  piece: Piece
  x: number
  z: number
  /** Degrees, clockwise, unwrapped so a turn always goes the short way round. */
  rotation: number
  rotationFrom: number
  rotationTo: number
  rotationStart: number
  landStart: number
  landHeight: number
  hover: number
  squash: number
  y: number
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

const toRad = (degrees: number) => (-degrees * Math.PI) / 180

const shortestDelta = (from: number, to: number) => (((to - from) % 360) + 540) % 360 - 180

const idHash = (id: string) => {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return (hash >>> 0) / 0xffffffff
}

const anims = new Map<string, Anim>()

/** Current animated transform of a piece, for the selection outline. */
export const pieceAnim = (id: string) => anims.get(id)

const dummy = new THREE.Object3D()
const tint = new THREE.Color()

const writeMatrix = (a: Anim) => {
  dummy.position.set(a.x, a.y, a.z)
  dummy.rotation.set(0, toRad(a.rotation), 0)
  dummy.scale.set(1 + (1 - a.squash) * 0.5, a.squash, 1 + (1 - a.squash) * 0.5)
  dummy.updateMatrix()
}

const newAnim = (piece: Piece): Anim => {
  const { x, z } = pieceCenter(piece.type, piece.gridX, piece.gridZ)
  return {
    piece,
    x,
    z,
    rotation: piece.rotation,
    rotationFrom: piece.rotation,
    rotationTo: piece.rotation,
    rotationStart: -1,
    landStart: -1,
    landHeight: 0,
    hover: 0,
    squash: 1,
    y: 0,
  }
}

const startLanding = (a: Anim, now: number) => {
  a.landStart = now
  if (ghostPose.active) {
    a.x = ghostPose.x
    a.z = ghostPose.z
    a.landHeight = ghostPose.y
    a.rotationFrom = ghostPose.rotation
    a.rotation = ghostPose.rotation
    const delta = shortestDelta(a.rotation, a.piece.rotation)
    a.rotationTo = a.rotation + delta
    a.rotationStart = delta === 0 ? -1 : now
  } else {
    a.landHeight = LIFT
  }
}

export interface Fade {
  key: number
  piece: Piece
  x: number
  z: number
  rotation: number
}

/** Advances one piece. Returns true while it still needs frames. */
const advance = (a: Anim, now: number, dt: number, hovered: boolean) => {
  let busy = false
  const { x: tx, z: tz } = pieceCenter(a.piece.type, a.piece.gridX, a.piece.gridZ)

  const follow = 1 - Math.exp(-24 * dt)
  if (Math.abs(a.x - tx) + Math.abs(a.z - tz) > 0.0015) {
    a.x += (tx - a.x) * follow
    a.z += (tz - a.z) * follow
    busy = true
  } else {
    a.x = tx
    a.z = tz
  }

  if (a.rotationStart >= 0) {
    const t = Math.min(1, (now - a.rotationStart) / ROTATE_TIME)
    a.rotation = a.rotationFrom + (a.rotationTo - a.rotationFrom) * easeOutCubic(t)
    if (t >= 1) a.rotationStart = -1
    busy = true
  }

  const hoverTarget = hovered ? HOVER_RISE : 0
  if (Math.abs(a.hover - hoverTarget) > 0.0008) {
    a.hover += (hoverTarget - a.hover) * (1 - Math.exp(-20 * dt))
    busy = true
  } else {
    a.hover = hoverTarget
  }

  let lift = 0
  let squash = 1
  if (a.landStart >= 0) {
    const elapsed = now - a.landStart
    if (elapsed < LAND_CONTACT) {
      const t = elapsed / LAND_CONTACT
      lift = a.landHeight * (1 - t * t)
    } else if (elapsed < LAND_TIME) {
      const t = (elapsed - LAND_CONTACT) / (LAND_TIME - LAND_CONTACT)
      lift = 0.028 * Math.sin(Math.PI * t)
      squash = 1 - 0.05 * (1 - t) * Math.cos(Math.PI * t * 1.5) ** 2
    } else {
      a.landStart = -1
    }
    busy = true
  }
  a.y = lift + a.hover
  a.squash = squash
  return busy
}

/** All placed pieces, drawn as one InstancedMesh per piece type and material. */
export function PieceInstances({ textures }: { textures: TextureSet }) {
  const materials = sharedMaterials(textures)
  const invalidate = useThree((state) => state.invalidate)
  const clock = useRef(0)
  const lastPieces = useRef<Piece[] | null>(null)
  const lastHidden = useRef<string | null>(null)
  const lastSynced = useRef(false)
  const meshes = useRef(new Map<PieceType, Partial<Record<Slot, THREE.InstancedMesh>>>())
  const slots = useRef(new Map<PieceType, Anim[]>())
  const blobMesh = useRef<THREE.InstancedMesh>(null)
  const busyIds = useRef(new Set<string>())
  const lastHover = useRef<string | null>(null)
  const [fades, setFades] = useState<Fade[]>([])
  const fadeKey = useRef(0)

  const blobGeometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1)
    plane.rotateX(-Math.PI / 2)
    return plane
  }, [])

  const blobMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: contactBlobTexture(),
        color: '#3f2d1d',
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      anims.clear()
    }
  }, [])

  const writeInstances = () => {
    let blobCount = 0
    const blob = blobMesh.current
    for (const type of ALL_TYPES) {
      const list = slots.current.get(type) ?? []
      const set = meshes.current.get(type)
      if (!set) continue
      const radius = CATALOG[type].blob
      list.forEach((a, index) => {
        writeMatrix(a)
        for (const slot of SLOTS) set[slot]?.setMatrixAt(index, dummy.matrix)
        if (radius > 0 && blob) {
          dummy.position.set(a.x, 0.009, a.z)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(radius * 2.1)
          dummy.updateMatrix()
          blob.setMatrixAt(blobCount++, dummy.matrix)
        }
      })
      for (const slot of SLOTS) {
        const mesh = set[slot]
        if (!mesh) continue
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    if (blob) {
      blob.count = blobCount
      blob.instanceMatrix.needsUpdate = true
    }
  }

  const writeTints = () => {
    for (const type of ALL_TYPES) {
      const list = slots.current.get(type) ?? []
      const set = meshes.current.get(type)
      if (!set) continue
      list.forEach((a, index) => {
        // A touch of per-piece variation so repeated pieces do not look stamped.
        const shade = 0.94 + idHash(a.piece.id) * 0.1
        tint.setRGB(shade, shade, shade)
        for (const slot of SLOTS) set[slot]?.setColorAt(index, tint)
      })
      for (const slot of SLOTS) {
        const colors = set[slot]?.instanceColor
        if (colors) colors.needsUpdate = true
      }
    }
  }

  const syncPieces = (now: number) => {
    const state = useGame.getState()
    const hidden = state.drag?.pieceId ?? state.dropEffect?.pieceId ?? null
    if (meshes.current.size < ALL_TYPES.length) {
      invalidate()
      return false
    }
    const first = !lastSynced.current
    const instant = first || state.instantEdit

    if (lastPieces.current === state.pieces && lastHidden.current === hidden && !first) return false

    const present = new Set(state.pieces.map((piece) => piece.id))
    for (const [id, a] of anims) {
      if (present.has(id)) continue
      if (!instant) {
        const fade: Fade = {
          key: ++fadeKey.current,
          piece: a.piece,
          x: a.x,
          z: a.z,
          rotation: a.rotation,
        }
        setFades((list) => [...list, fade])
      }
      anims.delete(id)
      busyIds.current.delete(id)
    }

    const nextSlots = new Map<PieceType, Anim[]>()
    for (const piece of state.pieces) {
      let a = anims.get(piece.id)
      if (!a) {
        a = newAnim(piece)
        anims.set(piece.id, a)
        if (!instant) {
          startLanding(a, now)
          busyIds.current.add(piece.id)
        }
      } else if (lastHidden.current === piece.id && hidden !== piece.id) {
        a.piece = piece
        startLanding(a, now)
        busyIds.current.add(piece.id)
      } else if (a.piece !== piece) {
        const delta = shortestDelta(a.piece.rotation, piece.rotation)
        const movedTile = a.piece.gridX !== piece.gridX || a.piece.gridZ !== piece.gridZ
        a.piece = piece
        if (instant) {
          const { x, z } = pieceCenter(piece.type, piece.gridX, piece.gridZ)
          a.x = x
          a.z = z
          a.rotation = a.rotationFrom = a.rotationTo = piece.rotation
          a.rotationStart = -1
        } else {
          if (delta !== 0) {
            // R always turns clockwise, even the 270 to 0 step.
            const turn = delta < 0 ? delta + 360 : delta
            // Continue from where the last turn was heading, so a quick second R adds up.
            const base = a.rotationStart >= 0 ? a.rotationTo : a.rotation
            a.rotationFrom = a.rotation
            a.rotationTo = base + (movedTile ? delta : turn)
            a.rotationStart = now
          }
          busyIds.current.add(piece.id)
        }
      }
      if (piece.id === hidden) continue
      const list = nextSlots.get(piece.type)
      if (list) list.push(a)
      else nextSlots.set(piece.type, [a])
    }

    slots.current = nextSlots
    lastPieces.current = state.pieces
    lastHidden.current = hidden
    lastSynced.current = true
    state.pieces.forEach((piece) => {
      const a = anims.get(piece.id)
      if (a) advance(a, now, 0, false)
    })
    writeTints()
    writeInstances()
    return true
  }

  // Before the ghost and outline in the same frame.
  useFrame((_, rawDt) => {
    // In demand mode the first delta after idling is the whole idle gap.
    const dt = Math.min(rawDt, MAX_FRAME)
    clock.current += dt
    const now = clock.current
    const state = useGame.getState()
    let changed = syncPieces(now)

    const hoverId = state.drag || state.selectedTool ? null : state.hoverPieceId
    if (hoverId) busyIds.current.add(hoverId)
    if (lastHover.current && lastHover.current !== hoverId) busyIds.current.add(lastHover.current)
    lastHover.current = hoverId

    for (const id of busyIds.current) {
      const a = anims.get(id)
      if (!a) {
        busyIds.current.delete(id)
        continue
      }
      if (!advance(a, now, dt, id === hoverId)) busyIds.current.delete(id)
      changed = true
    }

    if (changed) writeInstances()
    if (busyIds.current.size > 0) invalidate()
  })

  return (
    <>
      {ALL_TYPES.map((type) => (
        <TypeMeshes
          key={type}
          type={type}
          materials={materials}
          register={(set) => meshes.current.set(type, set)}
        />
      ))}
      <instancedMesh
        ref={blobMesh}
        args={[blobGeometry, blobMaterial, CAPACITY]}
        frustumCulled={false}
        renderOrder={1}
      />
      {fades.map((fade) => (
        <FadingPiece
          key={fade.key}
          fade={fade}
          materials={materials}
          onDone={() => setFades((list) => list.filter((entry) => entry.key !== fade.key))}
        />
      ))}
    </>
  )
}

function TypeMeshes({
  type,
  materials,
  register,
}: {
  type: PieceType
  materials: Record<Slot, THREE.Material>
  register: (set: Partial<Record<Slot, THREE.InstancedMesh>>) => void
}) {
  const geometry = pieceGeometry(type)
  const refs = useRef<Partial<Record<Slot, THREE.InstancedMesh>>>({})

  useEffect(() => {
    for (const mesh of Object.values(refs.current)) {
      mesh.count = 0
      // Allocates instanceColor up front.
      mesh.setColorAt(0, new THREE.Color('#fbf3e6'))
    }
    register(refs.current)
    // Registered once: the meshes live as long as the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {SLOTS.filter((slot) => geometry[slot]).map((slot) => (
        <instancedMesh
          key={slot}
          ref={(mesh) => {
            if (mesh) refs.current[slot] = mesh
          }}
          args={[geometry[slot], materials[slot], CAPACITY]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

const FADE_TIME = 0.2

function FadingPiece({
  fade,
  materials,
  onDone,
}: {
  fade: Fade
  materials: Record<Slot, THREE.MeshStandardMaterial>
  onDone: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const time = useRef(0)
  const invalidate = useThree((state) => state.invalidate)
  const geometry = pieceGeometry(fade.piece.type)
  const fading = useMemo(() => {
    const clones: Partial<Record<Slot, THREE.MeshStandardMaterial>> = {}
    for (const slot of SLOTS) {
      if (!geometry[slot]) continue
      clones[slot] = materials[slot].clone()
      clones[slot].transparent = true
    }
    return clones
  }, [geometry, materials])

  useEffect(
    () => () => {
      for (const material of Object.values(fading)) material.dispose()
    },
    [fading],
  )

  useFrame((_, dt) => {
    time.current += dt
    const t = Math.min(1, time.current / FADE_TIME)
    const eased = easeOutCubic(t)
    if (group.current) {
      group.current.position.y = eased * 0.22
      group.current.scale.setScalar(1 - eased * 0.35)
    }
    for (const material of Object.values(fading)) material.opacity = 1 - t
    if (t >= 1) onDone()
    else invalidate()
  })

  return (
    <group ref={group} position={[fade.x, 0, fade.z]} rotation={[0, toRad(fade.rotation), 0]}>
      {SLOTS.filter((slot) => geometry[slot]).map((slot) => (
        <mesh key={slot} geometry={geometry[slot]} material={fading[slot]} />
      ))}
    </group>
  )
}

/** Hull outline around the selected piece. */
export function SelectionOutline() {
  const selected = useGame((state) => state.selectedPieceId)
  const type = useGame(
    (state) => state.pieces.find((piece) => piece.id === state.selectedPieceId)?.type,
  )
  const dragging = useGame((state) => state.drag?.pieceId === state.selectedPieceId)
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!selected || !group.current) return
    const a = pieceAnim(selected)
    if (!a) return
    group.current.position.set(a.x, a.y, a.z)
    group.current.rotation.y = toRad(a.rotation)
  })

  if (!selected || !type || dragging) return null
  const geometry = pieceGeometry(type)
  return (
    <group ref={group}>
      {SLOTS.filter((slot) => geometry[slot]).map((slot) => (
        <mesh key={slot} geometry={geometry[slot]} material={outlineMaterial} />
      ))}
    </group>
  )
}
