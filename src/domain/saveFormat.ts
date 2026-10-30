/**
 * Save-format validation and parsing (Requirements 3.4, 3.5, 24.1, 24.2, 24.4,
 * 24.6, 27.8, 27.12, 33.5, 36.1, 36.2; design D-20 and D-21).
 *
 * Pure functions that accept any value and never throw. The persistence layer
 * reads raw strings from storage and passes them here; nothing in this module
 * touches browser storage.
 *
 * Validated dioramas and pieces are returned as clean copies that hold only the
 * known fields, so a parse → stringify → parse round trip is stable.
 */
import { isPieceType, isRotation } from './catalogue';
import { footprintTiles, inGrid, tileKey } from './grid';
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './naming';
import type { AppSettings, AudioSettings, Diorama, Piece } from './types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** The only SaveFile version this app reads and writes. */
export const SAVE_FILE_VERSION = 1;

/** Audio defaults: unmuted, music 0.5, effects 0.8 (Requirements 24.4, 27.8). */
export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  muted: false,
  musicVolume: 0.5,
  sfxVolume: 0.8,
});

/** App settings default: Low quality off (Requirement 33.5). */
export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({ lowQuality: false });

// ---------------------------------------------------------------------------
// Generic guards
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

/** A non-null, non-array object. */
function isRecord(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Reads an own property only, so inherited keys (for example `constructor`) never count. */
function own(o: Rec, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined;
}

/** A finite number from 0 to 1 inclusive. */
function isUnitNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

/** Turns −0 into 0 so copies compare equal with `Object.is`. */
const unsign = (n: number): number => (n === 0 ? 0 : n);

// ---------------------------------------------------------------------------
// ISO 8601 date-time
// ---------------------------------------------------------------------------

/**
 * Date-time with a mandatory `T`, hours and minutes, optional seconds and
 * fraction, and a mandatory `Z` or ±hh:mm offset, as in the design.
 */
const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * True for an ISO 8601 date-time string that matches the pattern, names a real
 * calendar date and time (no 30 February, hour 24 or second 60), and that
 * `Date.parse` accepts.
 */
export function isIsoDateTime(x: unknown): x is string {
  if (typeof x !== 'string') return false;
  const m = ISO_PATTERN.exec(x);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const offH = m[7] === undefined ? 0 : Number(m[7]);
  const offM = m[8] === undefined ? 0 : Number(m[8]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offH > 23 || offM > 59) return false;
  return !Number.isNaN(Date.parse(x));
}

// ---------------------------------------------------------------------------
// Pieces and dioramas
// ---------------------------------------------------------------------------

/**
 * Returns a clean copy of a stored piece, or null when it breaks a rule:
 * not an object; `id` not a string; `type` not one of the 12 type ids;
 * `gridX` or `gridZ` not an integer from 0 to 15; any footprint tile off the
 * grid (a hill anchored at 15); `rotation` not 0, 90, 180 or 270.
 */
export function validatePiece(x: unknown): Piece | null {
  if (!isRecord(x)) return null;
  const id = own(x, 'id');
  const type = own(x, 'type');
  const gridX = own(x, 'gridX');
  const gridZ = own(x, 'gridZ');
  const rotation = own(x, 'rotation');
  if (typeof id !== 'string') return null;
  if (!isPieceType(type)) return null;
  if (typeof gridX !== 'number' || typeof gridZ !== 'number') return null;
  if (!inGrid({ gridX, gridZ })) return null;
  if (!footprintTiles(type, gridX, gridZ).every(inGrid)) return null;
  if (!isRotation(rotation)) return null;
  return { id, type, gridX: unsign(gridX), gridZ: unsign(gridZ), rotation: unsign(rotation) as Piece['rotation'] };
}

/** True for a stored name: a string of 1 to 40 characters that is not blank. */
function isStoredName(x: unknown): x is string {
  return (
    typeof x === 'string' &&
    x.length >= NAME_MIN_LENGTH &&
    x.length <= NAME_MAX_LENGTH &&
    x.trim().length > 0
  );
}

/**
 * Returns a clean copy of a stored diorama, or null when it breaks a rule from
 * Requirement 24.1 or D-20:
 * - not an object; `id` not a non-empty string;
 * - `name` not a string of 1 to 40 characters, or blank;
 * - `setting` not `'bedroom'` or `'kitchen'`; `startFacing` not 0 or 180;
 * - `pieces` not an array, or any piece failing `validatePiece`;
 * - `createdAt` or `updatedAt` not an ISO 8601 date-time;
 * - `thumbnail` present (not undefined) and not a string;
 * - two pieces sharing an id, two footprints sharing a tile, or more than one station.
 * Unknown extra fields are dropped from the copy.
 */
export function validateDiorama(x: unknown): Diorama | null {
  if (!isRecord(x)) return null;
  const id = own(x, 'id');
  const name = own(x, 'name');
  const setting = own(x, 'setting');
  const startFacing = own(x, 'startFacing');
  const rawPieces = own(x, 'pieces');
  const createdAt = own(x, 'createdAt');
  const updatedAt = own(x, 'updatedAt');
  const thumbnail = own(x, 'thumbnail');

  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isStoredName(name)) return null;
  if (setting !== 'bedroom' && setting !== 'kitchen') return null;
  if (startFacing !== 0 && startFacing !== 180) return null;
  if (!Array.isArray(rawPieces)) return null;
  if (!isIsoDateTime(createdAt) || !isIsoDateTime(updatedAt)) return null;
  if (thumbnail !== undefined && typeof thumbnail !== 'string') return null;

  const pieces: Piece[] = [];
  const ids = new Set<string>();
  const covered = new Set<number>();
  let stations = 0;
  for (const raw of rawPieces) {
    const piece = validatePiece(raw);
    if (!piece) return null;
    if (ids.has(piece.id)) return null;
    ids.add(piece.id);
    if (piece.type === 'station' && ++stations > 1) return null;
    for (const tile of footprintTiles(piece.type, piece.gridX, piece.gridZ)) {
      const key = tileKey(tile);
      if (covered.has(key)) return null;
      covered.add(key);
    }
    pieces.push(piece);
  }

  const diorama: Diorama = {
    id,
    name,
    setting,
    startFacing: unsign(startFacing) as Diorama['startFacing'],
    pieces,
    createdAt,
    updatedAt,
  };
  if (typeof thumbnail === 'string') diorama.thumbnail = thumbnail;
  return diorama;
}

