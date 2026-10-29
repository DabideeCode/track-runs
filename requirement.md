# Track: Requirements

A wooden train diorama builder. Version 1.1, 29 October 2026

## 🎯 1. Purpose and overview

Build **Track**, a single-page web app where users design a 3D toy wooden train diorama, then play with a small wooden train on the tracks they built.

The experience should feel cozy and creative: soft, warm colours, a clean and sleek interface, and interactions that feel tactile and responsive. The visual style is **stylised realistic**. That means recognisable wooden-toy materials (wood grain, matte paint, soft plastic) on simplified toy shapes. It is **not** photorealistic and **not** flat cartoon.

Wherever this document uses a feel word such as "tactile", "cozy" or "light enough for weak devices", Section 7 gives its measurable definition.

## 🏷️ 2. Priorities

Every requirement has a priority:

- **Must**: required for the app to be considered complete.
- **Should**: expected, unless it would put a Must at risk.
- **Could**: nice to have.

Anything not listed, or listed in Section 12, is out of scope.

## 🧱 3. Technical constraints (Must)

| Area | Required |
| --- | --- |
| Language | TypeScript |
| Build | React with Vite |
| Styling | Tailwind CSS, with Radix UI primitives via shadcn/ui |
| 3D engine | Three.js via @react-three/fiber |
| 3D utilities | @react-three/drei |
| State | Zustand |

Additional runtime dependencies are allowed only from this list: `@react-spring/three` (animation), `howler` (audio playback), `nanoid` (ids), and `tone` (only for the procedural music fallback in Section 8). No physics engine. No backend.

Architecture constraints:

1. In the playfield, a 3D canvas fills the viewport.
2. A single Zustand store holds the game state described in Section 9.
3. A grid system maps the pointer position on the ground plane to the nearest integer tile coordinates, and placement uses those coordinates.
4. All UI controls (menus, palette, buttons, dialogs, toasts) are HTML overlay components styled with Tailwind, outside the WebGL canvas. The canvas renders only the 3D scene.

## 📖 4. Glossary

| Term | Meaning |
| --- | --- |
| Track (capital T) | The name of the app. Lower-case "track" always means a track piece |
| Diorama | One saved creation: its name, setting, start facing and placed pieces |
| Playfield | The screen where a diorama is built and played |
| Tile | One cell of the 16 × 16 grid, 1 scene unit wide |
| Piece | Any placed item: a track or a decoration |
| Track | A piece the train can run on (Section 6) |
| Decoration | A piece the train cannot run on (Section 6) |
| Connector | A tile edge where a track can join its neighbour |
| Open end | A track connector with no connected neighbour |
| Setting | The surface the diorama sits on: Bedroom floor or Kitchen table |
| Build mode | Mode for placing, moving, rotating and deleting pieces |
| Play mode | Mode where the train runs; editing is disabled |
| Ghost | A translucent preview of a piece before it is placed |

**Orientation.** North is −Z and east is +X. Grid tile (0, 0) is the north-west corner tile; tile (gridX, gridZ) has its centre at world position x = gridX − 7.5, z = gridZ − 7.5. Rotation 0° is the orientation listed in Section 6. Rotations are clockwise when viewed from above, in steps of 90°, so a connector on the north edge moves to the east edge after one rotation.

## ⚙️ 5. Functional requirements

### FR-1 Main menu (Must)

The app opens on a main menu listing saved dioramas.

- AC-1.1 Each saved diorama shows its name and last-edited date, newest first.
- AC-1.2 "New diorama" opens an empty playfield in Build mode with the Bedroom floor setting and the name "Untitled diorama" (or "Untitled diorama 2", "3" and so on if the name is taken).
- AC-1.3 Opening a saved diorama loads it in Build mode exactly as saved.
- AC-1.4 Users can rename a diorama. Names are 1 to 40 characters and cannot be blank.
- AC-1.5 Users can delete a diorama after confirming in a dialog.
- AC-1.6 With no saves, the menu shows an empty state that prompts the user to create one.
- AC-1.7 (Could) Each entry shows a thumbnail captured at its last save.
- AC-1.8 The main menu displays the app name "Track" as its heading, and the browser tab title is "Track".

### FR-2 Setting (Must)

- AC-2.1 The playfield offers exactly two settings: Bedroom floor and Kitchen table.
- AC-2.2 Switching setting changes the ground surface, surrounding props and lighting mood within 1 second, without moving any pieces.
- AC-2.3 The setting is saved with the diorama.
- AC-2.4 Bedroom floor: warm wooden floorboards with a soft rug and cool daylight. Kitchen table: a tabletop surface with warmer light. Props around the grid edge (for example a chair leg or a fruit bowl) give a sense of scale but never occupy grid tiles.

