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

export interface AudioSettings {
  muted: boolean;
  musicVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
}

export type ReasonCode =
  | 'occupied'
  | 'out_of_bounds'
  | 'on_track'
  | 'station_limit'
  | 'no_station'
  | 'play_mode'
  | 'not_found';

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

export interface ActionResult {
  ok: boolean;
  reason?: ReasonCode;
}

export interface PlaceResult extends ActionResult {
  id?: string;
}

export interface TrainSnapshot {
  pieceId: string;
  progress: number;
  moving: boolean;
  direction: 'forward' | 'reverse';
  speed: number;
}
