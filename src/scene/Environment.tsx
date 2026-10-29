import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Setting } from '@/game/types'
import { useGameStore } from '@/store/gameStore'
import { cyl, lathe, mergeParts, place, rbox } from './geometry/shared'
import { makePlankTexture, materials, PALETTE } from './materials'

// Lighting moods (AC-2.4): cool daylight in the bedroom, warmer light in the kitchen.
const MOODS: Record<Setting, { sun: string; sunI: number; sky: string; ground: string; hemiI: number; bg: string }> = {
  bedroom: { sun: '#e6eeff', sunI: 2.6, sky: '#dfe8f4', ground: '#b89b7a', hemiI: 1.0, bg: '#d9dde0' },
  kitchen: { sun: '#ffd9a6', sunI: 2.8, sky: '#fbe6c7', ground: '#b98e62', hemiI: 0.95, bg: '#ecdcc2' },
}

/** One directional light with soft shadows plus hemisphere fill; the mood eases over ~0.6 s. */
export function Lights({ lowQuality }: { lowQuality: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const scene = useThree((s) => s.scene)
  const tmp = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const s = sun.current
    if (!s) return
    s.castShadow = !lowQuality
    s.shadow.mapSize.set(2048, 2048)
    s.shadow.camera.left = s.shadow.camera.bottom = -11
    s.shadow.camera.right = s.shadow.camera.top = 11
    s.shadow.camera.near = 1
    s.shadow.camera.far = 50
    s.shadow.bias = -0.0004
    s.shadow.normalBias = 0.02
    s.shadow.radius = 5
    s.shadow.camera.updateProjectionMatrix()
  }, [lowQuality])

  useFrame((_, dt) => {
    const mood = MOODS[useGameStore.getState().setting]
    const k = Math.min(1, dt * 7)
    if (sun.current) {
      sun.current.color.lerp(tmp.set(mood.sun), k)
      sun.current.intensity += (mood.sunI - sun.current.intensity) * k
    }
    if (hemi.current) {
      hemi.current.color.lerp(tmp.set(mood.sky), k)
      hemi.current.groundColor.lerp(tmp.set(mood.ground), k)
      hemi.current.intensity += (mood.hemiI - hemi.current.intensity) * k
    }
    if (scene.background instanceof THREE.Color) scene.background.lerp(tmp.set(mood.bg), k)
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerp(tmp.set(mood.bg), k)
  })

  return (
    <>
      <color attach="background" args={[MOODS.bedroom.bg]} />
      <fog attach="fog" args={[MOODS.bedroom.bg, 34, 70]} />
      <hemisphereLight ref={hemi} args={[MOODS.bedroom.sky, MOODS.bedroom.ground, MOODS.bedroom.hemiI]} />
      <directionalLight ref={sun} position={[8, 11, 7]} intensity={MOODS.bedroom.sunI} color={MOODS.bedroom.sun} />
    </>
  )
}

function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** Flat shape on the ground with UVs normalised to 0–1 across its bounds (texture repeat sets the scale). */
function flatShape(shape: THREE.Shape, y: number) {
  const g = new THREE.ShapeGeometry(shape, 8)
  g.computeBoundingBox()
  const { min, max } = g.boundingBox!
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - min.x) / (max.x - min.x), (pos.getY(i) - min.y) / (max.y - min.y))
  }
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

function rugTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#b9c7cf'
  g.fillRect(0, 0, 512, 512)
  // Soft woven texture.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,250,240' : '90,110,125'},0.06)`
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 1)
  }
  g.strokeStyle = 'rgba(244,236,223,0.85)'
  g.lineWidth = 7
  g.strokeRect(14, 14, 484, 484)
  g.strokeStyle = 'rgba(196,112,79,0.45)'
  g.lineWidth = 3
  g.strokeRect(28, 28, 456, 456)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function clothTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f3ead8'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(143,165,128,0.35)'
  for (let i = 0; i < 8; i++) {
    g.fillRect(i * 32, 0, 16, 256)
    g.fillRect(0, i * 32, 256, 16)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4.5, 4.5)
  return tex
}