### FR-3 Grid and camera (Must)

- AC-3.1 The grid is 16 × 16 tiles, centred on the scene origin. It is visible as subtle lines in Build mode and hidden or faded in Play mode.
- AC-3.2 Hovering the pointer over the grid highlights the tile under it.
- AC-3.3 Right-drag orbits, middle-drag pans and the scroll wheel zooms. The left mouse button is reserved for pieces.
- AC-3.4 The camera stays between 20° and 80° from vertical (never below the surface), zooms between 4 and 30 units from its target, and its target stays within the grid area.
- AC-3.5 A "Reset view" button restores the default camera.

### FR-4 Palette (Must)

- AC-4.1 An HTML palette lists all 12 items from Section 6 in two groups, Tracks and Decorations, each with a name and an icon or preview.
- AC-4.2 The selected palette item is visibly highlighted and stored as `selectedTool` in the store.
- AC-4.3 The palette is hidden or disabled in Play mode.

### FR-5 Placing pieces (Must)

- AC-5.1 Dragging an item from the palette onto the grid shows a ghost that follows the pointer and snaps to the nearest tile.
- AC-5.2 Clicking a tile while a palette item is selected also places that item.
- AC-5.3 Releasing on a valid tile places the piece. Releasing off the grid or on an invalid tile cancels the placement and plays the invalid sound.
- AC-5.4 The ghost is tinted green on a valid tile and red on an invalid one, using the rules in FR-8.
- AC-5.5 Placing a piece adds exactly one entry to the store's `pieces` array.
- AC-5.6 Escape cancels the current drag, or deselects the palette tool if no drag is active.

### FR-6 Moving, rotating and deleting (Must)

- AC-6.1 Clicking a placed piece selects it and shows an outline.
- AC-6.2 Dragging a placed piece moves it. If the drop is invalid, the piece returns to its previous tile and rotation.
- AC-6.3 R rotates the selected piece, or the ghost during a drag, 90° clockwise.
- AC-6.4 Delete or Backspace removes the selected piece. A delete button in the overlay does the same.
- AC-6.5 (Should) Ctrl+Z (Cmd+Z on macOS) undoes the last place, move, rotate or delete, for at least 20 steps. Ctrl+Shift+Z (Cmd+Shift+Z) redoes.

### FR-7 Track snapping and connection (Must)

- AC-7.1 Tracks always snap to tile centres and to 90° rotations.
- AC-7.2 Two tracks are connected when they sit on adjacent tiles and both have a connector on their shared edge.
- AC-7.3 (Should) Auto-adjust: when a track is dropped next to an existing track that has an open end facing it, and its current rotation would leave it unconnected, it rotates to the first rotation (clockwise from its current one) that connects. The user can still rotate it afterwards with R.
- AC-7.4 Open ends show a small visual marker in Build mode.
- AC-7.5 Making a connection plays the snap sound in addition to the place sound.
- AC-7.6 Tracks may be placed unconnected. The train handles open ends as described in FR-10.

### FR-8 Clipping and placement rules (Must)

- AC-8.1 A tile holds at most one piece. A 2 × 2 piece occupies 4 tiles, all of which must be free.
- AC-8.2 No piece may extend beyond the grid.
- AC-8.3 Decorations cannot occupy a tile that holds a track, so they never sit on top of tracks.
- AC-8.4 A diorama has at most one station. While one exists, the station palette item is disabled with a tooltip explaining why.
- AC-8.5 These rules apply equally to UI actions and to the test hook in Section 10.

### FR-9 Start position (Must)

- AC-9.1 The station piece is the train's start track. The train spawns centred on the station.
- AC-9.2 In Build mode, the train is shown parked at the station.
- AC-9.3 A "Flip direction" control (overlay button or the F key) toggles which way the locomotive faces when it departs. Facing 0 means the locomotive faces the station's north connector (as rotated with the station); facing 180 means it faces the other connector. The default is 0.
- AC-9.4 The start facing is saved with the diorama.

### FR-10 Play mode and the train (Must)

