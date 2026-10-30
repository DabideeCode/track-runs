---

description: "Task list for building Track, a wooden train diorama builder"
---

# Tasks: Track, a Wooden Train Diorama Builder

**Input**: Design documents from `specs/001-track-diorama-builder/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. `requirement.md` is the source of truth and MUST NOT be edited.

**Tests**: Included because plan.md (R14) and quickstart.md depend on `npm run test:unit` and `npm run test:e2e`. The constitution does not require test-first, so tests are written alongside the code they cover. Every Playwright test uses the fixture from T008, which fails on any console error or uncaught exception.

**Organization**: Tasks are grouped by user story. Story order follows spec.md priorities: US1, US2, US3 and US7 (P1), then US4 and US5 (P2), then US6 (P3). Rules and store actions sit in Phase 2, so any story can seed pieces through the test hook and can be tested on its own.

**Reading a task**: `FR-nnn` and `D-nn` refer to spec.md, `Rn` refers to research.md, and "Section n" refers to `requirement.md`. Read those references before starting a task. Runtime dependencies MUST stay within the T001 list.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1 to US7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [ ] T001 Create `package.json` (`"private": true`, `"type": "module"`) with these exact pins. Dependencies: `react` and `react-dom` 19.3.1, `three` 0.186.1, `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9, `zustand` 5.0.16, `radix-ui` 1.8.1, `@react-spring/three` 10.1.2, `howler` 2.2.4, `nanoid` 6.0.2, `tone` 15.1.22. Dev dependencies: `typescript` 7.0.2, `vite` 8.3.5, `@vitejs/plugin-react` 6.1.2, `tailwindcss` and `@tailwindcss/vite` 4.3.3, `@types/three` 0.186.0, `@types/howler` 2.2.13, `@types/react`, `@types/react-dom`, `vitest` 5.0.5, `@playwright/test` 1.64.1. Scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `preview` (`vite preview`), `test:unit` (`vitest run`), `test:e2e` (`playwright test`), `check:assets` (`node scripts/check-assets.mjs`). Do NOT add `shadcn`, `cn`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react` or `tw-animate-css` (R2). Run `npm install` to create `package-lock.json` (FR-092)
- [ ] T002 Create `tsconfig.json` with `strict: true`, `noEmit: true`, `target` and `module` `ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `skipLibCheck: true`, path alias `@/*` to `src/*`, covering `src`, `tests`, `vite.config.ts` and `playwright.config.ts`. If TypeScript 7 fails on third-party types, step down a major version and record it in research.md R1
- [ ] T003 Create `vite.config.ts` with `@vitejs/plugin-react`, `@tailwindcss/vite`, `base: './'`, the `@` alias, `resolve.dedupe` for `three`, `react` and `react-dom`, and a Vitest `test.include` of `tests/unit/**/*.test.ts`
- [ ] T004 Create `index.html` with `lang="en"`, `<title>Track</title>`, a favicon link to `favicon.svg`, a `#root` element and the module script for `src/main.tsx` (FR-001)
- [ ] T005 [P] Create `public/favicon.svg`, a simple wooden train wheel in palette colours, so no 404 reaches the console (R15)
- [ ] T006 [P] Create `src/index.css` with the Tailwind import, palette tokens for cream, honey wood, sage, dusty blue and terracotta plus near-black and off-white text colours (no pure black, pure white or neon), one system typeface stack, full-height `html`, `body` and `#root`, and a global visible focus ring (FR-076, FR-094)
- [ ] T007 [P] Create `components.json` (shadcn settings, Tailwind CSS path `src/index.css`, alias `@`) and `src/ui/components/cn.ts`, a helper that joins truthy class names, replacing the `cn` package (R2)
- [ ] T008 [P] Create `playwright.config.ts` (projects `chromium`, `firefox`, `webkit`, plus `chrome` and `msedge` channels; `webServer` running `npm run build && npm run preview`; Chromium launch args for software WebGL) and `tests/e2e/fixtures.ts`, which fails a test on any `console.error` or `pageerror`, opens the app with `?test=1`, and provides a `hook` helper for calling `window.__DIORAMA__` (R14, R15)
- [ ] T009 [P] Create `scripts/check-assets.mjs`, which scans `public/assets/` and exits non-zero if the total reaches 20 MB, any `.glb` exceeds 1 MB, any texture exceeds 1024 × 1024, any file in `audio/music/` exceeds 5 MB, any model is not `.glb`, any audio file is not `.mp3` or `.ogg`, or any file path is missing from `CREDITS.md`. The total covers everything under `public/assets/` (FR-085, R12, D-25)
- [ ] T010 [P] Create `CREDITS.md` with a table of file path, title, author, source URL and licence, plus a Fallbacks section recording the R9 reason for procedural models, and create `public/assets/textures/`, `public/assets/audio/sfx/` and `public/assets/audio/music/` with `.gitkeep` files (FR-084, FR-085, FR-086)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain rules, the single store, a logging audio core, the test hook and the app shell

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Create `src/domain/types.ts` with the Section 9 types exactly: `TrackType`, `DecorationType`, `PieceType`, `Rotation`, `Piece`, `GameState`, `SaveFile`, `Diorama`, plus `ReasonCode` with `occupied`, `out_of_bounds`, `on_track`, `station_limit`, `no_station`, `play_mode`, `not_found` (FR-087, FR-090)
- [ ] T012 Create `src/domain/catalog.ts` with all 12 items from Section 6: type id, display name, kind, footprint, connectors at 0° and pick height. Connectors: `straight`, `tunnel`, `station` N, S; `curve` S, E; `buffer` S; decorations none. Add `connectorsAt(type, rotation)` using "N → E → S → W → N" per 90°, and `footprintTiles(type, x, z)` where the hill occupies (x, z), (x+1, z), (x, z+1) and (x+1, z+1) "whatever its rotation" (FR-018, FR-019)
- [ ] T013 [P] Create `src/domain/grid.ts` with `GRID_SIZE = 16`, `tileToWorld(x, z)` giving `x − 7.5` and `z − 7.5`, `worldToTile(x, z)` giving the nearest tile or null off the grid, and `isOnGrid` (FR-022, FR-013)
- [ ] T014 Create `src/domain/rules.ts` with `validatePlacement` checking in this order and returning the first failure: mode is `play` → `play_mode`; unknown id or type → `not_found`; off-grid or non-integer → `out_of_bounds`; placing a station when one exists → `station_limit`; decoration footprint tile holds a track → `on_track`; any footprint tile holds a piece → `occupied`. Tiles of the piece being moved are ignored (D-06, FR-043, FR-044, FR-045, FR-046, FR-047)
- [ ] T015 Create `src/domain/connections.ts` with `getConnections(pieces)`, listing each adjacent track pair with connectors on the shared edge once in `pieces` order, and `getOpenEnds(pieces)`, where an open end is a connector with no connected neighbour, including one facing the grid edge or a decoration (FR-038, FR-042)
- [ ] T016 Create `src/domain/autoAdjust.ts` with `autoAdjustRotation(pieces, candidate)`: keep the current rotation if the track connects to any neighbour; otherwise try plus 90°, 180° and 270° in order and use the first that connects; if none does, keep the current rotation (D-04, FR-039)
- [ ] T017 [P] Create `src/domain/names.ts` with `nextDefaultName(existing)` giving "Untitled diorama", then "Untitled diorama 2", "3" and so on, by exact match against saved names, and `validateName(raw)` that trims, then requires 1 to 40 characters and rejects blank names (FR-004, FR-006, D-14)
- [ ] T018 Create `src/audio/audioEngine.ts` with a `SoundEvent` type of `pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `whistle`, `chug`, `bump`, a `play(event)` that always appends to an in-memory log, and `getSoundLog()`. Real playback is added in T086 (D-08)
- [ ] T019 Create `src/store/gameStore.ts`, the single Zustand store, with all Section 9 `GameState` fields and `screen`, `savedDioramas`, `drag`, `hoverTile`, `hoverPieceId`, `toast`, `dialog`, `lowQuality`, `cameraResetToken`. Add actions `placePiece(type, x, z, rotation?)`, `movePiece(id, x, z)`, `rotatePiece(id)`, `removePiece(id)`, `selectPiece`, `selectTool` and `showToast`. Actions return Section 10 result shapes, validate through `rules.ts`, auto-adjust per D-04, mark `isDirty`, and fire sounds: `place`, `move`, `rotate` or `delete`, then `snap` once if a new connection formed. Log `invalid` only for `out_of_bounds`, `station_limit`, `on_track` and `occupied`. New ids come from `nanoid`. Placement adds exactly one entry. Hook-driven actions do not change selection (R3, D-02, D-05, D-07, FR-030, FR-037, FR-041, FR-047, FR-087)
- [ ] T020 Create `src/testing/testHook.ts`, exposing `window.__DIORAMA__` from app start when `import.meta.env.DEV` is true or the URL contains `?test=1`, and not otherwise. Implement `getState` (returning a snapshot), `placePiece`, `movePiece`, `rotatePiece`, `removePiece`, `getConnections` and `getSoundLog` over the store actions. Add `setMode`, `setDriveMode` and `getTrain` as stubs for T057 (FR-089, FR-090, D-23)
- [ ] T021 [P] Create `src/ui/components/button.tsx`, adapted from shadcn's Button with variants as a plain lookup object and no `class-variance-authority` (R2)
- [ ] T022 [P] Create `src/ui/icons.tsx`, one inline SVG icon set in a single style, covering save, back, play, build, reset view, flip, delete, volume, mute, rename, plus, undo and low quality (R2, FR-076)
- [ ] T023 Create `src/ui/Toaster.tsx` and `src/ui/components/toast.tsx`, adapted from shadcn over Radix Toast, showing the store's single `toast` with `data-testid="toast"` and dismissing after about 3 seconds (FR-088)
- [ ] T024 Create `src/ui/MainMenu.tsx` as a first version with `data-testid="main-menu"`, the heading "Track" and a `new-diorama` button that opens an empty Build playfield. T067 completes it (FR-001, FR-004)
- [ ] T025 Create `src/scene/PlayfieldCanvas.tsx`, with a fiber `Canvas` using `dpr={[1, 1.5]}`, `shadows="percentage"` and `frameloop="always"`, and `src/scene/Lighting.tsx` with one directional shadow-casting light (1024² map fitted to the board) plus ambient fill. Handle a failed context with a friendly message (R6, R15, FR-076, FR-081)
- [ ] T026 Create `src/ui/Playfield.tsx` with `data-testid="playfield"` and `data-mode` from the store, lazy-loading `PlayfieldCanvas` to fill the viewport with overlay panels in a separate HTML layer above it, and start fetching the scene chunk when the menu is idle (FR-080, R11)
- [ ] T027 Create `src/App.tsx`, switching on `screen` and always rendering `Toaster`, and `src/main.tsx`, mounting React and installing the test hook (FR-080)
- [ ] T028 [P] Add `tests/unit/rules.test.ts` covering every reason code, the priority order, hill footprints at the east and south edges, one station maximum, and a hill moved so its new footprint overlaps its old one (FR-043, FR-044, FR-045, FR-046)
- [ ] T029 [P] Add `tests/unit/connections.test.ts` covering connector rotation for all track types, connected pairs, and open ends at the grid edge and beside decorations (FR-038)
- [ ] T030 [P] Add `tests/unit/autoAdjust.test.ts` covering no change when connected, first clockwise connecting rotation, and no connecting rotation (FR-039)
- [ ] T031 [P] Add `tests/unit/names.test.ts` covering default name numbering, trimming, 1 and 40 characters, 41 characters, and blank names (FR-004, FR-006)

**Checkpoint**: `npm run build` and `npm run test:unit` pass, and the app opens to a menu and an empty canvas

---

## Phase 3: User Story 1 - Build a diorama on the grid (Priority: P1) 🎯 MVP

**Goal**: Users place, select, move, rotate and delete all 12 items on a grid, with rule enforcement and camera control.

**Independent Test**: From an empty diorama, place all 12 catalogue items, move and rotate some, delete one, and try an illegal placement. The piece list and the visuals match after each action.

### Tests for User Story 1

- [ ] T032 [P] [US1] Add `tests/e2e/build.spec.ts` covering palette drag placement, click placement, ghost validity through `drag` state, invalid drops, Escape, selecting then R and Delete, the disabled station item with tooltip, and D-01 and D-02 behaviour (FR-026, FR-027, FR-028, FR-029, FR-031, FR-032, FR-033, FR-034, FR-035, FR-046)

### Implementation for User Story 1

- [ ] T033 [P] [US1] Source CC0 wood grain and bedroom floor and rug textures at 1024² or smaller as JPEG into `public/assets/textures/`, confirming each licence on its asset page and listing each in `CREDITS.md`. If none fits, record the fallback in `CREDITS.md` and rely on T034 (FR-083, FR-084, FR-086, R12)
- [ ] T034 [P] [US1] Create `src/scene/woodTexture.ts`, generating procedural grain on a canvas no larger than 1024² as the texture fallback (FR-086)
- [ ] T035 [US1] Create `src/scene/materials.ts` with shared materials: wood with visible grain and roughness 0.6 or higher, matte paint in palette colours, plastic with a slight sheen, and no mirror reflections (FR-020)
- [ ] T036 [US1] Create `src/scene/pieceGeometry.ts` building all 12 items in code with bevelled or rounded edges, merged per item type and material, at Section 6 sizes: curve as a quarter circle of radius 0.5 centred on the south-east corner, tunnel as a straight under an arched shell tall and long enough to hide the train, station with platform and roof, buffer with a stop block at the north side, house about 1 tall, pine about 1.2 tall, round tree about 1 tall, hill about 0.6 high on 2 × 2, car about 0.5 × 0.3, cassette 0.68 × 0.43 × 0.08, and 3 lettered blocks. Track grooves line up on tile-edge midpoints (FR-018, FR-019, FR-020, FR-059)
- [ ] T037 [US1] Create `src/scene/PieceField.tsx` with one `createInstances` provider per item type and material pair, and `src/scene/PieceNode.tsx`, a group at the piece's tile and rotation containing its `Instance` parts. Hill groups sit at the centre of the 2 × 2 footprint (R5, FR-081)
- [ ] T038 [US1] Create `src/scene/ContactShadows.tsx` with one instanced soft blob per piece, sized to its footprint, with no second scene render (R6, FR-076)
- [ ] T039 [P] [US1] Create `src/scene/Ground.tsx` with the Bedroom floor surface: warm floorboards and a soft rug. T075 adds Kitchen table (FR-012)
- [ ] T040 [P] [US1] Create `src/scene/GridOverlay.tsx`, 16 × 16 subtle lines centred on the origin as one line object, fading in Play, and `src/scene/TileHighlight.tsx`, highlighting `hoverTile` in Build mode (FR-013, FR-014)
- [ ] T041 [P] [US1] Create `src/scene/CameraRig.tsx` with drei `CameraControls`: left `NONE`, middle pan (`TRUCK`), right `ROTATE`, wheel `DOLLY`; polar angle limited to 20° to 80°; distance 4 to 30; target boundary set to the grid area; eased reset through `setLookAt(..., true)` on `cameraResetToken`. Suppress the context menu on the canvas (FR-015, FR-016, FR-017)
- [ ] T042 [US1] Create `src/interaction/pointerRay.ts`, converting a screen position into a ray, its ground-plane point, the tile through `worldToTile`, and the hovered piece through ray tests against per-piece boxes from catalogue pick height, with the nearest hit winning (R7, FR-014)
- [ ] T043 [US1] Create `src/interaction/dragController.ts` with the drag state machine in data-model.md: a 4 px threshold, pending to click or dragging, window-level pointer events, no HTML drag and drop. Release over an overlay or outside the window counts as off the grid. Lost focus or Escape cancels with no invalid sound. Log `pickup` on drag start. Implement D-01 and D-02 click behaviour. After a successful palette drag, select the new piece and clear the tool (FR-026, FR-027, FR-028, FR-031, FR-033, FR-045)
- [ ] T044 [US1] Create `src/scene/DragGhost.tsx`, a translucent preview of the dragged item or hover tool, snapped to the target tile, green when valid and red when invalid, using the same `validatePlacement` and rotating with R (FR-026, FR-029, D-03)
- [ ] T045 [P] [US1] Create `src/scene/SelectionOutline.tsx` (drei `Outlines` on plain meshes built from the selected piece's geometry) and `src/scene/OpenEndMarkers.tsx` (a small marker at each open end from `getOpenEnds`, in Build mode only) (FR-032, FR-040)
- [ ] T046 [US1] Create `src/ui/components/tooltip.tsx` (adapted from shadcn over Radix Tooltip) and `src/ui/Palette.tsx` listing all 12 items in Tracks and Decorations groups with names and previews, `data-testid="palette-<type id>"`, a highlighted `selectedTool`, and pointer down wired to `dragController`. The palette is disabled in Play. The station item uses `aria-disabled` with a tooltip explaining why while a station exists (FR-023, FR-024, FR-025, FR-046)
- [ ] T047 [US1] Create `src/interaction/keyboard.ts` with R, Delete, Backspace and Escape per `contracts/ui-controls.md`, ignored while typing or with a dialog open, and R rotating the selected piece, drag ghost or hover ghost (FR-031, FR-034, FR-035, D-20)
- [ ] T048 [US1] Create `src/ui/TopBar.tsx` with `reset-view` and `delete-piece`, disabled when nothing is selected. T060, T069, T078 and T099 add the remaining controls (FR-017, FR-035)
- [ ] T049 [US1] Wire `PieceField`, `ContactShadows`, `Ground`, `GridOverlay`, `TileHighlight`, `CameraRig`, `DragGhost`, `SelectionOutline` and `OpenEndMarkers` into `src/scene/PlayfieldCanvas.tsx`, and `Palette` and `TopBar` into `src/ui/Playfield.tsx`

**Checkpoint**: All 12 items can be built and edited through the UI and the hook

---

## Phase 4: User Story 2 - Run the train (Priority: P1)

**Goal**: A locomotive and 2 carriages follow the track in Auto and Manual, with correct dead-end and loop behaviour.

**Independent Test**: Lay a closed loop and a separate line ending in a buffer stop, each with a station in turn. Enter Play mode and confirm Auto and Manual behaviour on each.

### Tests for User Story 2

- [ ] T050 [P] [US2] Add `tests/unit/route.test.ts` covering open routes in both directions, facing 0 and 180 at all four station rotations, closed loops, curve length π/4, buffer length 0.75, and a lone station (FR-050, FR-054)
- [ ] T051 [P] [US2] Add `tests/unit/trainSim.test.ts` covering Auto at 1.5 tiles per second, easing to the limit, the 1 second pause, direction flip, closed-loop running, Manual reaching 2 tiles per second within 1 second from rest and from full reverse, stopping within 0.5 seconds, refusal at a dead end, both keys held, and the D-09 limits (FR-055, FR-057, FR-058)
- [ ] T052 [P] [US2] Add `tests/e2e/play.spec.ts` covering Play without a station ("Place a station to start", stays Build, reason `no_station`), `whistle`, Auto entry after Manual use, dead-end `bump`, `play_mode` rejections, the parked train after return, and W and S driving (FR-052, FR-053, FR-056, FR-057, FR-058, FR-060, FR-061)

### Implementation for User Story 2

- [ ] T053 [US2] Create `src/domain/route.ts` per data-model.md: `s = 0` at the station centre, positive `s` toward the start-facing connector, walking connections until an open end, a buffer stop or the station again. Segments: straight, tunnel and station length 1; curve "Quarter circle of radius 0.5 about the south-east corner", length π/4; buffer from the south edge midpoint to the stop block face 0.25 north of tile centre, length 0.75. Provide point and tangent at any `s`, wrap closed routes, and extrapolate along the end tangent past open ends (FR-054, FR-050, D-09)
- [ ] T054 [US2] Create `src/domain/trainSim.ts`, a pure `step(state, dt, input)` using the data-model.md constants: carriage offsets 0.95 and 1.85, rear 2.25, Auto speed 1.5, Manual top 2, Auto acceleration and braking 3, Manual acceleration 4, Manual braking 5, pause 1. Limits are `maxS = sMax − 0.45` and `minS = min(0, sMin + 2.25)`. Braking near a limit caps speed at `sqrt(2 × braking × distance to limit)`. It reports `bump` and chug start and stop events. Auto flips `direction` after the pause. Both keys held counts as neither (FR-054, FR-055, FR-057, FR-058, D-09, D-11)
- [ ] T055 [US2] Create `src/store/trainRuntime.ts`, a non-store object holding the current pose and sim state, with a `requestAnimationFrame` loop running fixed 1/120 s steps, capped at 0.5 s of elapsed time per frame. It derives `pieceId`, `progress`, `moving`, `direction` and `speed` per the data-model.md hook values, and forwards sim events to `audioEngine` (R4, D-10)
- [ ] T056 [US2] Add `setMode` and `setDriveMode` to `src/store/gameStore.ts`: entering Play with no station shows the toast "Place a station to start" and returns `no_station`; with a station it cancels any drag, clears tool and selection, sets Auto, builds the route, logs `whistle` and starts `trainRuntime`. Returning to Build stops the train and chug and parks it. The same-mode call returns `{ ok: true }` (FR-052, FR-053, FR-060, FR-061, D-12)
- [ ] T057 [US2] Complete `setMode`, `setDriveMode` and `getTrain` in `src/testing/testHook.ts`. `getTrain` returns null with no station, and otherwise the parked or running values from T055 (FR-089, D-10)
- [ ] T058 [US2] Create `src/scene/TrainView.tsx`: a locomotive about 0.9 long and 2 carriages about 0.8 long built like pieces, positioned each frame by mutation in `useFrame` from `trainRuntime`, on the track centreline and facing along the tangent. It shows parked at the station in Build, following station moves, rotation and start facing (FR-021, FR-048, FR-049, FR-054, FR-059)
- [ ] T059 [US2] Add W and S hold handling for Manual to `src/interaction/keyboard.ts`, treating lost focus as released and ignoring both keys in Auto. Build shortcuts are ignored in Play (FR-058, D-20)
- [ ] T060 [US2] Add `mode-toggle` and `drive-toggle` to `src/ui/TopBar.tsx` as buttons with `aria-pressed`, with `drive-toggle` disabled in Build, and wire `TrainView` into `src/scene/PlayfieldCanvas.tsx`, confirming the T040 grid fades in Play (FR-013, FR-052, FR-056, D-12)

**Checkpoint**: The train runs correctly in Auto and Manual on lines and loops

---

## Phase 5: User Story 3 - Keep and manage dioramas (Priority: P1)

**Goal**: The menu lists saved dioramas, and users can save, reopen, rename and delete them, with no silent data loss.

**Independent Test**: Create and save a diorama, reload the page, reopen it and confirm it is identical. Then rename it, delete it, and confirm the empty state returns.

### Tests for User Story 3

- [ ] T061 [P] [US3] Add `tests/unit/saveFile.test.ts` covering every validation rule, missing file, invalid JSON, `version` not 1, skipped entries left in the file as raw values, first and later saves, and write failure (FR-063, FR-067)
- [ ] T062 [P] [US3] Add `tests/e2e/persistence.spec.ts` covering save toast, reload and reopen with identical data, newest-first order, default name numbering, rename limits, delete confirm, unsaved dialog Save, Discard and Cancel, untouched new diorama, and a corrupt entry logging a warning and no error (FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-062, FR-063, FR-064, FR-065, FR-067)

### Implementation for User Story 3

- [ ] T063 [US3] Create `src/persistence/saveFile.ts` for key `wooden-diorama:v1`. An entry is readable only if: `id` is a non-empty string; `name` meets the name rule after trimming; `setting` is `bedroom` or `kitchen`; `startFacing` is 0 or 180; `createdAt` and `updatedAt` are valid ISO 8601 dates; `thumbnail` is a string if present; every piece has a unique id, a known type, integer `gridX` and `gridZ` from 0 to 15 and a valid rotation; and the full piece list passes the placement rules, checked as if added one at a time. Otherwise skip with `console.warn` and keep the raw value in the file. Missing file is empty with no warning. Invalid JSON, a non-object or `version` not 1 warns and is treated as empty. Re-read before each write and replace only the matching id. Wrap all storage access in try/catch (FR-067, FR-087, D-18)
- [ ] T064 [US3] Add `newDiorama`, `openDiorama`, `saveDiorama`, `renameDiorama`, `deleteDiorama`, `refreshSaved` and `returnToMenu` to `src/store/gameStore.ts`. First save sets a `nanoid` id and both timestamps; later saves set `updatedAt` and keep `createdAt`. Save failure shows "Could not save. Storage may be full.", keeps `isDirty` true and leaves `dioramaId` unchanged. Success shows "Saved". Rename updates `updatedAt`. Opening or creating replaces the session and leaves Build mode (FR-004, FR-005, FR-006, FR-007, FR-011, FR-051, FR-062, FR-065, D-14, D-15, D-16)
- [ ] T065 [US3] Create `src/ui/components/dialog.tsx` (adapted from shadcn over Radix Dialog with a title and description always present) and `src/ui/ConfirmDialog.tsx` with `confirm-ok`. Escape acts as Cancel (FR-007, R15)
- [ ] T066 [P] [US3] Create `src/ui/DioramaEntry.tsx` with `data-testid="diorama-item"`, `data-diorama-id`, name, formatted last-edited date, `diorama-open`, `diorama-rename`, `diorama-delete`, and an inline `rename-input` where Enter confirms and Escape cancels, showing a visible message on a blank or over-long name and keeping the old name (FR-002, FR-006, D-14)
- [ ] T067 [US3] Complete `src/ui/MainMenu.tsx` with `diorama-list` always present, entries newest first by `updatedAt`, the empty state prompting creation, and delete through `ConfirmDialog` (FR-001, FR-002, FR-003, FR-007)
- [ ] T068 [US3] Create `src/ui/UnsavedDialog.tsx` with Save (`confirm-ok`), Discard (`confirm-discard`) and Cancel, which stays on the playfield (FR-064, D-17)
- [ ] T069 [US3] Add `save-button` and `back-to-menu` to `src/ui/TopBar.tsx`, enabled in both modes, with back showing `UnsavedDialog` only when `isDirty` is true and stopping the train on leaving (FR-062, FR-064, D-12)

**Checkpoint**: Dioramas persist across reloads, and corrupt data cannot crash the app

---

## Phase 6: User Story 7 - Be verifiable by automated tests (Priority: P1)

**Goal**: Every test id and hook function matches Section 10 exactly.

**Independent Test**: Open the app with `?test=1`, then exercise every hook function and locate every listed test id. Confirm the hook is absent from a production build without that URL flag.

- [ ] T070 [P] [US7] Add `tests/e2e/contract.spec.ts`, checking every Section 10.1 test id and every behaviour in `contracts/test-hook.md`: function results, the reason table, the failure sound table, `rotation` in `placePiece`, snapshots from `getState`, and `getConnections` order (FR-088, FR-089, FR-090)
- [ ] T071 [P] [US7] Add `tests/e2e/hook-gating.spec.ts`, confirming that in the production preview `window.__DIORAMA__` is defined with `?test=1` and undefined without it (FR-089)
- [ ] T072 [US7] Fix any gaps T070 and T071 reveal in `src/testing/testHook.ts`, keeping all hook actions on the shared store path (FR-047, FR-090)

**Checkpoint**: The contract suite passes

---

## Phase 7: User Story 4 - Choose the setting and start direction (Priority: P2)

**Goal**: Users switch between the two settings and flip the train's departure direction, and both persist.

**Independent Test**: On a diorama with pieces, switch setting and flip direction, save, reload, and confirm both persist while no piece has moved.

### Tests for User Story 4

- [ ] T073 [P] [US4] Add `tests/e2e/setting.spec.ts` covering `setting-select` values `bedroom` and `kitchen`, unchanged pieces, F and `flip-direction`, disabled flip in Play, and both persisting after reload (FR-009, FR-010, FR-011, FR-050, FR-051)

### Implementation for User Story 4

- [ ] T074 [P] [US4] Source a CC0 tabletop texture at 1024² or smaller as JPEG into `public/assets/textures/` and list it in `CREDITS.md`, or record the fallback (FR-083, FR-084, FR-086)
- [ ] T075 [US4] Add the Kitchen table surface and edge props for both settings to `src/scene/Ground.tsx`, for example a chair leg and a rug edge for Bedroom floor, and a fruit bowl and a mug for Kitchen table, placed outside the grid so they never occupy tiles. Cross-fade surfaces within 1 second (FR-010, FR-012)
- [ ] T076 [US4] Add setting-driven colour and intensity to `src/scene/Lighting.tsx`, cool daylight for Bedroom floor and warmer light for Kitchen table, eased within 1 second (FR-010, FR-012)
- [ ] T077 [US4] Add `setSetting` and `flipDirection` to `src/store/gameStore.ts`, both marking `isDirty`, with flip allowed in Build with or without a station. Add F to `src/interaction/keyboard.ts` (FR-010, FR-050, D-12, D-15)
- [ ] T078 [US4] Add `setting-select` (native `<select>` labelled "Bedroom floor" and "Kitchen table", enabled in both modes) and `flip-direction` (disabled in Play) to `src/ui/TopBar.tsx` (FR-009, FR-050, R13)

**Checkpoint**: Settings and start facing work and persist

---

## Phase 8: User Story 5 - Feel and sound like a real wooden toy (Priority: P2)

**Goal**: Every interaction has the Section 7.2 motion and its own sound, and music and audio settings work.

**Independent Test**: Perform each moment in `requirement.md` Section 7.2 and each sound in FR-12, checking timing and sound logging. Change the audio settings and reload to confirm they persist.

### Tests for User Story 5

- [ ] T079 [P] [US5] Add `tests/unit/audioSettings.test.ts` covering defaults (not muted, 0.5, 0.8), persistence, and unreadable data falling back to defaults (FR-074)
- [ ] T080 [P] [US5] Add `tests/e2e/audio.spec.ts` covering the sound log for each build action and D-05 order, `ui` on button clicks, no playback before first interaction with logging still working, and mute and volumes persisting after reload (FR-068, FR-071, FR-073, FR-074)

### Implementation for User Story 5

- [ ] T081 [P] [US5] Source sound effects as `.mp3` or `.ogg` into `public/assets/audio/sfx/` (`pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `whistle`, `chug`, `bump`), trying Kenney's packs first and confirming the CC0 licence in the pack. Place, snap and rotate MUST be wood-on-wood, and place and delete MUST sound clearly different. List each in `CREDITS.md`, and record any fallback (FR-068, FR-069, FR-083, FR-084, FR-086)
- [ ] T082 [P] [US5] Source one looping track of 5 MB or less into `public/assets/audio/music/` in a cozy chamber pop, indie folk or acoustic-electronic style, licensed CC0 or CC-BY only, never from a commercial game, and confirmed on its page. List it in `CREDITS.md`, or record that the T085 fallback is used (FR-072, FR-083, FR-084, FR-086)
- [ ] T083 [P] [US5] Create `src/persistence/audioSettings.ts` for key `wooden-diorama:audio` with shape `{ muted: boolean, musicVolume: number, sfxVolume: number }`, "Volumes 0 to 1", defaults "not muted, 0.5, 0.8", falling back to defaults on unreadable data (FR-074, FR-087)
- [ ] T084 [P] [US5] Create `src/audio/synth.ts`, Web Audio synthesis for any sound effect with no file, used through the same events (FR-086)
- [ ] T085 [P] [US5] Create `src/audio/musicFallback.ts`, a cozy looping `tone` track loaded through dynamic `import('tone')`, so `tone` stays out of the initial bundle (FR-072, FR-086, R11)
- [ ] T086 [US5] Extend `src/audio/audioEngine.ts` with Howler playback: load effects at startup, stream music with `html5: true`, start audio only after the first user interaction, then play the music loop across menu and playfield without restarting. `play` keeps logging regardless of state. Add mute and volumes, applied immediately. Run the chug as a loop with volume following speed, logging `chug` each time it starts. Fall back to `synth.ts` and `musicFallback.ts`, catching all load failures (FR-070, FR-072, FR-073, FR-074, FR-075, D-08, R10)
- [ ] T087 [US5] Create `src/ui/AudioPanel.tsx` with `mute-toggle` and native range sliders `music-volume` and `sfx-volume` from 0 to 100, always rendered and compact, and use it in `src/ui/Playfield.tsx` and `src/ui/MainMenu.tsx`, with only one on screen (FR-074, FR-088, D-21)
- [ ] T088 [US5] Make `src/ui/components/button.tsx` log `ui` on press, and log `ui` on palette item clicks in `src/ui/Palette.tsx`, but not on palette drags (FR-071, D-08)
- [ ] T089 [US5] Add `@react-spring/three` to `src/scene/PieceNode.tsx`: hover rises 0.05 tiles, rotation turns 90° on a continuous angle with an ease-out over about 150 ms, and a placed piece drops from the 0.3 lifted height in about 80 ms, then settles in under 300 ms in total (R8, FR-078, FR-079)
- [ ] T090 [US5] Add to `src/scene/DragGhost.tsx`: a lift to 0.3 tiles within 150 ms, a damped spring to the snapped tile settling within 250 ms with no jitter, a tilt of up to 8° toward movement, and an invalid-drop shake of about 200 ms before returning or disappearing (FR-078, FR-079)
- [ ] T091 [P] [US5] Create `src/scene/ExitEffects.tsx`, playing a shrink or lift and fade over about 200 ms for deleted pieces from a short-lived list, while the store removes them immediately (FR-078, D-13)
- [ ] T092 [US5] Update `src/scene/ContactShadows.tsx` so a piece's blob softens and spreads with its lift (FR-078)
- [ ] T093 [US5] Add eased transitions for visible jumps in `src/scene/TrainView.tsx`: an ease or fade to the station on return to Build, and an eased turn on flip. Add the pointer cursor over hovered pieces in `src/scene/PlayfieldCanvas.tsx` (FR-078, FR-079, D-13)

