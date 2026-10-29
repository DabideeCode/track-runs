// Data model from requirement.md §9 (names and types are part of the contract).

export type TrackType = 'straight' | 'curve' | 'tunnel' | 'station' | 'buffer'
export type DecorationType =
  | 'house'
  | 'pineTree'
  | 'roundTree'
  | 'hill'
  | 'car'
  | 'cassette'
  | 'blocks'
export type PieceType = TrackType | DecorationType
export type Rotation = 0 | 90 | 180 | 270

export interface Piece {
  id: string
  type: PieceType
  gridX: number // integer 0 to 15, west to east
  gridZ: number // integer 0 to 15, north to south
  rotation: Rotation
}

export type Mode = 'build' | 'play'
export type DriveMode = 'auto' | 'manual'
export type Setting = 'bedroom' | 'kitchen'
export type StartFacing = 0 | 180

export interface GameState {
  pieces: Piece[]
  selectedTool: PieceType | null
  selectedPieceId: string | null
  mode: Mode
  driveMode: DriveMode
  setting: Setting
  startFacing: StartFacing
  dioramaId: string | null
  dioramaName: string
  isDirty: boolean
}

export interface SaveFile {
  version: 1
  dioramas: Diorama[]
}

export interface Diorama {
  id: string
  name: string
  setting: Setting
  startFacing: StartFacing
  pieces: Piece[]
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  thumbnail?: string // data URL, optional (AC-1.7)
}

/** Compass direction of a tile edge. North is −Z, east is +X. */
export type Dir = 'N' | 'E' | 'S' | 'W'

export type ReasonCode =
  | 'occupied'
  | 'out_of_bounds'
  | 'on_track'
  | 'station_limit'
  | 'no_station'
  | 'play_mode'
  | 'not_found'

export interface ActionResult {
  ok: boolean
  id?: string
  reason?: ReasonCode
}

export interface Tile {
  gx: number
  gz: number
}