- AC-10.1 A Build/Play toggle switches modes. Entering Play mode without a station shows the message "Place a station to start" and stays in Build mode.
- AC-10.2 Entering Play mode starts the train automatically in Auto driving.
- AC-10.3 The train is a locomotive plus 2 carriages. All three follow the track centreline, including through curves, with the carriages trailing at a fixed spacing.
- AC-10.4 "Forward" means the locomotive leads; "reverse" means the carriages lead.
- AC-10.5 An Auto/Manual toggle in the overlay switches the driving style at any time in Play mode.
- AC-10.6 Auto: the train runs at 1.5 tiles per second. At an open end or a buffer stop it eases to a stop, pauses for 1 second, then runs in the opposite direction. On a closed loop it runs indefinitely.
- AC-10.7 Manual: holding W moves the train forward; holding S moves it in reverse. It reaches its top speed of 2 tiles per second within 1 second of a key being held. Releasing both keys brings it to a stop within 0.5 seconds. At an open end or buffer stop it stops and will not move further in that direction.
- AC-10.8 Inside a tunnel, the tunnel shell hides the train except near the openings.
- AC-10.9 Pieces cannot be placed, moved, rotated or deleted in Play mode.
- AC-10.10 Returning to Build mode stops the train and parks it back at the station with its saved start facing.

### FR-11 Saving and persistence (Must)

- AC-11.1 A Save button stores the current diorama (name, setting, start facing and pieces) in localStorage.
- AC-11.2 After a page reload, a saved diorama appears in the main menu and reopens identically.
- AC-11.3 Returning to the menu with unsaved changes asks the user to save, discard or cancel.
- AC-11.4 A toast confirms each save.
- AC-11.5 (Should) While in Build mode, unsaved changes are autosaved every 30 seconds.
- AC-11.6 Corrupt or unreadable saved data never crashes the app. The menu skips that entry and logs a warning to the console.

### FR-12 Audio (Must)

- AC-12.1 Every build action plays its own sound effect: pick up, place, move (on drop), rotate, delete, snap (connection made) and invalid placement. Place and delete must sound clearly different.
- AC-12.2 Place, snap and rotate use wood-on-wood sounds, such as a soft knock or click.
- AC-12.3 Play mode sounds: a whistle when the train starts, a looping chug or clatter while it moves (its volume follows the speed), and a soft bump when it stops at a dead end.
- AC-12.4 Menu and overlay buttons play a subtle UI click.
- AC-12.5 Background music loops in the main menu and the playfield. Style: cozy, catchy chamber pop, indie folk, or an acoustic-electronic hybrid, similar in mood to life-simulation and park-builder game soundtracks. Do not use music from any commercial game.
- AC-12.6 Audio starts only after the first user interaction, to respect browser autoplay rules.
- AC-12.7 The overlay has a mute toggle and separate volume sliders for music and effects. These settings persist across sessions.
- AC-12.8 Each sound starts within 100 ms of the action that triggers it.

## 🚂 6. Item catalogue (Must)

The palette contains exactly these 12 items. One tile is 1 scene unit, about 15 cm of real wooden toy track; the sizes below keep every item at a believable scale relative to the train.

| # | Item | Type id | Kind | Footprint | Connectors at 0° | Description |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Straight track | `straight` | Track | 1 × 1 | N, S | Wooden rail with two grooves |
| 2 | Curved track | `curve` | Track | 1 × 1 | S, E | Quarter circle of radius 0.5 tiles, centred on the tile's south-east corner |
| 3 | Tunnel | `tunnel` | Track | 1 × 1 | N, S | Straight track under an arched wooden or painted shell |
| 4 | Station | `station` | Track | 1 × 1 | N, S | Straight track with a small platform and roof; the train's start; maximum 1 |
| 5 | Buffer stop | `buffer` | Track | 1 × 1 | S | Track end with a stop block at its north side |
| 6 | Toy house | `house` | Decoration | 1 × 1 | None | Painted wooden block house, about 1 tile tall |
| 7 | Pine tree | `pineTree` | Decoration | 1 × 1 | None | Wooden cone on a cylinder trunk, about 1.2 tiles tall |
| 8 | Round tree | `roundTree` | Decoration | 1 × 1 | None | Wooden ball on a stick, about 1 tile tall |
| 9 | Hill | `hill` | Decoration | 2 × 2 | None | Low felt or painted-wood mound, about 0.6 tiles high |
| 10 | Toy car | `car` | Decoration | 1 × 1 | None | Small wooden car, about 0.5 × 0.3 tiles |
| 11 | Cassette tape | `cassette` | Decoration | 1 × 1 | None | Household object at true scale: 0.68 × 0.43 × 0.08 tiles (a real cassette is 10.2 × 6.4 cm) |
| 12 | Building blocks | `blocks` | Decoration | 1 × 1 | None | Small stack of 3 lettered wooden blocks |