**Checkpoint**: Every Section 7.2 moment and every sound works

---

## Phase 9: User Story 6 - Work safely and comfortably (Priority: P3)

**Goal**: Undo and redo, autosave, Low quality and optional thumbnails.

**Independent Test**: Make more than 20 edits and undo 20 of them, wait 30 seconds and confirm the autosave, then toggle Low quality.

### Tests for User Story 6

- [ ] T094 [P] [US6] Add `tests/unit/history.test.ts` covering a cap of 50, at least 20 steps, redo clearing on a new edit, and no step for a failed action (FR-036)
- [ ] T095 [P] [US6] Add `tests/e2e/comfort.spec.ts` covering Ctrl+Z and Ctrl+Shift+Z over 20 steps, and autosave after 30 seconds using a mocked clock, including its pause in Play (FR-036, FR-066)

### Implementation for User Story 6

- [ ] T096 [P] [US6] Create `src/store/history.ts` with undo and redo stacks of `Piece[]` snapshots, capped at 50 (FR-036)
- [ ] T097 [US6] Add `undo` and `redo` to `src/store/gameStore.ts`, recording on place, move, rotate and delete from UI and hook, unavailable in Play, kept across saves, cleared when a different diorama opens, and marking `isDirty`. Add Ctrl+Z, Cmd+Z, Ctrl+Shift+Z and Cmd+Shift+Z to `src/interaction/keyboard.ts`. Undo and redo apply instantly (FR-036, D-19)
- [ ] T098 [US6] Add a 30 second autosave timer to `src/store/gameStore.ts`, running only in Build with `isDirty` true, paused in Play, showing the toast "Autosaved", and able to create a first save (FR-066, D-19)
- [ ] T099 [US6] Add `lowQuality` handling to `src/scene/PlayfieldCanvas.tsx`, turning off shadows and lowering render resolution, and a Low quality button with `aria-pressed` to `src/ui/TopBar.tsx`. It is not persisted (FR-082, D-24)
- [ ] T100 [US6] Add thumbnail capture to `src/store/gameStore.ts` and `src/scene/PlayfieldCanvas.tsx`: a small JPEG data URL captured at save without `preserveDrawingBuffer`, and show it in `src/ui/DioramaEntry.tsx`. Skip this task if it puts any Must at risk (FR-008)

