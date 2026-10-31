# Data Model: Track

`requirement.md` Section 9 fixes the `Piece`, `GameState`, `SaveFile` and `Diorama` types. They are used
exactly as written and are not repeated here. This file adds what Section 9 leaves open.

## Static catalogue

`src/domain/catalogue.ts` holds one entry per `requirement.md` Section 6 item.

| Field | Meaning |
| --- | --- |
| `type` | The type id |
| `kind` | `track` or `decoration` |
| `footprint` | `[1, 1]`, or `[2, 2]` for the hill |
| `connectors` | Edges at 0°, such as `['N', 'S']` |
| `height` | Height of the picking box, in tiles |

Rotation moves connectors clockwise: N → E → S → W, one step per 90°.

## Extra store fields

Section 9 allows additional fields. All live in the single store.

| Field | Type | Purpose |
| --- | --- | --- |
| `screen` | `'menu' \| 'playfield'` | Current screen |
| `drag` | `DragState \| null` | Active drag, updated only when the target tile or rotation changes |
| `ghostRotation` | `Rotation` | Rotation of the hover ghost; resets when the tool changes |
| `hoveredPieceId` | `string \| null` | Hovered piece |
| `undoStack`, `redoStack` | `Piece[][]` | Snapshots, capped at 50; emptied on open |
| `toast` | `{ id: string; message: string } \| null` | One toast at a time, replaced by the next |
| `dialog` | `DialogState \| null` | Open confirm, unsaved-changes or rename dialog |
| `audio` | `AudioSettings` | Mirrors the persisted settings |
| `lowQuality` | `boolean` | Low quality toggle |

`DragState` holds its source (`palette` or `board`), piece type, piece id if any, origin tile and
rotation, target tile or null, current rotation and validity.

## Derived data

These are computed from `pieces` and never stored.

- **Occupancy**: tile key → piece id, including all 4 hill tiles.
- **Connections**: pairs of tracks on adjacent tiles with connectors on the shared edge, each pair once.
- **Open ends**: each track connector with no connected neighbour, as piece id and edge.
- **Route**: the path from the station, defined below.

## Validation

`validatePlacement` in `src/domain/rules.ts` is the single rule check, used by the ghost, drops and the
hook. Checks run in this order, and the first failure is returned:

1. In Play mode: `play_mode`.
2. Referenced piece missing: `not_found`.
3. Any tile off the grid or not an integer: `out_of_bounds`.
4. Placing a second station: `station_limit`.
5. A decoration over any track tile: `on_track`.
6. Any other tile held by a different piece: `occupied`.

A move ignores the moving piece's own tiles. Rotation never changes occupied tiles, so step 1 and 2 are
the only checks that can refuse a rotate.

## Field rules

| Value | Rule |
| --- | --- |
| Piece `id`, Diorama `id` | `nanoid()` |
| `gridX`, `gridZ` | Integers from 0 to 15 |
| Diorama `name` | Trimmed, 1 to 40 characters |
| Default name | `Untitled diorama`, then the lowest free number from 2 upward, against saved names |
| `updatedAt` | Set on save, autosave and rename |
| `createdAt` | Set on first save, then never changed |

## Session state transitions

```text
Menu ── new or open ──▶ Build ◀── setMode('build') ── Play
                          │                             ▲
                          └── setMode('play'), station ─┘
                          └── setMode('play'), none: stays in Build, no_station + toast
Build or Play ── back to menu ──▶ dirty? dialog: Save | Discard | Cancel ──▶ Menu
```

- `isDirty` becomes true when pieces, setting or start facing change, and false on save, or on opening
  or creating a diorama.
- Entering Play sets `driveMode` to `auto`, clears `selectedTool`, `selectedPieceId` and any drag, and
  initialises the train.
- Leaving Play stops the train and parks it.
- `dioramaId` stays `null` until the first save or autosave.

## Track paths

Each track piece contributes one path in its tile, by arc length in tiles.

| Type | Path | Length |
| --- | --- | --- |
| `straight`, `tunnel`, `station` | Connector to opposite connector | 1 |
| `curve` | Quarter circle of radius 0.5 around the shared corner of its two connector edges | π/4 ≈ 0.785 |
| `buffer` | Connector toward the stop block | 0.8 |

## Route

Built once on entering Play, since pieces cannot change there. Each track has at most two connectors,
so a connected run is always a line or a loop, and there are no junctions.

Starting at the station, walk out through the connector the locomotive faces, which sets the +s
direction. Then walk out through the other connector. If the first walk returns to the station, the route
is a **loop**. Otherwise it is a **line**.

```ts
interface Route {
  kind: 'line' | 'loop';
  segments: { pieceId: string; start: number; length: number }[]; // in +s order
  length: number;  // L, in tiles
  stationS: number; // s of the station centre
}
```

Past either end of a line, positions continue in a straight line along the end tangent. This only places
carriages that overhang.

## Train

`s` is the locomotive's centre along the route. Carriages sit at fixed distances behind it.

| Value | Tiles |
| --- | --- |
| Locomotive length | 0.9 |
| Carriage length | 0.8 |
| Gap | 0.1 |
| First carriage centre | s − 0.95 |
| Second carriage centre | s − 1.85 |
| Train front | s + 0.45 |
| Train rear | s − 2.25 |
| Total length | 2.7 |

Each vehicle takes its heading from the chord between two points 0.3 tiles either side of its centre, so
it follows curves.

**Limits on a line** (no limits on a loop):

| Case | Forward limit | Reverse limit |
| --- | --- | --- |
| L ≥ 2.95 | L − 0.45 | 2.25 |
| L < 2.95 | L − 0.45 | 0.45 |

The 2.95 threshold, rather than the train's 2.7, keeps movement visible on near-fit lines. Station,
straight and buffer gives L = 2.8, where the strict limits would leave only 0.1 tiles to move.

**Motion**:

| Case | Cruise (tiles/s) | Accelerate (tiles/s²) | Brake (tiles/s²) |
| --- | --- | --- | --- |
| Auto | 1.5 | 5 | 3 |
| Manual | 2 | 2.5 (top speed in 0.8 s) | 5 (stops in 0.4 s) |

Near a limit, speed is capped at `sqrt(2 × brake × distance)`, so the train eases to a stop exactly at
the limit. A stop there plays `bump`. Auto then waits 1 second and flips direction.

**Runtime state** (in `src/train/runtime.ts`, outside the store):

```ts
interface TrainRuntime {
  route: Route | null;
  s: number;
  speed: number;              // always 0 or more
  direction: 'forward' | 'reverse';
  phase: 'running' | 'pausing' | 'stopped';
  pauseLeft: number;          // seconds
  held: { forward: boolean; reverse: boolean };
}
```

`getTrain()` returns `null` with no station. In Build mode it reports the station, progress 0.5, not
moving, `forward` and speed 0. `progress` runs from 0 to 1 in the +s direction across the current piece.

## Audio settings

Stored under `wooden-diorama:audio`.

```ts
interface AudioSettings {
  muted: boolean;       // default false
  musicVolume: number;  // 0 to 1, default 0.5
  sfxVolume: number;    // 0 to 1, default 0.8
}
```