The hill's anchor (its `gridX`, `gridZ`) is its north-west tile; it also occupies the tiles to the east, south and south-east. Rotating the hill changes only its appearance, not its footprint.

The train (locomotive about 0.9 tiles long, carriages about 0.8 tiles long) is not a palette item.

**Materials (Must).** Wooden parts show visible grain with a soft matte finish (roughness 0.6 or higher, no mirror reflections). Painted parts are matte. Plastic parts, such as the car's wheels, have a slight sheen. Edges are softly bevelled or rounded, never razor-sharp.

## 🎨 7. Look and feel, made measurable

### 7.1 Visual style (Must)

- Stylised realistic: simplified toy shapes with materials that feel real. Not photorealistic, not flat cartoon.
- Palette: soft, warm, low-saturation colours such as cream, honey wood, sage, dusty blue and terracotta. Avoid pure black, pure white and neon.
- Interface: rounded corners, generous spacing, one clear typeface and a consistent icon style. Overlay panels are translucent or softly shadowed and cover no more than 25% of the viewport in Build mode.
- Lighting: one main directional light with soft shadows plus ambient fill. Pieces cast contact shadows on the ground.

### 7.2 Tactile interaction (Must)

Weight and physics are conveyed through animation, not a physics engine.

| Moment | Required behaviour |
| --- | --- |
| Grab (from the palette or the board) | The piece lifts 0.3 tiles above the ground within 150 ms, and its shadow softens and spreads |
| Drag | The piece follows the snapped target tile with a damped spring (settling within 250 ms, no visible jitter) and tilts up to 8° toward its direction of movement |
| Valid drop | The piece lowers onto the tile with a small settle or bounce (under 300 ms in total), then rests; the place sound plays on contact |
| Invalid drop | The piece shakes briefly (about 200 ms), then returns to where it came from, or disappears if it came from the palette; the invalid sound plays |
| Rotate | The piece turns 90° with an ease-out over about 150 ms; the rotate sound plays |
| Delete | The piece shrinks or lifts away and fades over about 200 ms; the delete sound plays |
| Hover | The hovered piece rises 0.05 tiles and the cursor becomes a pointer |

All motion uses easing or springs. Nothing teleports, except that undo and redo may apply instantly.

### 7.3 Performance on weak devices (Must)

- At least 30 fps in both Build and Play modes with 100 placed pieces, at 1920 × 1080, on an integrated GPU such as Intel Iris Xe.
- Device pixel ratio is capped at 1.5.
- At most one shadow-casting light, with a shadow map no larger than 2048 × 2048.
- Repeated meshes (for example many straight tracks) are instanced or share geometry and materials.
- The app is playable within 5 seconds of first load on a 25 Mbps connection. Total assets stay under 20 MB.
- (Should) A "Low quality" toggle turns off shadows and lowers render resolution.

## 📦 8. Assets (Must)

You source your own 3D models, textures, sound effects and music.

- Allowed licences: CC0 or CC-BY only. Credit every CC-BY asset.
- List every asset in `CREDITS.md` with its file path, title, author, source URL and licence.
- Do not use music, sounds or models taken from commercial games or other copyrighted media.
- Store assets under `public/assets/`, in the folders `models/`, `textures/`, `audio/sfx/` and `audio/music/`. Models are glTF binary (`.glb`); audio is `.mp3` or `.ogg`.
- Budgets: each model 1 MB or less, each texture 1024 × 1024 or smaller, the music file 5 MB or less.
- Fallback: if a suitable asset cannot be obtained, build models from Three.js primitives with procedural wood materials, and synthesise sound effects with the Web Audio API. Music may then be generated procedurally with `tone`. Any fallback must still meet Sections 6 and 7, and must be noted in `CREDITS.md`.

## 🗂️ 9. Data model and persistence (Must)

The store uses these names and types. Additional fields are allowed.

```ts
type TrackType = 'straight' | 'curve' | 'tunnel' | 'station' | 'buffer';
type DecorationType =
  | 'house' | 'pineTree' | 'roundTree' | 'hill' | 'car' | 'cassette' | 'blocks';
type PieceType = TrackType | DecorationType;
type Rotation = 0 | 90 | 180 | 270;

interface Piece {
  id: string;
  type: PieceType;
  gridX: number; // integer 0 to 15, west to east
  gridZ: number; // integer 0 to 15, north to south
  rotation: Rotation;
}

interface GameState {
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
```

