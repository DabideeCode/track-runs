import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '@/game/store'
import type { Setting } from '@/game/types'
import { Builder, colors, SLOTS, type Merged, type Slot } from './builder'
import { prepareTexture, sharedMaterials, type TextureSet } from './materials'

const SHADOW_SIZE = 2048

interface Mood {
  background: string
  sun: string
  sunIntensity: number
  ambient: string
  ambientIntensity: number
  sky: string
  bounce: string
  hemiIntensity: number
  wall: string
}

const MOODS: Record<Setting, Mood> = {
  // Cool daylight from a window.
  bedroom: {
    background: '#c9d3d3',
    sun: '#e4edf5',
    sunIntensity: 2.15,
    ambient: '#d8e2ea',
    ambientIntensity: 0.62,
    sky: '#dbe6ee',
    bounce: '#c9a77e',
    hemiIntensity: 0.5,
    wall: '#cfd8d3',
  },
  // Warm evening kitchen light.
  kitchen: {
    background: '#e0c6a2',
    sun: '#ffd6a0',
    sunIntensity: 2.45,
    ambient: '#ffe2bd',
    ambientIntensity: 0.6,
    sky: '#ffe9cc',
    bounce: '#b98a5c',
    hemiIntensity: 0.48,
    wall: '#e7d3b4',
  },
}

/** Crossfade rate: well inside the one second AC-2.2 allows. */
const BLEND_RATE = 7

const bedroomProps = (): Merged => {
  const b = new Builder()
  // A chair in the north-west: its legs alone tower over the train.
  for (const [x, z] of [
    [-13.4, -13.4],
    [-10.2, -13.4],
    [-13.4, -10.2],
    [-10.2, -10.2],
  ]) {
    b.peg(0.32, 6.4, [x, 0, z], 'wood', colors.honey)
  }
  b.box([4.2, 0.45, 4.2], [-11.8, 6.5, -11.8], 'wood', colors.honey, 0.12)
  // Toy crate in the north-east.
  b.box([5, 3, 4], [12, 1.5, -11.5], 'paint', colors.dusty, 0.12)
  b.box([5.2, 0.32, 4.2], [12, 3.1, -11.5], 'wood', colors.maple, 0.1)
  // A stack of picture books to the south-west.
  b.box([4, 0.42, 3], [-12, 0.21, 11.5], 'paint', colors.terracotta, 0.06)
  b.box([3.6, 0.36, 2.8], [-12.1, 0.6, 11.4], 'paint', colors.sage, 0.06)
  b.box([3.3, 0.34, 2.5], [-11.9, 0.95, 11.6], 'paint', colors.mustard, 0.06, [0, 0.14, 0])
  // A rubber ball to the south-east.
  b.sphere(1.45, [12, 1.45, 12], 'plastic', colors.terracotta)
  return b.build()
}

const kitchenProps = (): Merged => {
  const b = new Builder()
  // Fruit bowl.
  b.lathe(
    [
      [0, 0],
      [1.25, 0],
      [1.45, 0.08],
      [2.55, 1.15],
      [2.72, 1.3],
      [2.6, 1.36],
      [2.3, 1.2],
      [1.3, 0.34],
      [0, 0.28],
    ],
    [-12, 0, -11.5],
    'paint',
    colors.cream,
    32,
  )
  b.sphere(0.72, [-12.6, 1.05, -11.2], 'paint', colors.rust)
  b.sphere(0.68, [-11.2, 1.0, -11.9], 'paint', colors.mustard)
  b.sphere(0.65, [-11.9, 1.05, -10.5], 'paint', colors.sage)
  b.sphere(0.62, [-12.3, 1.75, -11.7], 'paint', colors.terracotta)
  // Mug.
  b.lathe(
    [
      [0, 0],
      [1.0, 0],
      [1.08, 0.08],
      [1.1, 2.2],
      [1.0, 2.26],
      [0.94, 2.2],
      [0.92, 0.3],
      [0, 0.26],
    ],
    [12, 0, -11.5],
    'paint',
    colors.dusty,
    28,
  )
  b.add(
    new THREE.TorusGeometry(0.58, 0.13, 10, 18),
    'paint',
    colors.dusty,
    new THREE.Matrix4().makeTranslation(13.18, 1.15, -11.5),
  )
  // Wooden chopping board with a slice of bread.
  b.box([5.4, 0.26, 3.6], [-11.5, 0.13, 12], 'wood', colors.walnut, 0.1)
  b.box([1.9, 0.3, 1.9], [-11.8, 0.42, 12], 'paint', colors.mustard, 0.14)
  // Salt and pepper.
  b.lathe(
    [
      [0, 0],
      [0.52, 0],
      [0.56, 0.06],
      [0.42, 1.7],
      [0.3, 1.95],
      [0, 2.02],
    ],
    [11, 0, 11.6],
    'paint',
    colors.cream,
    18,
  )
  b.lathe(
    [
      [0, 0],
      [0.52, 0],
      [0.56, 0.06],
      [0.42, 1.7],
      [0.3, 1.95],
      [0, 2.02],
    ],
    [12.7, 0, 12.3],
    'paint',
    colors.ash,
    18,
  )
  return b.build()
}

