/**
 * Derived data, memoised on the identity of the `pieces` array (design §12).
 *
 * Store actions replace `pieces` only when it changes, so each derivation is
 * computed once per change. A WeakMap per selector keeps results for any
 * number of stores (tests create many) without leaking old arrays.
 */
import { getConnections, openEnds, type Connection, type OpenEnd } from '@/domain/connections';
import { buildOccupancy, type OccupancyIndex } from '@/domain/occupancy';
import type { Piece } from '@/domain/types';

type WithPieces = { pieces: readonly Piece[] };

function memoByPieces<T>(derive: (pieces: readonly Piece[]) => T): (state: WithPieces) => T {
  const cache = new WeakMap<readonly Piece[], T>();
  return (state) => {
    const pieces = state.pieces;
    if (cache.has(pieces)) return cache.get(pieces) as T;
    const value = derive(pieces);
    cache.set(pieces, value);
    return value;
  };
}

/** Tile key to piece, for every footprint tile. */
export const selectOccupancy: (state: WithPieces) => OccupancyIndex = memoByPieces(buildOccupancy);

/** Connected track pairs, sorted as `getConnections()` returns them (Requirement 39.12). */
export const selectConnections: (state: WithPieces) => Connection[] = memoByPieces(getConnections);

/** Unconnected track connectors, for the open-end markers (Requirement 14.6). */
export const selectOpenEnds: (state: WithPieces) => OpenEnd[] = memoByPieces(openEnds);

/** The station piece, or null. A diorama holds at most one (Requirement 16.9). */
export const selectStation: (state: WithPieces) => Piece | null = memoByPieces(
  (pieces) => pieces.find((p) => p.type === 'station') ?? null,
);

/** True while a station exists; the palette disables the station item (Requirements 10.7, 16.6). */
export const selectHasStation = (state: WithPieces): boolean => selectStation(state) !== null;
