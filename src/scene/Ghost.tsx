import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pieceCenter } from '@/game/grid'
import { validate } from '@/game/rules'
import { useGame } from '@/game/store'
import type { PieceType, Rotation } from '@/game/types'
import { SLOTS } from './builder'
import { contactBlobTexture, ghostMaterials } from './materials'
import { ghostPose } from './motion'
import { pieceGeometry } from './pieces'

const LIFT = 0.3
const HOVER_LIFT = 0.03
/** Critically damped: settles in about 4.7 / OMEGA seconds. */
const OMEGA = 20
const MAX_TILT = (8 * Math.PI) / 180
const TILT_PER_SPEED = 0.05
const SHAKE_TIME = 0.2
const VANISH_TIME = 0.13

interface GhostView {
  type: PieceType
  rotation: Rotation
  target: { x: number; z: number } | null
  valid: boolean
  lifted: boolean
}

const currentView = (): GhostView | null => {
  const { drag, selectedTool, hoverTile, pieces, toolRotation, mode } = useGame.getState()
  if (mode === 'play') return null
  if (drag) {
    const target = drag.tile
      ? pieceCenter(drag.type, drag.tile.gridX, drag.tile.gridZ)
      : drag.world
    return {
      type: drag.type,
      rotation: drag.rotation,
      target,
      valid: drag.valid,
      lifted: true,
    }
  }
  if (selectedTool && hoverTile) {
    return {
      type: selectedTool,
      rotation: toolRotation,
      target: pieceCenter(selectedTool, hoverTile.gridX, hoverTile.gridZ),
      valid: validate(pieces, { type: selectedTool, ...hoverTile }) === null,
      lifted: false,
    }
  }
  return null
}

