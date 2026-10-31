import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '@/game/store'
import type { Pose } from '@/game/trackPath'
import { trainRuntime } from '@/game/trainRuntime'
import type { Piece, StartFacing } from '@/game/types'
import { colors, SLOTS, type Merged } from './builder'
import { contactBlobTexture, sharedMaterials, type TextureSet } from './materials'
import { carriageGeometry, locomotiveGeometry } from './pieces'

const SETTLE_RATE = 11

interface VehicleView {
  x: number
  z: number
  yaw: number
}

const shortestAngle = (from: number, to: number) => {
  const delta = (to - from) % (Math.PI * 2)
  return delta > Math.PI ? delta - Math.PI * 2 : delta < -Math.PI ? delta + Math.PI * 2 : delta
}

/** The locomotive and carriages, on the track in Play mode and parked at the station otherwise. */
export function Train({ textures }: { textures: TextureSet }) {
  const materials = sharedMaterials(textures)
  const invalidate = useThree((state) => state.invalidate)
  const groups = useRef<(THREE.Group | null)[]>([null, null, null])
  const root = useRef<THREE.Group>(null)
  const views = useRef<VehicleView[] | null>(null)
  const shown = useRef(0)
  const parked = useRef<{ pieces: Piece[]; facing: StartFacing; poses: Pose[] | null } | null>(null)

  const vehicles = useMemo<Merged[]>(
    () => [
      locomotiveGeometry(),
      carriageGeometry(colors.dusty, colors.terracotta),
      carriageGeometry(colors.sage, colors.mustard),
    ],
    [],
  )

  const blobMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: contactBlobTexture(),
        color: '#3f2d1d',
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { pieces, startFacing, mode, drag } = useGame.getState()
    const playing = mode === 'play'

    let poses: Pose[] | null
    if (playing) {
      poses = trainRuntime.poses(pieces, startFacing)
    } else {
      const cached = parked.current
      if (!cached || cached.pieces !== pieces || cached.facing !== startFacing) {
        parked.current = {
          pieces,
          facing: startFacing,
          poses: trainRuntime.poses(pieces, startFacing),
        }
      }
      poses = parked.current!.poses
    }

    const station = pieces.find((piece) => piece.type === 'station')
    const wanted = poses && !(drag && drag.pieceId === station?.id) ? 1 : 0
    const scaleStep = wanted - shown.current
    if (Math.abs(scaleStep) > 0.002) {
      shown.current += scaleStep * (1 - Math.exp(-16 * dt))
      invalidate()
    } else {
      shown.current = wanted
    }
    if (root.current) root.current.visible = shown.current > 0.01
    for (const group of groups.current) group?.scale.setScalar(shown.current)
    if (!poses) {
      // Gone with its station: a new station starts the train fresh rather than sliding it over.
      if (shown.current === 0) views.current = null
      return
    }

    if (!views.current) views.current = poses.map(({ x, z, yaw }) => ({ x, z, yaw }))

    let settling = false
    poses.forEach((pose, index) => {
      const view = views.current![index]
      if (playing) {
        view.x = pose.x
        view.z = pose.z
        view.yaw = pose.yaw
      } else {
        // Glide back to the station rather than teleporting.
        const k = 1 - Math.exp(-SETTLE_RATE * dt)
        const turn = shortestAngle(view.yaw, pose.yaw)
        view.x += (pose.x - view.x) * k
        view.z += (pose.z - view.z) * k
        view.yaw += turn * k
        if (Math.abs(pose.x - view.x) + Math.abs(pose.z - view.z) + Math.abs(turn) > 0.003) {
          settling = true
        } else {
          view.x = pose.x
          view.z = pose.z
          view.yaw = pose.yaw
        }
      }
      const group = groups.current[index]
      if (group) {
        const speed = trainRuntime.speed()
        const bob = speed > 0 ? Math.sin(state.clock.elapsedTime * 16 + index) * 0.0035 : 0
        group.position.set(view.x, bob, view.z)
        group.rotation.y = view.yaw
      }
    })
    if (settling) invalidate()
  })

  return (
    <group ref={root}>
      {vehicles.map((merged, index) => (
        <group
          key={index}
          ref={(group) => {
            groups.current[index] = group
          }}
        >
          {SLOTS.filter((slot) => merged[slot]).map((slot) => (
            <mesh
              key={slot}
              geometry={merged[slot]}
              material={materials[slot]}
              castShadow
              receiveShadow
            />
          ))}
          <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]} material={blobMaterial} renderOrder={1}>
            <planeGeometry args={[0.5, 1.1]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
