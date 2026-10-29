import { isTrack } from '@/game/catalogue'
import type { DecorationType, PieceType, TrackType } from '@/game/types'
import { decorationParts } from './decorations'
import type { Part } from './shared'
import { trackParts } from './tracks'

export type { Part } from './shared'
export { getTrainParts, type VehicleKind } from './train'

const cache = new Map<PieceType, Part[]>()

/** Shared, merged geometry + material pairs for a piece type at rotation 0 (D28). */
export function getPieceParts(type: PieceType): Part[] {
  let parts = cache.get(type)
  if (!parts) {
    parts = isTrack(type) ? trackParts(type as TrackType) : decorationParts(type as DecorationType)
    cache.set(type, parts)
  }
  return parts
}
