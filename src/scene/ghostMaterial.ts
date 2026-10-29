import * as THREE from 'three'

// Translucent ghost tint (AC-5.4): sage green for a valid tile, terracotta red for an invalid one.
const make = (color: string) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6, roughness: 0.8, depthWrite: false })

const valid = make('#7fb77e')
const invalid = make('#d0645a')

export const ghostMaterial = (ok: boolean) => (ok ? valid : invalid)
