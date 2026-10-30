# Data Model: Track, a Wooden Train Diorama Builder

`requirement.md` Section 9 defines the saved and state types exactly, and they are not repeated here. This document adds the validation rules, derived data, extra store fields and state transitions.

## Stored data

| Key | Shape | Notes |
| --- | --- | --- |
| `wooden-diorama:v1` | `SaveFile` (Section 9) | Dioramas |
| `wooden-diorama:audio` | `{ muted: boolean, musicVolume: number, sfxVolume: number }` | Volumes 0 to 1. Defaults: not muted, 0.5, 0.8 |

### Diorama validation on load

An entry is readable only if all of these hold. Otherwise it is skipped with `console.warn` and left untouched in storage (spec D-18).

- `id` is a non-empty string, and `name` meets the name rule after trimming.
- `setting` is `bedroom` or `kitchen`, and `startFacing` is 0 or 180.
- `createdAt` and `updatedAt` are valid ISO 8601 dates.
- `thumbnail` is a string, if present.
- Every piece has a unique id, a known type, integer `gridX` and `gridZ` from 0 to 15, and a valid rotation.
- The full piece list passes the placement rules below, checked as if added one at a time.

### Save behaviour

| Case | Result |
| --- | --- |
| File missing | Treated as empty, with no warning |
| Not valid JSON, not an object, or `version` is not 1 | Warning, treated as empty, replaced by the next save |
| Some entries unreadable | Those entries stay in the file as raw values, and writes replace only the matching id |
| Write fails (full or blocked storage) | Failure toast, `isDirty` stays true, `dioramaId` is unchanged |
| First save | New id from `nanoid`, `createdAt` and `updatedAt` set to now |
| Later save | `updatedAt` set to now, `createdAt` kept |

The file is re-read before each write, so a change from another tab is not overwritten wholesale.

## Catalogue

Section 6 is the source for all values. `domain/catalog.ts` holds kind, footprint, connectors at 0° and pick height.

### Connectors by rotation

Each 90° clockwise step maps N → E → S → W → N.

| Type | 0° | 90° | 180° | 270° |
| --- | --- | --- | --- | --- |
| `straight`, `tunnel`, `station` | N, S | E, W | N, S | E, W |
| `curve` | S, E | W, S | N, W | E, N |
| `buffer` | S | W | N | E |
| Decorations | None | None | None | None |

### Occupied tiles

- All items except the hill occupy the anchor tile only.
- The hill occupies (x, z), (x+1, z), (x, z+1) and (x+1, z+1), whatever its rotation.

## Placement rules

`domain/rules.ts` checks in this order and returns the first failure (spec D-06). Tiles occupied by the piece being moved are ignored, so a piece never blocks itself.

| Order | Check | Reason |
| --- | --- | --- |
| 1 | Mode is `play` | `play_mode` |
| 2 | Piece id or type is unknown | `not_found` |
| 3 | Any footprint tile is off the grid, or a coordinate is not an integer | `out_of_bounds` |
| 4 | Placing a station when one exists | `station_limit` |
| 5 | A decoration footprint tile holds a track | `on_track` |
| 6 | Any footprint tile holds a piece | `occupied` |

## Derived data

These are computed from `pieces` and never stored.

- **Occupancy**: a map from tile to piece id.
- **Connections**: for each pair of adjacent tracks, connected if each has a connector on the shared edge. Each pair appears once, ordered by position in `pieces`.
- **Open ends**: a track connector with no connected neighbour, including one facing the grid edge or a decoration.
- **Station lookup**: the single piece of type `station`, or none.

### Auto-adjust

Applies to a track without an explicit rotation (spec D-04):

1. If the track connects to any neighbour at its current rotation, keep that rotation.
2. Otherwise try the current rotation plus 90°, 180° and 270°, in that order.
3. Use the first that connects. If none does, keep the current rotation.

## Store

The single store holds the Section 9 `GameState` plus these additional fields.

| Field | Purpose |
| --- | --- |
| `screen: 'menu' \| 'playfield'` | Current screen |
| `savedDioramas: Diorama[]` | Readable entries for the menu |
| `past: Piece[][]`, `future: Piece[][]` | Undo and redo snapshots, capped at 50 |
| `drag` | Null, or source (`palette` or `board`), type, piece id, rotation, target tile, and whether the target is valid |
| `hoverTile`, `hoverPieceId` | Pointer state for Build mode |
| `toast`, `dialog` | Overlay state |
| `lowQuality: boolean` | Session-only (spec D-24) |
| `cameraResetToken: number` | Increments to trigger an eased Reset view |