function useBedroom() {
  return useMemo(() => {
    const floor = new THREE.MeshStandardMaterial({ map: makePlankTexture(5, '#c99a64', '#7d532d', 8, 13), roughness: 0.78 })
    const rug = new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 })
    // Props sit outside the grid (|x| or |z| > 8.5) so they never occupy tiles (AC-2.4).
    const props = mergeParts([
      // Bed leg and a slice of the bed frame in the corner.
      [rbox(1.3, 4.2, 1.3, 0.12, { x: -12.5, y: 2.1, z: -11 }), materials.walnut()],
      [rbox(9, 0.9, 1.4, 0.12, { x: -12.5 + 4.5, y: 3.2, z: -11.6 }), materials.walnut()],
      // A toy crate.
      [rbox(3, 2, 2.4, 0.12, { x: 12.2, y: 1, z: -5.5, ry: 0.25 }), materials.honey()],
      [rbox(3.1, 0.25, 2.5, 0.08, { x: 12.2, y: 2.05, z: -5.5, ry: 0.25 }), materials.paint(PALETTE.dusty)],
      // A stack of picture books.
      [rbox(2.6, 0.32, 3.2, 0.05, { x: -11.8, y: 0.16, z: 7, ry: -0.2 }), materials.paint(PALETTE.terracotta)],
      [rbox(2.3, 0.28, 2.9, 0.05, { x: -11.7, y: 0.46, z: 7.1, ry: 0.05 }), materials.paint(PALETTE.sage)],
      [rbox(2.4, 0.26, 3, 0.05, { x: -11.9, y: 0.73, z: 6.9, ry: -0.35 }), materials.paint(PALETTE.mustard)],
      // A rubber ball by the rug.
      [place(new THREE.SphereGeometry(0.75, 28, 20), { x: 10.5, y: 0.75, z: 9.5 }), materials.plastic('#d98c6a')],
    ])
    return {
      floor: flatShape(roundedRect(140, 140, 1), 0),
      floorMat: floor,
      rug: flatShape(roundedRect(18.6, 18.6, 0.9), 0.003),
      rugMat: rug,
      props,
    }
  }, [])
}

function useKitchen() {
  return useMemo(() => {
    const table = new THREE.MeshStandardMaterial({ map: makePlankTexture(9, '#e1c79c', '#a07d55', 5, 6), roughness: 0.7 })
    const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(), roughness: 1 })
    const bowl = lathe(
      [
        [0.001, 0],
        [1.0, 0],
        [1.5, 0.35],
        [1.75, 0.9],
        [1.68, 0.92],
        [1.42, 0.38],
        [0.001, 0.08],
      ],
      36,
      { x: 11.6, z: -6.5 },
    )
    const fruit = (x: number, z: number, r: number) => place(new THREE.SphereGeometry(r, 24, 16), { x, y: 0.6 + r * 0.6, z })
    const props = mergeParts([
      [bowl, materials.paint(PALETTE.dusty)],
      [fruit(11.2, -6.2, 0.55), materials.paint('#e39a52')],
      [fruit(12.1, -6.9, 0.5), materials.paint('#e39a52')],
      [fruit(11.7, -5.8, 0.48), materials.paint('#b8c46e')],
      [fruit(11.9, -6.5, 0.45), materials.paint('#c4704f')],
      // A mug of tea.
      [cyl(0.9, 0.85, 2.1, { x: -11.4, y: 1.05, z: -5.5 }, 32), materials.paint(PALETTE.creamLight)],
      [place(new THREE.TorusGeometry(0.55, 0.14, 12, 24), { x: -10.35, y: 1.1, z: -5.5 }), materials.paint(PALETTE.creamLight)],
      [cyl(0.8, 0.8, 0.05, { x: -11.4, y: 1.9, z: -5.5 }, 32), materials.paint('#a8743f')],
      // A wooden spoon and a little salt pot.
      [rbox(0.28, 0.1, 5.2, 0.05, { x: -10.6, y: 0.05, z: 6.5, ry: 0.6 }), materials.honey()],
      [place(new THREE.SphereGeometry(0.55, 20, 14), { x: -12.2, y: 0.12, z: 8.1, s: 1 }), materials.honey()],
      [cyl(0.45, 0.5, 1.1, { x: 10.8, y: 0.55, z: 8.4 }, 24), materials.paint(PALETTE.sage)],
    ])
    return {
      floor: flatShape(roundedRect(48, 36, 2.5), 0),
      floorMat: table,
      rug: flatShape(roundedRect(18.6, 18.6, 0.4), 0.003),
      rugMat: cloth,
      props,
    }
  }, [])
}

/** Ground surface and scale props for the current setting (FR-2). */
export function SettingSurface() {
  const setting = useGameStore((s) => s.setting)
  const bedroom = useBedroom()
  const kitchen = useKitchen()
  const env = setting === 'bedroom' ? bedroom : kitchen
  return (
    <group>
      <mesh geometry={env.floor} material={env.floorMat} receiveShadow />
      <mesh geometry={env.rug} material={env.rugMat} receiveShadow />
      {env.props.map((p, i) => (
        <mesh key={`${setting}-${i}`} geometry={p.geometry} material={p.material} castShadow receiveShadow />
      ))}
    </group>
  )
}
