import * as THREE from 'three'
import type { Slot } from './builder'

export const TEXTURE_URLS = {
  wood: '/assets/textures/wood-grain.jpg',
  paint: '/assets/textures/paint-grain.jpg',
  floorboards: '/assets/textures/floorboards.jpg',
  tabletop: '/assets/textures/tabletop.jpg',
  rug: '/assets/textures/rug.jpg',
}

export type TextureSet = Record<keyof typeof TEXTURE_URLS, THREE.Texture>

export const prepareTexture = (texture: THREE.Texture, repeat = 1) => {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

let shared: Record<Slot, THREE.MeshStandardMaterial> | null = null

/** One material per slot, shared by every mesh in the scene. */
export const sharedMaterials = (textures: TextureSet) => {
  if (!shared) {
    shared = {
      wood: new THREE.MeshStandardMaterial({
        map: prepareTexture(textures.wood),
        vertexColors: true,
        roughness: 0.72,
        metalness: 0,
      }),
      paint: new THREE.MeshStandardMaterial({
        map: prepareTexture(textures.paint),
        vertexColors: true,
        roughness: 0.66,
        metalness: 0,
      }),
      plastic: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.34,
        metalness: 0,
      }),
    }
  }
  return shared
}

export const ghostMaterials = {
  valid: new THREE.MeshStandardMaterial({
    color: '#8fc48a',
    emissive: '#3d7a45',
    emissiveIntensity: 0.35,
    roughness: 0.7,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  }),
  invalid: new THREE.MeshStandardMaterial({
    color: '#dd8a7a',
    emissive: '#a33b2c',
    emissiveIntensity: 0.4,
    roughness: 0.7,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  }),
}

/** Inverted hull: pushes back faces out along their normals to draw the selection outline. */
export const outlineMaterial = new THREE.MeshBasicMaterial({
  color: '#f0a83c',
  side: THREE.BackSide,
})
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <beginnormal_vertex>
     vec3 transformed = position + normalize(objectNormal) * 0.028;`,
  )
}

let blobTexture: THREE.CanvasTexture | null = null

/** Radial falloff used for soft contact shadows. */
export const contactBlobTexture = () => {
  if (!blobTexture) {
    const size = 96
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.7)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    blobTexture = new THREE.CanvasTexture(canvas)
  }
  return blobTexture
}
