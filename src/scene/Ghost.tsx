import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { CATALOGUE } from '@/game/catalogue'
import { validatePlacement } from '@/game/rules'
import type { PieceType, Rotation, Tile } from '@/game/types'
import { useGameStore } from '@/store/gameStore'
import { LIFT, MAX_TILT, ROTATE_S, SHAKE_S, easeOutCubic, shakeOffset, springStep } from './anim'
import { BlobShadow } from './BlobShadow'
import { getPieceParts } from './geometry'
import { ghostMaterial } from './ghostMaterial'
import { getToolRotation } from './interaction'

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))

interface GhostTarget {
  type: PieceType
  tile: Tile
  rotation: Rotation
  valid: boolean
  lifted: boolean
  shakeAge: number
}

/** What the ghost should show this frame, if anything (AC-5.1, AC-5.2, AC-5.4). */
function currentTarget(now: number): GhostTarget | null {
  const s = useGameStore.getState()
  if (s.mode !== 'build') return null
  const r = s.rejected
  if (r && r.source === 'palette' && r.tile && now - r.at < SHAKE_S * 1000) {
    return { type: r.type, tile: r.tile, rotation: r.rotation, valid: false, lifted: true, shakeAge: (now - r.at) / 1000 }
  }
  const d = s.drag
  if (d && d.source === 'palette') {
    if (!d.active || !d.tile) return null
    return { type: d.type, tile: d.tile, rotation: d.rotation, valid: d.valid, lifted: true, shakeAge: -1 }
  }
  if (!d && s.selectedTool && s.hoverTile) {
    const t = s.hoverTile
    const valid = validatePlacement(s.pieces, { type: s.selectedTool, gx: t.gx, gz: t.gz }) === null
    return { type: s.selectedTool, tile: t, rotation: getToolRotation(), valid, lifted: false, shakeAge: -1 }
  }
  return null
}

/** One ghost per piece type, mounted on demand; follows the snapped tile with a spring. */
export function Ghost() {
  const tool = useGameStore((s) =>
    s.drag?.source === 'palette' ? s.drag.type : s.rejected?.source === 'palette' ? s.rejected.type : s.selectedTool,
  )
  if (!tool) return null
  return <GhostOf key={tool} type={tool} />
}

function GhostOf({ type }: { type: PieceType }) {
  const parts = getPieceParts(type)
  const group = useRef<THREE.Group>(null)
  const yawGroup = useRef<THREE.Group>(null)
  const meshes = useRef<THREE.Mesh[]>([])
  const lift = useRef(0)
  const st = useRef({ x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, shown: false, yaw: 0, yawFrom: 0, yawTo: 0, yawAt: -1, rot: 0 })

  useFrame((_, delta) => {
    const g = group.current
    if (!g || !yawGroup.current) return
    const now = performance.now()
    const dt = Math.min(delta, 0.05)
    const t = currentTarget(now)
    const a = st.current
    if (!t || t.type !== type) {
      g.visible = false
      a.shown = false
      lift.current = 0
      return
    }
    const extra = (CATALOGUE[type].size - 1) / 2
    const tx = t.tile.gx - 7.5 + extra
    const tz = t.tile.gz - 7.5 + extra
    if (!a.shown) {
      // Appear at the pointer's tile, rising from the ground.
      Object.assign(a, { x: tx, z: tz, vx: 0, vz: 0, y: 0, vy: 0, shown: true })
      a.rot = t.rotation
      a.yaw = a.yawTo = (-t.rotation * Math.PI) / 180
      a.yawAt = -1
    }
    ;[a.x, a.vx] = springStep(a.x, a.vx, tx, dt)
    ;[a.z, a.vz] = springStep(a.z, a.vz, tz, dt)
    ;[a.y, a.vy] = springStep(a.y, a.vy, t.lifted ? LIFT : 0.02, dt, 40)
    if (t.rotation !== a.rot) {
      const steps = ((t.rotation - a.rot + 360) % 360) / 90
      a.yawFrom = a.yaw
      a.yawTo -= steps * (Math.PI / 2)
      a.yawAt = now
      a.rot = t.rotation
    }
    if (a.yawAt >= 0) {
      const p = (now - a.yawAt) / 1000 / ROTATE_S
      a.yaw = a.yawFrom + (a.yawTo - a.yawFrom) * easeOutCubic(p)
      if (p >= 1) a.yawAt = -1
    }
    g.visible = true
    g.position.set(a.x + (t.shakeAge >= 0 ? shakeOffset(t.shakeAge) : 0), a.y, a.z)
    g.rotation.set(clamp(a.vz * 0.03, MAX_TILT), 0, clamp(-a.vx * 0.03, MAX_TILT))
    yawGroup.current.rotation.y = a.yaw
    lift.current = a.y
    const mat = ghostMaterial(t.valid)
    for (const m of meshes.current) if (m && m.material !== mat) m.material = mat
  })

  return (
    <group ref={group} visible={false}>
      <group ref={yawGroup}>
        {parts.map((p, i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) meshes.current[i] = m
            }}
            geometry={p.geometry}
            material={ghostMaterial(true)}
            renderOrder={2}
          />
        ))}
      </group>
      <BlobShadow lift={lift} size={CATALOGUE[type].size} />
    </group>
  )
}