Saved dioramas live in localStorage under the key `wooden-diorama:v1`:

```ts
interface SaveFile {
  version: 1;
  dioramas: Diorama[];
}

interface Diorama {
  id: string;
  name: string;
  setting: 'bedroom' | 'kitchen';
  startFacing: 0 | 180;
  pieces: Piece[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  thumbnail?: string; // data URL, optional (AC-1.7)
}
```

Audio settings (mute and the two volumes) live under the key `wooden-diorama:audio`.

## 🧪 10. Test contract (Must)

Automated tests rely on this contract. Implement it exactly as written.

### 10.1 Test ids

Each element below carries the listed `data-testid`.

| Element | data-testid |
| --- | --- |
| Main menu screen | `main-menu` |
| New diorama button | `new-diorama` |
| Saved diorama list | `diorama-list` |
| One saved entry (also carries `data-diorama-id`) | `diorama-item` |
| Open, rename and delete controls on an entry | `diorama-open`, `diorama-rename`, `diorama-delete` |
| Rename text input | `rename-input` |
| Confirm button in any confirmation dialog | `confirm-ok` |
| Discard button in the unsaved-changes dialog | `confirm-discard` |
| Playfield screen (also carries `data-mode="build"` or `data-mode="play"`) | `playfield` |
| Palette item, one per type id | `palette-<type id>`, for example `palette-straight` |
| Build/Play toggle | `mode-toggle` |
| Auto/Manual toggle | `drive-toggle` |
| Setting selector | `setting-select` |
| Flip start direction | `flip-direction` |
| Save button | `save-button` |
| Back to menu | `back-to-menu` |
| Delete selected piece | `delete-piece` |
| Reset camera | `reset-view` |
| Mute toggle | `mute-toggle` |
| Music volume and effects volume sliders | `music-volume`, `sfx-volume` |
| Toast or status message | `toast` |

### 10.2 Window hook

When the URL contains `?test=1`, or the app runs in development mode, expose `window.__DIORAMA__`:

```ts
interface DioramaTestHook {
  getState(): GameState;
  placePiece(
    type: PieceType, gridX: number, gridZ: number, rotation?: Rotation
  ): { ok: boolean; id?: string; reason?: string };
  movePiece(id: string, gridX: number, gridZ: number): { ok: boolean; reason?: string };
  rotatePiece(id: string): { ok: boolean; reason?: string }; // 90° clockwise
  removePiece(id: string): { ok: boolean; reason?: string };
  getConnections(): Array<[string, string]>; // pairs of connected track ids
  setMode(mode: 'build' | 'play'): { ok: boolean; reason?: string };
  setDriveMode(mode: 'auto' | 'manual'): void;
  getTrain(): {
    pieceId: string;     // track piece the locomotive is on
    progress: number;    // 0 to 1 along that piece
    moving: boolean;
    direction: 'forward' | 'reverse';
    speed: number;       // tiles per second
  } | null;
  getSoundLog(): string[]; // sound event names in the order played
}
```

- Hook actions apply exactly the same validation as the UI (FR-8) and trigger the same sounds.
- If `rotation` is omitted in `placePiece`, the auto-adjust rule in AC-7.3 applies. If it is given, it is used as is.
- `reason` uses one of these codes: `occupied`, `out_of_bounds`, `on_track`, `station_limit`, `no_station`, `play_mode`, `not_found`.
- `getSoundLog` uses these event names: `pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `whistle`, `chug`, `bump`.
- The hook is not exposed in a production build unless the URL contains `?test=1`.

## ✅ 11. Non-functional requirements (Must)

- Runs in the latest desktop versions of Chrome, Edge, Firefox and Safari.
- `npm install`, `npm run dev` and `npm run build` all succeed from a clean clone, and `npm run build` reports no TypeScript errors.
- No console errors during normal use.
- Overlay controls show a visible keyboard focus state and have accessible names.
- `README.md` explains how to run the app, lists the controls, and notes any known limitations.

## 🚫 12. Out of scope

- Track junctions, switches, crossings, bridges, slopes or elevation.
- More than one train.
- Physics engines and free-form (off-grid) placement.
- Touch and mobile support.
- Accounts, cloud sync, sharing or any backend.
- Any placeable items beyond the 12 in Section 6, or settings beyond the 2 in FR-2.

## 🏁 13. Definition of done

- Every Must acceptance criterion is met.
- The test contract in Section 10 is implemented exactly.
- `CREDITS.md` lists every asset and any fallback used.
- The app builds and runs from a clean clone using the commands in Section 11.
