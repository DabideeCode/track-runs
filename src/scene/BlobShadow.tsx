import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

let texture: THREE.CanvasTexture | null = null
function blobTexture() {
  if (texture) return texture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(60,40,25,0.55)')
  grad.addColorStop(0.55, 'rgba(60,40,25,0.22)')
  grad.addColorStop(1, 'rgba(60,40,25,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  texture = new THREE.CanvasTexture(c)
  return texture
}

const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/**
 * Soft contact shadow under a lifted piece: it spreads and fades as the piece rises (§7.2 Grab).
 * `lift` is read every frame, so the parent can animate it without re-rendering.
 */
export function BlobShadow({ lift, size = 1 }: { lift: { current: number }; size?: number }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    const h = Math.max(0, lift.current)
    const visible = h > 0.004
    if (!mesh.current || !material.current) return
    mesh.current.visible = visible
    if (!visible) return
    const spread = size * (0.9 + h * 2.2)
    mesh.current.scale.set(spread, 1, spread)
    material.current.opacity = Math.max(0.12, 0.7 - h * 1.4)
  })
  return (
    <mesh ref={mesh} geometry={geometry} position={[0, 0.004, 0]} renderOrder={1}>
      <meshBasicMaterial ref={material} map={blobTexture()} transparent depthWrite={false} />
    </mesh>
  )
}