Train pose is deliberately not in the store. It lives in a small runtime object updated by the simulation (R4).

## Route

`domain/route.ts` builds the route when Play is entered. Pieces cannot change in Play, so the route stays fixed.

- Distance `s = 0` is the station centre, and positive `s` runs toward the start-facing connector. Facing 0 leaves by the station's rotated north connector, and facing 180 by the other one.
- The walk follows connections outward from each station connector until it reaches an open end, a buffer stop, or the station again (closed loop).

Each piece's centreline, at 0° and rotated with the piece:

| Type | Centreline | Length |
| --- | --- | --- |
| `straight`, `tunnel`, `station` | Edge midpoint to edge midpoint | 1 |
| `curve` | Quarter circle of radius 0.5 about the south-east corner | π/4, about 0.785 |
| `buffer` | South edge midpoint to the stop block's face, 0.25 tiles north of the tile centre | 0.75 |

## Train

Constants, in tiles and seconds:

| Name | Value |
| --- | --- |
| Locomotive length | 0.9 |
| Carriage length | 0.8 |
| Gap between vehicles | 0.1 |
| Carriage 1 offset behind the locomotive centre | 0.95 |
| Carriage 2 offset behind the locomotive centre | 1.85 |
| Rear of train behind the locomotive centre | 2.25 |
| Auto speed | 1.5 |
| Manual top speed | 2 |
| Auto acceleration and braking | 3 |
| Manual acceleration | 4 |
| Manual braking | 5 |
| Dead-end pause | 1 |

With these values, Manual reaches top speed in 0.5 s from rest, or 0.9 s when reversing from full speed, and stops within 0.4 s. All are inside AC-10.7.

### Travel limits

For an open route running from `sMin` to `sMax`:

- `maxS = sMax − 0.45`, the locomotive's nose at the far end.
- `minS = min(0, sMin + 2.25)`, the last carriage's rear at the near end. It never exceeds the spawn position (spec D-09).

A closed route wraps `s` by its total length and has no limits. The smallest closed loop that contains a station is about 5.14 tiles, so the train cannot overlap itself.

Vehicles past the end of the route continue in a straight line along the end tangent. This only happens for the overhang case in D-09.

Braking near a limit caps speed at `sqrt(2 × braking × distance to limit)`, so the train eases to rest exactly on the limit.

### Train states

```text
Auto:
  running ──(reaches limit, logs bump)──> paused (1 s) ──(flips direction)──> running

Manual:
  stopped ──(W or S held, room ahead)──> moving
  moving  ──(keys released)────────────> stopped
  moving  ──(reaches limit, logs bump)─> stopped at limit (that key has no effect)

Any state ──(Auto/Manual toggle)──> continues from current speed and direction
Any state ──(return to Build)─────> parked at the station
```

### Hook values

- `pieceId`: the route segment containing `s`.
- `progress`: `(s − segment start) / segment length`, which rises when travelling forward. It is 0.5 when parked (spec D-10).
- `moving`: true from Play entry in Auto until a stop, and whenever speed is above 0.
- `speed`: the magnitude in tiles per second.
- `direction`: forward means `s` is increasing, and reverse means it is decreasing.

## Mode transitions

| From | Event | Condition | Result |
| --- | --- | --- | --- |
| Build | Enter Play | No station | Stay in Build, toast "Place a station to start", hook reason `no_station` |
| Build | Enter Play | Station exists | Cancel any drag, clear tool and selection, set Auto, build route, log `whistle`, train running |
| Play | Enter Build | None | Stop train and chug, park at the station with the saved facing, keep `driveMode` until next entry |

## Drag states

```text
idle ──(press on palette item or piece)──> pending
pending ──(moved 4 px)───────────────────> dragging (logs pickup)
pending ──(released)─────────────────────> click (place or select)
dragging ──(R)───────────────────────────> dragging (rotates, logs rotate)
dragging ──(valid release)───────────────> commit (place or move)
dragging ──(invalid or off-grid release)─> rejected (logs invalid, shakes)
dragging ──(Escape or focus lost)────────> cancelled (no invalid sound)
```

Hover ghosts for a tool selected by click do not use this machine, but they use the same validity check.

## Unsaved-change rules

`isDirty` follows spec D-15. Save, autosave and opening a diorama clear it. Discard leaves the screen without writing. Undo history rules are in spec D-19.
