/**
 * Domain types. The Section 9 types are copied verbatim from `requirement.md`;
 * the rest are shared helper types used by the domain core.
 *
 * This module imports nothing (the domain core is framework-free).
 */

// ---------------------------------------------------------------------------
// Section 9 of requirement.md (verbatim names and types)
// ---------------------------------------------------------------------------

export type TrackType = 'straight' | 'curve' | 'tunnel' | 'station' | 'buffer';
export type DecorationType =
  | 'house' | 'pineTree' | 'roundTree' | 'hill' | 'car' | 'cassette' | 'blocks';
export type PieceType = TrackType | DecorationType;
export type Rotation = 0 | 90 | 180 | 270;

export interface Piece {
  id: string;
  type: PieceType;
  gridX: number; // integer 0 to 15, west to east
  gridZ: number; // integer 0 to 15, north to south
  rotation: Rotation;
}

export interface GameState {
  pieces: Piece[];
  selectedTool: PieceType | null;
  selectedPieceId: string | null;
  mode: 'build' | 'play';
  driveMode: 'auto' | 'manual';
  setting: 'bedroom' | 'kitchen';
  startFacing: 0 | 180;
  dioramaId: string | null;
  dioramaName: string;
  isDirty: boolean;
}

export interface SaveFile {
  version: 1;
  dioramas: Diorama[];
}

export interface Diorama {
  id: string;
  name: string;
  setting: 'bedroom' | 'kitchen';
  startFacing: 0 | 180;
  pieces: Piece[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  thumbnail?: string; // data URL, optional (AC-1.7)
}

// ---------------------------------------------------------------------------
// Additional domain types
// ---------------------------------------------------------------------------

/** Tile edge direction: 0 = N (−Z), 1 = E (+X), 2 = S (+Z), 3 = W (−X). */
export type Dir = 0 | 1 | 2 | 3;

/** Integer tile coordinates on the 16 × 16 grid. */
export interface Tile {
  gridX: number;
  gridZ: number;
}

/** A piece's anchor tile plus its rotation. */
export interface Placement {
  gridX: number;
  gridZ: number;
  rotation: Rotation;
}

/** Rejection reason codes from Section 10.2 of requirement.md. */
export type Reason =
  | 'occupied'
  | 'out_of_bounds'
  | 'on_track'
  | 'station_limit'
  | 'no_station'
  | 'play_mode'
  | 'not_found';

/** Sound log event names from Section 10.2 of requirement.md. */
export type SoundEvent =
  | 'pickup'
  | 'place'
  | 'move'
  | 'rotate'
  | 'delete'
  | 'snap'
  | 'invalid'
  | 'ui'
  | 'whistle'
  | 'chug'
  | 'bump';

/** Stored under `wooden-diorama:audio`. Volumes are 0 to 1. */
export interface AudioSettings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

/** Stored under `wooden-diorama:settings`. */
export interface AppSettings {
  lowQuality: boolean;
}
