import { Outlines } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CATALOGUE } from '@/game/catalogue'
import { pieceCenter } from '@/game/grid'
import type { Piece, Rotation } from '@/game/types'
import { useGameStore } from '@/store/gameStore'
import {
  HOVER_LIFT,
  LIFT,
  MAX_TILT,
  ROTATE_S,
  SHAKE_S,
  dropOffset,
  easeOutCubic,
  fadeOut,
  shakeOffset,
  springStep,
} from './anim'
import { BlobShadow } from './BlobShadow'
import { getPieceParts } from './geometry'
import { ghostMaterial } from './ghostMaterial'
import { beginPieceDrag, clickPlace } from './interaction'
import { clientToTile, setCanvasCursor } from './pointer'

const yawOf = (r: Rotation) => (-r * Math.PI) / 180
const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))

interface Props {
  piece: Piece
  /** Set while the piece is animating out after a delete. */
  departedAt?: number
}

/** One placed piece with its tactile animation (§7.2): hover, drag, drop, rotate, delete. */
export const PieceView = memo(function PieceView({ piece, departedAt }: Props) {
  const parts = getPieceParts(piece.type)
  const selected = useGameStore((s) => s.selectedPieceId === piece.id && !departedAt)
  const [hovered, setHovered] = useState(false)
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const meshes = useRef<THREE.Mesh[]>([])
  const lift = useRef(0)

  const anim = useMemo(() => {
    const s = useGameStore.getState()
    const c = pieceCenter(piece)
    const justPlaced = s.lastChange.kind === 'place' && s.lastChange.id === piece.id
    return {
      x: c.x,
      z: c.z,
      vx: 0,
      vz: 0,
      lift: 0,
      vLift: 0,
      /** performance.now() when the current landing started, or -1. */
      dropAt: justPlaced ? performance.now() : -1,
      dropFrom: LIFT,
      yaw: yawOf(piece.rotation),
      yawFrom: yawOf(piece.rotation),
      yawTo: yawOf(piece.rotation),
      yawAt: -1,
      rotation: piece.rotation,
      carried: false,
      changeN: s.lastChange.n,
      /** Settled with nothing to animate; frames are skipped until something relevant changes. */
      rest: false,
      restPiece: null as Piece | null,
      restHover: false,
    }
    // Initial values only; later changes animate in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    const g = outer.current
    const yawGroup = inner.current
    if (!g || !yawGroup) return
    const dt = Math.min(delta, 0.05)
    const now = performance.now()
    const s = useGameStore.getState()
    const drag = s.drag
    const dragging = !!drag && drag.active && drag.pieceId === piece.id && !departedAt
    const rejected = s.rejected?.pieceId === piece.id ? s.rejected : null
    const rejectAge = rejected ? (now - rejected.at) / 1000 : Infinity
    const shaking = rejectAge < SHAKE_S
    const carried = dragging || shaking
    const hoverLifted = hovered && s.mode === 'build' && !drag

    // Idle fast path: a settled piece costs nothing per frame (keeps 100 pieces cheap, §7.3).
    if (
      anim.rest &&
      !carried &&
      !departedAt &&
      s.lastChange.n === anim.changeN &&
      anim.restPiece === piece &&
      anim.restHover === hoverLifted
    ) {
      return
    }

    // Undo/redo and loading may apply instantly (§7.2); everything else animates.
    const snap = s.lastChange.n !== anim.changeN && (s.lastChange.kind === 'undo' || s.lastChange.kind === 'load')
    anim.changeN = s.lastChange.n

    // Target: the drag tile while carried, the refused tile while shaking, else home.
    const tile = dragging && drag.tile ? drag.tile : shaking && rejected?.tile ? rejected.tile : null
    const home = pieceCenter(piece)
    const extra = (CATALOGUE[piece.type].size - 1) / 2
    const tx = tile ? tile.gx - 7.5 + extra : home.x
    const tz = tile ? tile.gz - 7.5 + extra : home.z
    if (snap) {
      anim.x = tx
      anim.z = tz
      anim.vx = anim.vz = 0
    }
    ;[anim.x, anim.vx] = springStep(anim.x, anim.vx, tx, dt)
    ;[anim.z, anim.vz] = springStep(anim.z, anim.vz, tz, dt)

    // Height: carried pieces rise 0.3 tiles within ~150 ms; a drop lands with a small settle.
    if (anim.carried && !carried) {
      anim.dropAt = now
      anim.dropFrom = anim.lift
    }
    anim.carried = carried
    let y: number
    if (carried) {
      ;[anim.lift, anim.vLift] = springStep(anim.lift, anim.vLift, LIFT, dt, 40)
      y = anim.lift
    } else if (anim.dropAt >= 0) {
      const t = (now - anim.dropAt) / 1000
      y = dropOffset(t) * (anim.dropFrom / LIFT)
      if (t >= 0.3) {
        anim.dropAt = -1
        anim.lift = anim.vLift = 0
      }
    } else {
      const target = hoverLifted ? HOVER_LIFT : 0
      ;[anim.lift, anim.vLift] = springStep(anim.lift, anim.vLift, target, dt)
      y = anim.lift
    }

    // Rotation: ease-out over 150 ms, turning clockwise.
    const wanted = dragging ? drag.rotation : piece.rotation
    if (wanted !== anim.rotation) {
      const steps = ((wanted - anim.rotation + 360) % 360) / 90
      anim.yawFrom = anim.yaw
      anim.yawTo -= steps * (Math.PI / 2)
      anim.rotation = wanted
      anim.yawAt = snap ? -1 : now
      if (snap) anim.yaw = anim.yawTo
    }
    if (anim.yawAt >= 0) {
      const p = (now - anim.yawAt) / 1000 / ROTATE_S
      anim.yaw = anim.yawFrom + (anim.yawTo - anim.yawFrom) * easeOutCubic(p)
      if (p >= 1) anim.yawAt = -1
    }

    let scale = 1
    let x = anim.x
    if (shaking) x += shakeOffset(rejectAge)
    if (departedAt) {
      const f = fadeOut((now - departedAt) / 1000)
      scale = f.scale * f.opacity + 0.001
      y += f.lift
    }

    g.position.set(x, y, anim.z)
    // Lean up to 8° toward the direction of travel while carried.
    g.rotation.set(clamp(anim.vz * 0.03, MAX_TILT), 0, clamp(-anim.vx * 0.03, MAX_TILT))
    g.scale.setScalar(scale)
    yawGroup.rotation.y = anim.yaw
    lift.current = carried || anim.dropAt >= 0 ? y : 0

    anim.restPiece = piece
    anim.restHover = hoverLifted
    anim.rest =
      !carried &&
      !departedAt &&
      anim.dropAt < 0 &&
      anim.yawAt < 0 &&
      Math.abs(anim.x - tx) < 1e-4 &&
      Math.abs(anim.z - tz) < 1e-4 &&
      Math.abs(anim.vx) + Math.abs(anim.vz) + Math.abs(anim.vLift) < 1e-3 &&
      Math.abs(anim.lift - (hoverLifted ? HOVER_LIFT : 0)) < 1e-4

    const ghost = carried ? ghostMaterial(dragging ? drag.valid : false) : null
    meshes.current.forEach((m, i) => {
      const mat = ghost ?? parts[i].material
      if (m.material !== mat) m.material = mat
      m.castShadow = !ghost
    })
  })

  const interactive = !departedAt
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const s = useGameStore.getState()
    if (e.button !== 0 || s.mode !== 'build' || s.selectedTool) return
    e.stopPropagation()
    beginPieceDrag(piece.id, e.nativeEvent)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const s = useGameStore.getState()
    if (s.selectedTool && e.delta < 5) clickPlace(clientToTile(e.nativeEvent.clientX, e.nativeEvent.clientY))
  }
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (useGameStore.getState().mode !== 'build') return
    setHovered(true)
    setCanvasCursor('pointer')
  }
  const onOut = () => {
    setHovered(false)
    setCanvasCursor('')
  }

  return (
    <group ref={outer}>
      <group
        ref={inner}
        onPointerDown={interactive ? onPointerDown : undefined}
        onClick={interactive ? onClick : undefined}
        onPointerOver={interactive ? onOver : undefined}
        onPointerOut={interactive ? onOut : undefined}
      >
        {parts.map((part, i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) meshes.current[i] = m
            }}
            geometry={part.geometry}
            material={part.material}
            castShadow
            receiveShadow
          >
            {selected && <Outlines thickness={2.5} screenspace color="#5d7895" />}
          </mesh>
        ))}
      </group>
      <BlobShadow lift={lift} size={CATALOGUE[piece.type].size} />
    </group>
  )
})
