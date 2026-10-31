import * as THREE from 'three'
import { CATALOG, DECORATION_TYPES, TRACK_TYPES } from '@/game/catalog'
import { useGame } from '@/game/store'
import type { PieceType } from '@/game/types'
import { SLOTS, type Slot } from './builder'
import { pieceGeometry } from './pieces'

const SIZE = 112

/** Renders each palette item once, so its preview always matches the real model. */
export const renderPalettePreviews = (materials: Record<Slot, THREE.Material>) => {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
  } catch {
    return
  }
  renderer.setSize(SIZE, SIZE)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.NeutralToneMapping

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight('#fff1dd', 1.3))
  const sun = new THREE.DirectionalLight('#fff6e8', 2.5)
  sun.position.set(2, 4, 3)
  scene.add(sun)

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 40)
  const previews: Partial<Record<PieceType, string>> = {}

  for (const type of [...TRACK_TYPES, ...DECORATION_TYPES]) {
    const geometry = pieceGeometry(type)
    const group = new THREE.Group()
    for (const slot of SLOTS) {
      const part = geometry[slot]
      if (part) group.add(new THREE.Mesh(part, materials[slot]))
    }
    group.rotation.y = -0.62
    scene.add(group)

    const { size, pick } = { ...CATALOG[type] }
    const height = pick[2]
    const reach = Math.max(size * 0.72, height * 0.72, 0.5)
    camera.position.set(0, height / 2 + reach * 2.3, reach * 3.1)
    camera.lookAt(0, height * 0.42, 0)
    renderer.render(scene, camera)
    previews[type] = renderer.domElement.toDataURL('image/png')
    scene.remove(group)
  }

  renderer.dispose()
  useGame.getState().setPreviews(previews)
}