**Checkpoint**: All user stories are complete

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Whole-app requirements and final verification

- [ ] T101 [P] Add `tests/e2e/layout.spec.ts`, measuring that overlay panels cover no more than 25% of the viewport in Build mode at 1920 × 1080 and 1280 × 720, and that the canvas fills the viewport (FR-077, FR-080, D-22)
- [ ] T102 [P] Add `tests/e2e/a11y.spec.ts`, checking every overlay control has an accessible name and that Tab reaches each with a visible focus ring (FR-094)
- [ ] T103 [P] Write `README.md`, covering how to run the app, all controls from `contracts/ui-controls.md`, and known limitations, including the D-09 short-track overhang (FR-095)
- [ ] T104 Build a 100-piece test diorama in `tests/e2e/fixtures.ts`, then measure Build and Play frame rate in the production build at 1920 × 1080 and fix any shortfall in `src/scene/`. Report the GPU used, and treat results as indicative unless it is an Iris Xe class chip (FR-081, R14)
- [ ] T105 Check `dist/` for initial JavaScript under 700 KB compressed, `tone` in a separate chunk and unused drei dependencies tree-shaken, and test first load at 25 Mbps, fixing any shortfall in `vite.config.ts` (R11)
- [ ] T106 Run `npm run check:assets`, then complete `CREDITS.md` so every asset and fallback is listed (FR-083, FR-084, FR-085, FR-086)
- [ ] T107 Audit `package.json` so runtime dependencies are exactly the T001 list (FR-092, R2)
- [ ] T108 Run the Playwright suite in every project defined in `playwright.config.ts`, using `PLAYWRIGHT_BROWSERS_PATH=0`, fix failures, and record that real Safari is unverified unless run on a Mac (FR-091, FR-093)
- [ ] T109 Add `.tmp/` to `.gitignore`, then test a clean clone in `.tmp/clean-clone/` inside the project: `npm install`, `npm run dev`, `npm run build` with no TypeScript errors. Delete `.tmp/clean-clone/` afterwards (FR-092)
- [ ] T110 Run all 11 `specs/001-track-diorama-builder/quickstart.md` scenarios and walk through `requirement.md` Section 13, reporting any Must that is not met (FR-091, FR-093)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T001 first, then T002 to T004, then the [P] tasks.
- **Foundational (Phase 2)**: Depends on Setup and BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational.
- **US2, US3 (Phases 4 and 5)**: Depend on Foundational. Their domain, store and persistence tasks can start at once, but their `TopBar` and scene wiring tasks (T060, T069) need T048 and T049 from US1.
- **US7 (Phase 6)**: Depends on US1, US2 and US3, because it verifies all their test ids and hook functions.
- **US4 (Phase 7)**: Depends on US1 (`Ground`, `TopBar`) and on US3 for its persistence test.
- **US5 (Phase 8)**: Depends on US1, and on US2 for the train and chug tasks.
- **US6 (Phase 9)**: Depends on US1, and on US3 for autosave and thumbnails.
- **Polish (Phase 10)**: Depends on all stories.

