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
export type Side = 'N' | 'E' | 'S' | 'W'
export type Setting = 'bedroom' | 'kitchen'
export type StartFacing = 0 | 180
export type Mode = 'build' | 'play'
export type DriveMode = 'auto' | 'manual'

export interface Piece {
  id: string
  type: PieceType
  gridX: number
  gridZ: number
  rotation: Rotation
}

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
  createdAt: string
  updatedAt: string
  thumbnail?: string
}

export type Reason =
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
  reason?: Reason
}

export type SoundName =
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
  | 'bump'

export interface TrainReport {
  pieceId: string
  progress: number
  moving: boolean
  direction: 'forward' | 'reverse'
  speed: number
}
