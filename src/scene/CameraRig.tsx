import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { useGameStore } from '@/store/gameStore'
import { easeOutCubic } from './anim'

export const DEFAULT_CAMERA = new THREE.Vector3(0, 9.6, 12.2)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)
const deg = (d: number) => (d * Math.PI) / 180
const BOUND = 8
const RESET_S = 0.45

/**
 * Right-drag orbits, middle-drag pans, wheel zooms; left is reserved for pieces (AC-3.3).
 * 20°–80° from vertical, 4–30 units from a target kept over the grid (AC-3.4).
 */
export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const resetN = useGameStore((s) => s.cameraResetN)
  const reset = useRef<{ at: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const c = controls.current
    if (!c || resetN === 0) return
    reset.current = { at: performance.now(), fromPos: camera.position.clone(), fromTarget: c.target.clone() }
  }, [resetN, camera])

  useFrame(() => {
    const c = controls.current
    const r = reset.current
    if (!c || !r) return
    const p = Math.min(1, (performance.now() - r.at) / 1000 / RESET_S)
    const e = easeOutCubic(p)
    camera.position.lerpVectors(r.fromPos, DEFAULT_CAMERA, e)
    c.target.lerpVectors(r.fromTarget, DEFAULT_TARGET, e)
    c.update()
    if (p >= 1) reset.current = null
  })

  const clampTarget = () => {
    const c = controls.current
    if (!c) return
    const t = c.target
    const cx = THREE.MathUtils.clamp(t.x, -BOUND, BOUND)
    const cz = THREE.MathUtils.clamp(t.z, -BOUND, BOUND)
    const dx = cx - t.x
    const dy = -t.y
    const dz = cz - t.z
    if (dx || dy || dz) {
      t.set(cx, 0, cz)
      camera.position.x += dx
      camera.position.y += dy
      camera.position.z += dz
    }
  }

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
      minPolarAngle={deg(20)}
      maxPolarAngle={deg(80)}
      minDistance={4}
      maxDistance={30}
      screenSpacePanning={false}
      zoomSpeed={0.9}
      rotateSpeed={0.7}
      onChange={clampTarget}
    />
  )
}