### User Story Dependencies

| Story | Depends on | Independent test uses |
| --- | --- | --- |
| US1 (P1) | Foundational | UI and hook |
| US2 (P1) | Foundational, and US1 for `Ground`, `TopBar` and scene wiring | Hook seeds the track |
| US3 (P1) | Foundational, and US1 for `TopBar` | Hook seeds the pieces |
| US7 (P1) | US1, US2, US3 | Hook and test ids |
| US4 (P2) | US1, US3 | UI |
| US5 (P2) | US1, US2 | UI and sound log |
| US6 (P3) | US1, US3 | UI |

### Within Each User Story

- Domain before store, store before UI, and UI wiring last.
- A story is finished only when its tests pass.

### Shared Files

These files are edited by several tasks, so those tasks MUST NOT run at the same time:

- `src/store/gameStore.ts`: T019, T056, T064, T077, T097, T098, T100
- `src/ui/TopBar.tsx`: T048, T060, T069, T078, T099
- `src/interaction/keyboard.ts`: T047, T059, T077, T097
- `src/scene/PlayfieldCanvas.tsx`: T025, T049, T060, T093, T099, T100
- `src/testing/testHook.ts`: T020, T057, T072
- `src/audio/audioEngine.ts`: T018, T086
- `src/ui/Palette.tsx`: T046, T088
- `src/ui/Playfield.tsx`: T026, T049, T087
- `src/ui/MainMenu.tsx`: T024, T067, T087
- `src/ui/DioramaEntry.tsx`: T066, T100
- `src/scene/PieceNode.tsx`: T037, T089
- `src/scene/DragGhost.tsx`: T044, T090
- `tests/e2e/fixtures.ts`: T008, T104
- `src/scene/Ground.tsx`: T039, T075
- `src/scene/ContactShadows.tsx`: T038, T092
- `src/scene/TrainView.tsx`: T058, T093

