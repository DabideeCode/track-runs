import { useEffect, useRef, useState } from 'react'
import type { Piece } from '@/game/types'
import { useGameStore } from '@/store/gameStore'
import { DELETE_S } from './anim'
import { PieceView } from './PieceView'

interface Departed {
  piece: Piece
  at: number
}

/** All placed pieces, plus deleted ones lingering for their exit animation. */
export function PiecesLayer() {
  const pieces = useGameStore((s) => s.pieces)
  const prev = useRef<Piece[]>(pieces)
  const [departed, setDeparted] = useState<Departed[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  useEffect(() => {
    const { lastChange } = useGameStore.getState()
    const ids = new Set(pieces.map((p) => p.id))
    const gone = prev.current.filter((p) => !ids.has(p.id))
    prev.current = pieces
    // Undo and loading apply instantly; a delete shrinks away (§7.2).
    if (gone.length === 0 || lastChange.kind !== 'delete') return
    const at = performance.now()
    setDeparted((d) => [...d, ...gone.map((piece) => ({ piece, at }))])
    timers.current.push(
      window.setTimeout(() => setDeparted((d) => d.filter((x) => x.at !== at)), DELETE_S * 1000 + 60),
    )
  }, [pieces])

  return (
    <>
      {pieces.map((p) => (
        <PieceView key={p.id} piece={p} />
      ))}
      {departed.map((d) => (
        <PieceView key={`gone-${d.piece.id}-${d.at}`} piece={d.piece} departedAt={d.at} />
      ))}
    </>
  )
}