// ---------------------------------------------------------------------------
// SaveFile
// ---------------------------------------------------------------------------

export type SaveLoad =
  | { status: 'missing' }
  | { status: 'corrupt'; raw: string }
  | { status: 'ok'; entries: unknown[]; valid: Diorama[]; invalidCount: number };

/**
 * Parses the raw value stored under `wooden-diorama:v1`. Never throws.
 *
 * - null (no stored value): `missing`.
 * - Not JSON (including the empty string), or not an object with `version`
 *   equal to 1 and a `dioramas` array: `corrupt`, carrying the raw string.
 * - Otherwise `ok`: `entries` is a shallow copy of the stored `dioramas` array
 *   (invalid entries included, untouched), `valid` holds clean copies of the
 *   valid entries in stored order, and `invalidCount` counts the rest. An entry
 *   whose id repeats the id of an earlier valid entry counts as invalid, so each
 *   id appears at most once in `valid`.
 */
export function parseSaveFile(raw: string | null): SaveLoad {
  if (typeof raw !== 'string') return { status: 'missing' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', raw };
  }
  if (!isRecord(parsed)) return { status: 'corrupt', raw };
  const dioramas = own(parsed, 'dioramas');
  if (own(parsed, 'version') !== SAVE_FILE_VERSION || !Array.isArray(dioramas)) {
    return { status: 'corrupt', raw };
  }

  const entries: unknown[] = [...dioramas];
  const valid: Diorama[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const d = validateDiorama(entry);
    if (d && !seen.has(d.id)) {
      seen.add(d.id);
      valid.push(d);
    }
  }
  return { status: 'ok', entries, valid, invalidCount: entries.length - valid.length };
}

/** Milliseconds since the epoch for a validated timestamp (NaN-safe for sorting). */
function instant(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Returns a new array ordered by `updatedAt` descending (compared as instants,
 * so different offsets sort correctly), then by `id` ascending in code-unit order.
 */
export function sortNewestFirst(d: readonly Diorama[]): Diorama[] {
  return [...d].sort((a, b) => {
    const diff = instant(b.updatedAt) - instant(a.updatedAt);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Parses JSON without throwing; `ok: false` for invalid JSON. */
function tryParse(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/**
 * Parses the raw value stored under `wooden-diorama:audio`. Never throws.
 *
 * - null: defaults, `warn: false` (Requirement 24.6).
 * - Not JSON or not a plain object: all defaults, `warn: true`.
 * - Otherwise each field that is missing or invalid (`muted` not a boolean, a
 *   volume not a finite number from 0 to 1) takes its own default, and
 *   `warn` is true when at least one field did (D-21).
 */
export function parseAudioSettings(raw: string | null): { settings: AudioSettings; warn: boolean } {
  if (typeof raw !== 'string') return { settings: { ...DEFAULT_AUDIO_SETTINGS }, warn: false };
  const parsed = tryParse(raw);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return { settings: { ...DEFAULT_AUDIO_SETTINGS }, warn: true };
  }
  const o = parsed.value;
  const muted = own(o, 'muted');
  const musicVolume = own(o, 'musicVolume');
  const sfxVolume = own(o, 'sfxVolume');
  let warn = false;
  const settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  if (typeof muted === 'boolean') settings.muted = muted;
  else warn = true;
  if (isUnitNumber(musicVolume)) settings.musicVolume = unsign(musicVolume);
  else warn = true;
  if (isUnitNumber(sfxVolume)) settings.sfxVolume = unsign(sfxVolume);
  else warn = true;
  return { settings, warn };
}

/**
 * Parses the raw value stored under `wooden-diorama:settings`. Never throws.
 * null gives the default with no warning; invalid JSON, a non-object or a
 * missing or non-boolean `lowQuality` gives `lowQuality: false` with a warning.
 */
export function parseAppSettings(raw: string | null): { settings: AppSettings; warn: boolean } {
  if (typeof raw !== 'string') return { settings: { ...DEFAULT_APP_SETTINGS }, warn: false };
  const parsed = tryParse(raw);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return { settings: { ...DEFAULT_APP_SETTINGS }, warn: true };
  }
  const lowQuality = own(parsed.value, 'lowQuality');
  if (typeof lowQuality === 'boolean') return { settings: { lowQuality }, warn: false };
  return { settings: { ...DEFAULT_APP_SETTINGS }, warn: true };
}