### Parallel Opportunities

- Setup: T005 to T010 after T001.
- Foundational: T013, T017, T021 and T022 together, then T028 to T031.
- After Foundational, US1, the persistence and store work of US3 (T063 to T068), and the domain work of US2 (T053 to T055) can proceed together.
- All tests marked [P] within a story can start together.
- Asset sourcing (T033, T074, T081, T082) can run alongside any code.

---

## Parallel Example: User Story 1

```bash
# Start independent scene pieces together:
Task: "Create src/scene/Ground.tsx with the Bedroom floor surface"
Task: "Create src/scene/GridOverlay.tsx and src/scene/TileHighlight.tsx"
Task: "Create src/scene/CameraRig.tsx with drei CameraControls"
Task: "Create src/scene/SelectionOutline.tsx and src/scene/OpenEndMarkers.tsx"
```

## Parallel Example: User Story 2

```bash
# Write tests alongside the pure domain code:
Task: "Add tests/unit/route.test.ts"
Task: "Add tests/unit/trainSim.test.ts"
Task: "Add tests/e2e/play.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Run the US1 independent test. This is a demo of the build experience, not a complete app.

### Incremental Delivery

1. Setup + Foundational: rules, store, hook and shell.
2. US1: building works.
3. US2: the train runs.
4. US3: work persists.
5. US7: the contract is verified.
6. US4 and US5: the full look, feel and sound.
7. US6: Should and Could items, only if no Must is at risk.
8. Polish: whole-app verification against `requirement.md` Section 13.

The app is complete only after every Must is met, which needs all of US1, US2, US3, US4, US5 and US7. US6 contains no Must.

---

## Notes

- [P] tasks touch different files and have no dependencies on incomplete tasks.
- Commit only when the user asks, and never push or change a git remote.
- Work only inside the project folder.
- If a decision is not covered, make a reasonable choice and record it in research.md.
- Avoid adding runtime dependencies, editing `requirement.md`, or moving rule logic out of `src/domain/`.
