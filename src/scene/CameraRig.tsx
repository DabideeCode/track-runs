import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GRID_HALF } from '@/game/grid'
import { DEFAULT_POSITION, DEFAULT_TARGET } from './cameraDefaults'

const DEG = Math.PI / 180

const RESET_TIME = 0.5

let resetRequest: (() => void) | null = null

/** Glides the camera back to its default view. */
export const resetCamera = () => resetRequest?.()

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export function CameraRig() {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const glide = useRef<{
    t: number
    fromPosition: THREE.Vector3
    fromTarget: THREE.Vector3
  } | null>(null)

  useEffect(() => {
    resetRequest = () => {
      const orbit = controls.current
      if (!orbit) return
      glide.current = {
        t: 0,
        fromPosition: camera.position.clone(),
        fromTarget: orbit.target.clone(),
      }
      invalidate()
    }
    return () => {
      resetRequest = null
    }
  }, [camera, invalidate])

  useFrame((_, dt) => {
    const state = glide.current
    const orbit = controls.current
    if (!state || !orbit) return
    state.t = Math.min(1, state.t + dt / RESET_TIME)
    const eased = easeInOut(state.t)
    camera.position.lerpVectors(state.fromPosition, DEFAULT_POSITION, eased)
    orbit.target.lerpVectors(state.fromTarget, DEFAULT_TARGET, eased)
    orbit.update()
    if (state.t >= 1) glide.current = null
    invalidate()
  })

  /** AC-3.4: the target stays within the grid area, on the ground. */
  const clampTarget = () => {
    const orbit = controls.current
    if (!orbit) return
    const { target } = orbit
    const x = THREE.MathUtils.clamp(target.x, -GRID_HALF, GRID_HALF)
    const z = THREE.MathUtils.clamp(target.z, -GRID_HALF, GRID_HALF)
    const dx = x - target.x
    const dz = z - target.z
    if (dx === 0 && dz === 0 && target.y === 0) return
    target.set(x, 0, z)
    camera.position.x += dx
    camera.position.z += dz
  }

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={DEFAULT_TARGET.toArray()}
      enableDamping
      dampingFactor={0.14}
      minPolarAngle={20 * DEG}
      maxPolarAngle={80 * DEG}
      minDistance={4}
      maxDistance={30}
      screenSpacePanning={false}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      mouseButtons={{
        LEFT: undefined as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      onChange={clampTarget}
    />
  )
}