export function Ghost() {
  const invalidate = useThree((state) => state.invalidate)
  const group = useRef<THREE.Group>(null)
  const meshes = useRef(new Map<string, THREE.Mesh>())
  const blob = useRef<THREE.Mesh>(null)
  const motion = useRef({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vz: 0,
    rotation: 0,
    rotationGoal: 0,
    tiltX: 0,
    tiltZ: 0,
    scale: 0,
    visibleType: null as PieceType | null,
    /** The ghost has a position of its own: false until it first has somewhere to be. */
    placed: false,
    effectKey: 0,
    effectTime: 0,
    valid: true,
  }).current

  const blobMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: contactBlobTexture(),
        color: '#3f2d1d',
        transparent: true,
        depthWrite: false,
      }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const root = group.current
    if (!root) return
    const { dropEffect, finishDropEffect } = useGame.getState()
    const view = currentView()
    let shake = 0
    let vanishing = 1
    let type = view?.type ?? null
    let valid = view?.valid ?? motion.valid
    let settle = view?.lifted ? LIFT : HOVER_LIFT

    if (dropEffect && !view) {
      if (!motion.placed) {
        // Dropped without ever being shown, such as back on the palette: nothing to play out.
        ghostPose.active = false
        finishDropEffect()
        return
      }
      if (dropEffect.key !== motion.effectKey) {
        motion.effectKey = dropEffect.key
        motion.effectTime = 0
      }
      motion.effectTime += dt
      type = dropEffect.type
      valid = false
      settle = LIFT
      const shakeTime = dropEffect.shake ? SHAKE_TIME : 0
      const t = motion.effectTime
      if (t < shakeTime) {
        shake = Math.sin(t * 62) * 0.075 * (1 - t / shakeTime)
      } else if (dropEffect.pieceId) {
        ghostPose.active = true
        finishDropEffect()
      } else {
        vanishing = Math.max(0, 1 - (t - shakeTime) / VANISH_TIME)
        if (vanishing === 0) finishDropEffect()
      }
    }

    // No type, or a drag whose pointer is off the canvas: hidden, and it reappears at the pointer.
    if (!type || (view && !view.target)) {
      ghostPose.active = false
      root.visible = false
      if (blob.current) blob.current.visible = false
      motion.visibleType = type
      motion.placed = false
      return
    }

    if (motion.visibleType !== type) motion.placed = false
    motion.visibleType = type
    if (!motion.placed && view?.target) {
      motion.placed = true
      motion.x = view.target.x
      motion.z = view.target.z
      motion.vx = motion.vz = 0
      motion.y = view.lifted ? 0 : HOVER_LIFT
      motion.scale = 0
      motion.tiltX = motion.tiltZ = 0
      motion.rotation = motion.rotationGoal = view.rotation
    }

    // Damped spring toward the snapped tile.
    if (view?.target) {
      const ax = OMEGA * OMEGA * (view.target.x - motion.x) - 2 * OMEGA * motion.vx
      const az = OMEGA * OMEGA * (view.target.z - motion.z) - 2 * OMEGA * motion.vz
      motion.vx += ax * dt
      motion.vz += az * dt
      motion.x += motion.vx * dt
      motion.z += motion.vz * dt
    } else {
      motion.vx *= 1 - Math.min(1, dt * 12)
      motion.vz *= 1 - Math.min(1, dt * 12)
    }

    // Reaches the lift height within 150 ms.
    motion.y += (settle - motion.y) * (1 - Math.exp(-28 * dt))

    if (view) {
      const goal = view.rotation
      const delta = ((goal - motion.rotationGoal + 360) % 360)
      if (delta !== 0) motion.rotationGoal += delta
      motion.rotation += (motion.rotationGoal - motion.rotation) * (1 - Math.exp(-26 * dt))
    }

    const tiltGoalX = THREE.MathUtils.clamp(motion.vz * TILT_PER_SPEED, -MAX_TILT, MAX_TILT)
    const tiltGoalZ = THREE.MathUtils.clamp(-motion.vx * TILT_PER_SPEED, -MAX_TILT, MAX_TILT)
    motion.tiltX += (tiltGoalX - motion.tiltX) * (1 - Math.exp(-18 * dt))
    motion.tiltZ += (tiltGoalZ - motion.tiltZ) * (1 - Math.exp(-18 * dt))

    motion.scale += (1 - motion.scale) * (1 - Math.exp(-30 * dt))
    motion.valid = valid

    const geometry = pieceGeometry(type)
    for (const slot of SLOTS) {
      const mesh = meshes.current.get(slot)
      if (!mesh) continue
      const part = geometry[slot]
      mesh.visible = !!part
      if (part) {
        mesh.geometry = part
        mesh.material = valid ? ghostMaterials.valid : ghostMaterials.invalid
      }
    }

    root.visible = true
    root.position.set(motion.x + shake, motion.y, motion.z)
    // XZY applies the yaw first, so the tilt stays in world axes whichever way the piece faces.
    root.rotation.set(motion.tiltX, (-motion.rotation * Math.PI) / 180, motion.tiltZ, 'XZY')
    root.scale.setScalar(motion.scale * vanishing)

    ghostPose.active = true
    ghostPose.x = motion.x
    ghostPose.y = motion.y
    ghostPose.z = motion.z
    ghostPose.rotation = motion.rotation

    if (blob.current) {
      // The shadow softens and spreads as the piece rises.
      const rise = motion.y / LIFT
      const size = 1.1 + rise * 0.55
      blob.current.position.set(motion.x, 0.012, motion.z)
      blob.current.scale.set(size, size, 1)
      blob.current.visible = root.visible
      blobMaterial.opacity = (0.34 - rise * 0.14) * vanishing
    }

    invalidate()
  })

  return (
    <>
      <group ref={group} visible={false}>
        {SLOTS.map((slot) => (
          <mesh
            key={slot}
            ref={(mesh) => {
              if (mesh) meshes.current.set(slot, mesh)
            }}
            visible={false}
            renderOrder={3}
          />
        ))}
      </group>
      <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <primitive object={blobMaterial} attach="material" />
      </mesh>
    </>
  )
}
