import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { playSound } from '@/audio/soundBus'
import { updateChug } from '@/audio/sfx'
import { createTrain, stepTrain, trainPoses } from '@/game/train'
import { trainRuntime } from '@/game/trainRuntime'
import { useGameStore } from '@/store/gameStore'
import { shouldHandleShortcut } from '@/store/keyboard'
import { getTrainParts, type VehicleKind } from './geometry'

const VEHICLES: VehicleKind[] = ['loco', 'carriageA', 'carriageB']

// Held drive keys for Manual mode (AC-10.7).
const held = { fwd: false, rev: false }

function useDriveKeys() {
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase()
      if (k !== 'w' && k !== 's') return
      if (down && !shouldHandleShortcut(e)) return
      if (k === 'w') held.fwd = down
      else held.rev = down
    }
    const onDown = (e: KeyboardEvent) => set(e, true)
    const onUp = (e: KeyboardEvent) => set(e, false)
    const clear = () => {
      held.fwd = held.rev = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    }
  }, [])
}

const shortestAngle = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** The locomotive and two carriages, parked at the station in Build mode and running in Play mode. */
export function TrainView() {
  const hasStation = useGameStore((s) => s.pieces.some((p) => p.type === 'station'))
  const groups = useRef<(THREE.Group | null)[]>([])
  const smooth = useRef<{ x: number; z: number; h: number }[] | null>(null)
  useDriveKeys()

  useFrame((state, delta) => {
    const s = useGameStore.getState()
    const dt = Math.min(delta, 0.05)
    let sim = s.mode === 'play' ? trainRuntime.sim : null
    let speed = 0
    if (sim) {
      const events = stepTrain(sim, s.pieces, dt, { drive: s.driveMode, ...held })
      for (const e of events) playSound(e)
      speed = Math.abs(sim.v)
    } else {
      sim = createTrain(s.pieces, s.startFacing)
    }
    updateChug(speed, dt)
    if (!sim) return
    const poses = trainPoses(sim, s.pieces)
    // In Build mode, ease into the parked pose (e.g. after Flip direction) instead of snapping.
    const k = s.mode === 'play' ? 1 : Math.min(1, dt * 12)
    if (!smooth.current) smooth.current = poses.map((p) => ({ x: p.x, z: p.z, h: p.heading }))
    poses.forEach((p, i) => {
      const sm = smooth.current![i]
      sm.x += (p.x - sm.x) * k
      sm.z += (p.z - sm.z) * k
      sm.h += shortestAngle(sm.h, p.heading) * k
      const g = groups.current[i]
      if (!g) return
      const bob = speed > 0.05 ? Math.sin(state.clock.elapsedTime * 22 + i * 1.7) * 0.004 * Math.min(1, speed) : 0
      g.position.set(sm.x, bob, sm.z)
      g.rotation.y = sm.h
    })
  })

  if (!hasStation) return null
  return (
    <>
      {VEHICLES.map((kind, i) => (
        <group key={kind} ref={(g) => void (groups.current[i] = g)}>
          {getTrainParts(kind).map((part, j) => (
            <mesh key={j} geometry={part.geometry} material={part.material} castShadow receiveShadow />
          ))}
        </group>
      ))}
    </>
  )
}
