import { isTrack } from '@/domain/catalogue';
import type { DecorationType, PieceType, TrackType } from '@/domain/types';
import { buildDecoration } from './decorations';
import { cachedParts, type PieceParts } from './parts';
import { buildTrack } from './tracks';

export function getPieceParts(type: PieceType): PieceParts {
  return cachedParts(type, () =>
    isTrack(type) ? buildTrack(type as TrackType) : buildDecoration(type as DecorationType),
  );
}