const PropMeshes = ({
  merged,
  materials,
  groupRef,
  scaleUp,
}: {
  merged: Merged
  materials: Record<Slot, THREE.Material>
  groupRef: React.Ref<THREE.Group>
  scaleUp: boolean
}) => (
  <group ref={groupRef} visible={scaleUp}>
    {SLOTS.filter((slot) => merged[slot]).map((slot) => (
      <mesh
        key={slot}
        geometry={merged[slot]}
        material={materials[slot]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    ))}
  </group>
)

/** Ground surface, room, props and lights for both settings, crossfading between them. */
export function SettingScene({ textures }: { textures: TextureSet }) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const lowQuality = useGame((state) => state.lowQuality)
  // The JSX below only sets starting values: after that the frame loop blends everything.
  const [initial] = useState(() => useGame.getState().setting)

  const sun = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const kitchenGround = useRef<THREE.Mesh>(null)
  const bedroomGroup = useRef<THREE.Group>(null)
  const kitchenGroup = useRef<THREE.Group>(null)
  const blend = useRef(initial === 'kitchen' ? 1 : 0)

  const materials = sharedMaterials(textures)
  const bedroom = useMemo(bedroomProps, [])
  const kitchen = useMemo(kitchenProps, [])

  const ground = useMemo(() => {
    const floorboards = prepareTexture(textures.floorboards.clone(), 9)
    const tabletop = prepareTexture(textures.tabletop.clone(), 6)
    const rug = prepareTexture(textures.rug, 1)
    return {
      floor: new THREE.MeshStandardMaterial({ map: floorboards, roughness: 0.74, color: '#fbf3e6' }),
      table: new THREE.MeshStandardMaterial({
        map: tabletop,
        roughness: 0.7,
        color: '#fbf0dd',
        transparent: true,
      }),
      rug: new THREE.MeshStandardMaterial({
        map: rug,
        color: '#fff1dc',
        roughness: 0.96,
        transparent: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      wall: new THREE.MeshStandardMaterial({ color: '#cfd8d3', roughness: 0.9 }),
      skirting: new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 0.75 }),
    }
  }, [textures])

  const palettes = useMemo(() => {
    const mix = (key: 'background' | 'sun' | 'ambient' | 'sky' | 'bounce' | 'wall') => ({
      bedroom: new THREE.Color(MOODS.bedroom[key]),
      kitchen: new THREE.Color(MOODS.kitchen[key]),
    })
    return {
      background: mix('background'),
      sun: mix('sun'),
      ambient: mix('ambient'),
      sky: mix('sky'),
      bounce: mix('bounce'),
      wall: mix('wall'),
    }
  }, [])

  const background = useMemo(() => new THREE.Color(MOODS[initial].background), [initial])

  const apply = (value: number) => {
    const lerp = (key: keyof typeof palettes, target: THREE.Color) =>
      target.copy(palettes[key].bedroom).lerp(palettes[key].kitchen, value)
    const number = (key: 'sunIntensity' | 'ambientIntensity' | 'hemiIntensity') =>
      THREE.MathUtils.lerp(MOODS.bedroom[key], MOODS.kitchen[key], value)

    if (sun.current) {
      lerp('sun', sun.current.color)
      sun.current.intensity = number('sunIntensity')
    }
    if (ambient.current) {
      lerp('ambient', ambient.current.color)
      ambient.current.intensity = number('ambientIntensity')
    }
    if (hemi.current) {
      lerp('sky', hemi.current.color)
      lerp('bounce', hemi.current.groundColor)
      hemi.current.intensity = number('hemiIntensity')
    }
    if (scene.background instanceof THREE.Color) lerp('background', scene.background)
    if (scene.fog instanceof THREE.Fog) lerp('background', scene.fog.color)

    lerp('wall', ground.wall.color)
    ground.table.opacity = value
    ground.rug.opacity = 1 - value
    if (kitchenGround.current) kitchenGround.current.visible = value > 0.001
    const pop = (group: THREE.Group | null, amount: number) => {
      if (!group) return
      group.visible = amount > 0.01
      group.scale.setScalar(0.92 + 0.08 * amount)
      group.position.y = (amount - 1) * 0.6
    }
    pop(bedroomGroup.current, 1 - value)
    pop(kitchenGroup.current, value)
  }

  useEffect(() => {
    apply(blend.current)
    invalidate()
    // Applied once for the starting setting; the frame loop handles every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, dt) => {
    const goal = useGame.getState().setting === 'kitchen' ? 1 : 0
    const step = goal - blend.current
    if (step === 0) return
    blend.current =
      Math.abs(step) < 0.004 ? goal : blend.current + step * (1 - Math.exp(-BLEND_RATE * dt))
    apply(blend.current)
    invalidate()
  })

  return (
    <>
      <primitive object={background} attach="background" />
      <fog attach="fog" args={[MOODS[initial].background, 55, 120]} />

      <directionalLight
        ref={sun}
        position={[11, 20, 9]}
        intensity={MOODS[initial].sunIntensity}
        color={MOODS[initial].sun}
        castShadow={!lowQuality}
        shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={17}
        shadow-camera-bottom={-17}
        shadow-camera-near={2}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={5}
      />
      <ambientLight
        ref={ambient}
        intensity={MOODS[initial].ambientIntensity}
        color={MOODS[initial].ambient}
      />
      <hemisphereLight
        ref={hemi}
        intensity={MOODS[initial].hemiIntensity}
        args={[MOODS[initial].sky, MOODS[initial].bounce]}
      />

      {/* Bedroom floor, always underneath; the tabletop fades in over it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={ground.floor} receiveShadow>
        <planeGeometry args={[120, 120]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        material={ground.rug}
        receiveShadow
      >
        <planeGeometry args={[16.9, 16.9]} />
      </mesh>
      <mesh
        ref={kitchenGround}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.004, 0]}
        material={ground.table}
        receiveShadow
        renderOrder={0}
        visible={initial === 'kitchen'}
      >
        <planeGeometry args={[44, 44]} />
      </mesh>

      {/* Back walls face inward only, so an orbiting camera sees through them from outside. */}
      <group>
        {(
          [
            [[0, 16, -22], 0],
            [[-22, 16, 0], Math.PI / 2],
            [[22, 16, 0], -Math.PI / 2],
            [[0, 16, 22], Math.PI],
          ] as [[number, number, number], number][]
        ).map(([position, yaw]) => (
          <group key={yaw} position={position} rotation={[0, yaw, 0]}>
            <mesh material={ground.wall}>
              <planeGeometry args={[44, 32]} />
            </mesh>
            <mesh position={[0, -15.2, 0.05]} material={ground.skirting}>
              <planeGeometry args={[44, 1.6]} />
            </mesh>
          </group>
        ))}
      </group>

      <PropMeshes
        merged={bedroom}
        materials={materials}
        groupRef={bedroomGroup}
        scaleUp={initial === 'bedroom'}
      />
      <PropMeshes
        merged={kitchen}
        materials={materials}
        groupRef={kitchenGroup}
        scaleUp={initial === 'kitchen'}
      />
    </>
  )
}
