---

description: "Task list for Track, a wooden train diorama builder"
---

# Tasks: Track, a Wooden Train Diorama Builder

**Input**: Design documents from `specs/001-track-diorama-builder/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included, because SC-002 and User Story 7 require automated checks and the plan and quickstart
name `npm test` and `npm run test:e2e`. Write each story's tests first and confirm they fail before
implementing.

**Organization**: Tasks are grouped by user story, in the spec's priority order.

**Sources**: `requirement.md` is the source of truth and must not be edited. "R5" means that decision in
`research.md`. FR and SC numbers refer to `spec.md`. Keep to `.specify/memory/constitution.md`: a runtime
dependency may come only from the Section 3 allowlist.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: The user story the task belongs to (US1 to US7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prove the toolchain and create the project skeleton

- [X] T001 Create `package.json` with the R1 versions, holding `react` and `react-dom` to `~19.3.1`, runtime dependencies limited to R1's runtime list plus `@radix-ui/react-alert-dialog`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-toggle` and `@radix-ui/react-slot`, and scripts `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test` (`vitest run`) and `test:e2e` (`playwright test`); then run `npm install` and confirm no peer dependency errors, using the Node.js version in `.nvmrc`
- [X] T002 Create `tsconfig.json` (strict, `@/` alias to `src/`) and `vite.config.ts` (React and Tailwind plugins, same alias)
- [X] T003 Create `index.html` with the title "Track", `src/main.tsx`, a placeholder `src/App.tsx`, and `src/index.css` importing Tailwind with colour tokens from the Section 7.1 palette (cream, honey wood, sage, dusty blue, terracotta; no pure black, pure white or neon) and the R14 font stack; run `npm run build`, and if a tool fails on TypeScript 7, fall back to 5.x and update R1 in `specs/001-track-diorama-builder/research.md`
- [X] T004 [P] Create `components.json` set to the Radix base, and `src/lib/utils.ts` with a `cn` that joins truthy class names, using neither `clsx` nor `tailwind-merge` (R2)
- [X] T005 [P] Configure Vitest in `vitest.config.ts`, and add `tests/unit/dependencies.test.ts`, which fails if `package.json` `dependencies` contains anything outside react, react-dom, three, @react-three/fiber, @react-three/drei, zustand, @radix-ui/*, @react-spring/three, howler, nanoid and tone
- [X] T006 [P] Create `playwright.config.ts` with Chromium, Firefox and WebKit projects, software WebGL flags for headless Chromium, `process.env.PLAYWRIGHT_BROWSERS_PATH = '0'` so browsers stay inside the project (R16), and a web server for the production preview; add `tests/e2e/helpers/app.ts` with helpers to open `/?test=1`, read the hook, and convert a tile to screen coordinates from the default camera (R4)
- [X] T007 [P] Create `public/assets/models/.gitkeep`, `public/assets/textures/.gitkeep`, `public/assets/audio/sfx/.gitkeep` and `public/assets/audio/music/.gitkeep`, and add `.asset-downloads/` to `.gitignore` for temporary downloads

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain types, placement rules, store, shared UI and the app shell

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Define the Section 9 types exactly as written, plus the hook reason code and sound event unions from Section 10.2, in `src/domain/types.ts` (FR-086, FR-093)
- [X] T009 [P] Create `src/domain/catalogue.ts` with one entry per Section 6 item, fields as in `data-model.md` "Static catalogue": `type`, `kind`, `footprint` (`[1, 1]`, or `[2, 2]` for the hill), `connectors` and `height`
- [X] T010 [P] Create `src/domain/grid.ts` with tile-to-world conversion (tile centre at x = gridX − 7.5, z = gridZ − 7.5), tile keys, a piece's occupied tiles (hill anchor is its north-west tile, plus the tiles east, south and south-east, unaffected by rotation), and occupancy building (FR-039, FR-046)
- [X] T011 [P] Write `tests/unit/grid.test.ts` and `tests/unit/rules.test.ts`, covering every reason code, the validation order and hill self-overlap, and confirm they fail
- [X] T012 Implement `validatePlacement` in `src/domain/rules.ts`, returning the first failure in this order from `data-model.md`: `play_mode`; `not_found`; any tile off the grid or not an integer `out_of_bounds`; `station_limit`; a decoration over any track tile `on_track`; any other tile held by a different piece `occupied`; a move ignores the moving piece's own tiles (FR-046 to FR-050)
- [X] T013 [P] Create `src/audio/soundLog.ts` with `emitSound(event)` and `getSoundLog()`, which returns a copy; it records events even while muted or before the first interaction, and has a replaceable playback handler that does nothing until T095
- [X] T014 Create the single store in `src/store/gameStore.ts` with Section 9 `GameState` and the "Extra store fields" from `data-model.md`, including `undoStack`, `redoStack` as "Snapshots, capped at 50; emptied on open", `toast` as "One toast at a time, replaced by the next", and `showToast` with a 3-second auto-clear
- [X] T015 [P] Adapt shadcn source into `src/components/ui/button.tsx`, `src/components/ui/toggle.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/tooltip.tsx` and `src/components/ui/native-select.tsx`, using plain variant objects and the token colours, with a visible focus ring on every control (R2, R3, FR-090)
- [X] T016 [P] Create `src/components/icons.tsx` with one consistent inline SVG set: one icon per catalogue item plus the toolbar, audio and menu icons (R2, FR-042)
- [X] T017 Create `src/features/overlay/Toast.tsx` with `data-testid="toast"` and `role="status"`, present only while a message shows
- [X] T018 Create `src/features/menu/MainMenu.tsx` with `main-menu`, an `h1` reading "Track" and a `new-diorama` button that opens an empty playfield; update `src/App.tsx` to switch on `screen`, lazy-load `src/features/overlay/PlayfieldScreen.tsx` and prefetch it after the menu paints, so the entry chunk has no Three.js (R11, FR-001)
- [X] T019 Create `src/testing/testHook.ts`, attaching `window.__DIORAMA__` with `getState` and `getSoundLog` only when `import.meta.env.DEV` is true or the URL's `test` parameter equals `1`, and install it from `src/main.tsx` (FR-084)

**Checkpoint**: The app opens on a menu, `npm test` runs, and the hook is correctly gated

---

## Phase 3: User Story 1 - Build a diorama on the grid (Priority: P1) 🎯 MVP

**Goal**: Place tracks and decorations on the grid with tactile motion, valid and invalid feedback, and a working camera

**Independent Test**: Open a new diorama, drag and click palette items onto the grid and try invalid placements; a usable layout builder results, with no train, saving or audio

### Tests for User Story 1

> Write these first and confirm they fail

- [X] T020 [P] [US1] Write `tests/unit/pointerMath.test.ts` and `tests/unit/picking.test.ts`, covering nearest-tile rounding, off-grid results, and a tall piece winning over the tile behind it
- [X] T021 [P] [US1] Write `tests/e2e/us1-build.spec.ts` for spec US1 acceptance scenarios 1 to 6 with real pointer input: palette drag, click placement, red and green ghost state, invalid drop, Escape, and Reset view

### Implementation for User Story 1

- [X] T022 [P] [US1] Download CC0 wood textures from ambientCG into `.asset-downloads/`, confirm each licence on its asset page, copy resized versions of 1024 × 1024 or smaller to `public/assets/textures/`, delete the download folder, and start `CREDITS.md` with each file's path, title, author, source URL and licence (R13, FR-079, FR-081)
- [X] T023 [P] [US1] Create `src/scene/geometry/materials.ts` with one shared instance of each material: wood with visible grain and roughness 0.6 or higher, matte paint, felt and slightly glossy plastic, with no mirror reflections (FR-041)
- [X] T024 [P] [US1] Create `src/scene/geometry/parts.ts` with the shared `PieceParts` interface (geometry per material key), and `src/scene/geometry/tracks.ts` building `straight`, `curve`, `tunnel`, `station` and `buffer` to the Section 6 sizes and connectors, with bevelled edges, two grooves, a quarter circle of radius 0.5 around the south-east corner, a tunnel shell taller and wider than the train, and a stop block at the buffer's north side (FR-038, FR-060)
- [X] T025 [P] [US1] Create `src/scene/geometry/decorations.ts` building the 7 decorations to the Section 6 sizes, including the cassette at 0.68 × 0.43 × 0.08 tiles, the car at about 0.5 × 0.3 tiles, the hill at about 0.6 tiles high on its 2 × 2 footprint, and 3 lettered blocks using a canvas texture rather than drei `Text` (R8, FR-038, FR-039)
- [X] T026 [US1] Implement ray-to-ground-plane tile mapping in `src/interaction/pointerMath.ts` (R5)
- [X] T027 [US1] Implement nearest-hit box picking from footprint and `height` in `src/interaction/picking.ts` (R5)
- [X] T028 [US1] Create `src/store/commands.ts` with `selectTool`, `placePiece`, `beginPaletteDrag`, `updateDragTarget`, `dropDrag` and `cancelDrag`, validating with `validatePlacement`, adding exactly one entry per placement, marking the diorama unsaved, and emitting `pickup`, `place` and `invalid` per `contracts/test-hook.md`; a palette drop plays `place` (FR-019, FR-021 to FR-023, FR-025, FR-061)
- [X] T029 [US1] Create `src/scene/PlayfieldCanvas.tsx` (full-viewport canvas, `dpr={[1, 1.5]}`, shadows on), `src/scene/Lighting.tsx` (one directional shadow light with a 1024 map plus ambient fill) and `src/scene/CameraRig.tsx` (drei `CameraControls`, left `NONE`, middle `TRUCK`, right `ROTATE`, wheel `DOLLY`, polar 20° to 80°, distance 4 to 30, `setBoundary` over the grid, default target at the origin, polar 50°, distance 21, `reset(true)` for Reset view, context menu suppressed) (R4, FR-015 to FR-017, FR-044)
- [X] T030 [US1] Create `src/scene/Grid.tsx` with subtle 16 × 16 lines centred on the origin and the hovered-tile highlight, and a default floor in `src/scene/Settings/Ground.tsx` (FR-013, FR-014)
- [X] T031 [US1] Create `src/scene/PieceBatches.tsx` with one `InstancedMesh` per piece type and material part, excluding pieces in the active tier (R6)
- [X] T032 [US1] Create `src/scene/ContactShadowQuads.tsx`, drawing a soft radial quad under each piece in one instanced draw call (R7, FR-044)
- [X] T033 [US1] Create `src/scene/ActivePiece.tsx` and `src/scene/Ghost.tsx` with the pure motion module `src/scene/pieceMotion.ts` (R9, changed from `@react-spring/three`): lift 0.3 tiles within 150 ms with the shadow softening and spreading; drag follow settling within 250 ms with tilt up to 8°; valid drop under 300 ms; invalid drop shake of about 200 ms, then disappearing if it came from the palette; green and red ghost tints, including the hover ghost while a tool is selected (R9, FR-024, FR-045)
- [X] T034 [US1] Create `src/interaction/useBoardInteraction.ts`, one `window` pointer controller with a 4 px drag threshold: palette drags, click placement, tile hover, off-grid and over-overlay release counted as off the grid, and hover suppressed during camera drags, following the mouse table in `contracts/ui-and-input.md` (R5, FR-021 to FR-023)
- [X] T035 [US1] Create `src/interaction/keyboard.ts`, ignoring keys while a text field has focus or a dialog is open, with Escape (cancel the drag silently, else deselect the tool) and R rotating the ghost (FR-026, FR-029)
- [X] T036 [US1] Create `src/features/overlay/Palette.tsx` with Tracks and Decorations groups, all 12 items with name and icon, `palette-<type id>` ids, a highlighted selected item, and the station disabled with a tooltip on a wrapper while a station exists (FR-018, FR-019, FR-049)
- [X] T037 [US1] Create `src/features/overlay/PlayfieldScreen.tsx` (`playfield` with `data-mode`, canvas, a `pointer-events: none` overlay root) and `src/features/overlay/Toolbar.tsx` with `reset-view` (FR-017, FR-043)
- [X] T038 [US1] Add `placePiece` to `src/testing/testHook.ts`, calling the same command with no `pickup` (FR-050, FR-085)

**Checkpoint**: A full layout can be built by hand, and all US1 tests pass

---

## Phase 4: User Story 2 - Refine the layout and connect tracks (Priority: P1)

**Goal**: Select, move, rotate, delete and undo, with connections, snap and open-end markers

**Independent Test**: Place several tracks, then move, rotate and delete them and watch connections and open-end markers update

### Tests for User Story 2

> Write these first and confirm they fail

- [X] T039 [P] [US2] Write `tests/unit/connectors.test.ts` and `tests/unit/autoAdjust.test.ts`, covering all track types at all rotations, the N → E → S → W rotation, open ends, first-clockwise choice, and the "no connection to any neighbour" rule
- [X] T040 [P] [US2] Write `tests/unit/commands.test.ts`, covering move, rotate, delete, one undo step per action including auto-adjust, at least 20 undo steps, redo, and `snap` emitted once after the primary sound
- [X] T041 [P] [US2] Write `tests/e2e/us2-edit.spec.ts` for spec US2 acceptance scenarios 1 to 7

### Implementation for User Story 2

- [X] T042 [US2] Implement connector rotation, connections (each pair once) and open ends in `src/domain/connectors.ts` (FR-032, FR-033, FR-035)
- [X] T043 [US2] Implement the first-clockwise rotation search in `src/domain/autoAdjust.ts`, applying only when the track would have no connection to any neighbour and a neighbour has an open end facing it (FR-034)
- [X] T044 [US2] Add `selectPiece`, `beginBoardDrag`, `movePiece`, `rotatePiece` and `removePiece` to `src/store/commands.ts`; apply auto-adjust on palette and board drops and on `placePiece` with no rotation; emit `move`, `rotate` and `delete`, then `snap` once when a new connection forms; a board drop plays `move`; a drop on the same tile with unchanged rotation changes nothing (FR-027 to FR-030, FR-036, FR-037)
- [X] T045 [US2] Add `undo` and `redo` to `src/store/commands.ts`, snapshotting pieces with a cap of 50, silent, doing nothing in Play mode, and with setting and start facing not recorded (FR-031)
- [X] T046 [US2] Extend `src/interaction/useBoardInteraction.ts` with picking-based selection, board drags, piece hover and clearing the selection on an empty tile, per `contracts/ui-and-input.md`; a left click on a piece while a tool is selected is an invalid placement (FR-027, FR-028)
- [X] T047 [US2] Extend `src/interaction/keyboard.ts` with R on the selected piece, Delete and Backspace, Ctrl or Cmd+Z, Ctrl or Cmd+Shift+Z, and Escape clearing the selection (FR-029 to FR-031)
- [X] T048 [US2] Extend `src/scene/ActivePiece.tsx` with the honey-coloured drei `Outlines` selection, 0.05-tile hover rise and pointer cursor, 150 ms ease-out rotate, 200 ms shrink-and-fade delete, and return to the previous tile and rotation after a shake; undo and redo apply instantly (R8, R9, FR-027, FR-028, FR-045)
- [X] T049 [P] [US2] Create `src/scene/OpenEndMarkers.tsx`, an instanced marker at each open end, shown in Build mode only (FR-035)
- [X] T050 [US2] Add `delete-piece` to `src/features/overlay/Toolbar.tsx`, enabled only with a selected piece (FR-030)
- [X] T051 [US2] Add `movePiece`, `rotatePiece`, `removePiece` and `getConnections` to `src/testing/testHook.ts` (FR-085)

**Checkpoint**: US1 and US2 work together, and all their tests pass

---

## Phase 5: User Story 3 - Play with the train (Priority: P1)

**Goal**: Run a locomotive and two carriages in Auto and Manual, then park at the station

**Independent Test**: Build a closed loop and a dead-end line, each with a station, then watch Auto, drive in Manual and return to Build

### Tests for User Story 3

> Write these first and confirm they fail

- [X] T052 [P] [US3] Write `tests/unit/route.test.ts`, covering lines, loops, each start facing, unconnected tracks being ignored, and rotated stations
- [X] T053 [P] [US3] Write `tests/unit/trainSim.test.ts`, covering the `data-model.md` limits table for L ≥ 2.95 and L < 2.95, the lone station, Auto stop, 1-second pause and reversal, Manual speeds, W and S together, 0.25 s step clamping, and loops never stopping
- [X] T054 [P] [US3] Write `tests/e2e/us3-train.spec.ts` for spec US3 acceptance scenarios 1 to 8

### Implementation for User Story 3

- [X] T055 [US3] Implement per-piece paths in `src/domain/trackPaths.ts`: length 1 for `straight`, `tunnel` and `station`, quarter circle of radius 0.5 and π/4 for `curve`, and 0.8 for `buffer`
- [X] T056 [US3] Implement `buildRoute` in `src/domain/route.ts` per `data-model.md` "Route", including straight continuation past line ends for overhanging carriages
- [X] T057 [US3] Implement the simulation in `src/domain/trainSim.ts` with the `data-model.md` vehicle offsets, limits and motion table: Auto cruise 1.5, accelerate 5, brake 3; Manual cruise 2, accelerate 2.5, brake 5; speed capped at `sqrt(2 × brake × distance)` near a limit; a 1-second pause then direction flip in Auto; time steps clamped to 0.25 s; `speed` always 0 or more (FR-056, FR-058, FR-059)
- [X] T058 [US3] Create `src/train/runtime.ts` holding `TrainRuntime`, with `startTrain`, `parkTrain`, `stepTrain` and `getTrainSnapshot`; `progress` runs from 0 to 1 in the +s direction across the current piece; `getTrainSnapshot` returns `null` with no station, and in Build mode the station, progress 0.5, not moving, `forward`, speed 0
- [X] T059 [US3] Add `setMode`, `setDriveMode` and `flipStartFacing` to `src/store/commands.ts`: entering Play synchronously sets `driveMode` to `auto`, clears the tool, selection and drag, and starts the train; no station returns `no_station` and shows "Place a station to start"; leaving Play parks the train; setting the current mode changes nothing; emit `whistle` on entering Play, and `chug` and `bump` from the runtime (FR-053 to FR-055, FR-061, FR-062, FR-071)
- [X] T060 [P] [US3] Create `src/scene/geometry/train.ts` with a locomotive about 0.9 tiles long and carriages about 0.8 tiles long, low enough to fit under the tunnel shell (FR-040)
- [X] T061 [US3] Create `src/scene/Train.tsx`, stepping the runtime in `useFrame` and setting each vehicle from two points 0.3 tiles either side of its centre, parked at the station in Build mode with no React state per frame (FR-051, FR-052, FR-056, FR-060)
- [X] T062 [US3] Extend `src/interaction/keyboard.ts` with F in Build mode and held W and S in Manual, with W and S together counting as no key, and held keys cleared on window blur (FR-053, FR-059)
- [X] T063 [US3] Add `mode-toggle`, `drive-toggle` and `flip-direction` to `src/features/overlay/Toolbar.tsx`, and disable the palette in Play mode in `src/features/overlay/Palette.tsx`, per the controls table in `contracts/ui-and-input.md` (FR-020, FR-053, FR-055, FR-057)
- [X] T064 [US3] Fade the grid and hide open-end markers, tile highlight, piece hover and ghost in Play mode in `src/scene/Grid.tsx`, `src/scene/OpenEndMarkers.tsx` and `src/interaction/useBoardInteraction.ts`, and block every edit input there (FR-013, FR-061)
- [X] T065 [US3] Add `setMode`, `setDriveMode` and `getTrain` to `src/testing/testHook.ts` (FR-085)

**Checkpoint**: All three P1 stories work: build, connect and play

---

## Phase 6: User Story 4 - Save, reopen and manage dioramas (Priority: P2)

**Goal**: Keep a collection of dioramas that survives reloads, with no accidental loss

**Independent Test**: Create and save two dioramas, reload, reopen, rename and delete them, and try leaving with unsaved changes

### Tests for User Story 4

> Write these first and confirm they fail

- [X] T066 [P] [US4] Write `tests/unit/naming.test.ts` and `tests/unit/saveRepository.test.ts`, covering every row of the `contracts/storage.md` reading table, the merge steps, keeping unreadable entries, the `:corrupt` copy and write failure
- [X] T067 [P] [US4] Write `tests/e2e/us4-persistence.spec.ts` for spec US4 acceptance scenarios 1 to 8, including that corrupt data causes no crash and readable entries stay usable (SC-009)

### Implementation for User Story 4

- [X] T068 [P] [US4] Implement `src/domain/naming.ts`: names "Trimmed, 1 to 40 characters"; default name `Untitled diorama`, "then the lowest free number from 2 upward, against saved names" (FR-003, FR-005)
- [X] T069 [US4] Implement hand-written validators in `src/persistence/validators.ts` per `contracts/storage.md`, with `gridX` and `gridZ` as "Integers from 0 to 15", rotations limited to 0, 90, 180 and 270, parseable dates, the name rule, and the placement rules applied to each entry's pieces (R15, FR-068)
- [X] T070 [US4] Implement `src/persistence/saveRepository.ts` under `wooden-diorama:v1` with the `contracts/storage.md` reading table and five write steps, using `console.warn` and never `console.error`; `updatedAt` is "Set on save, autosave and rename" and `createdAt` is "Set on first save, then never changed" (FR-063, FR-064, FR-068, FR-093)
- [X] T071 [US4] Add `newDiorama`, `openDiorama`, `saveDiorama`, `requestBackToMenu`, `renameDiorama` and `deleteDiorama` to `src/store/commands.ts`: a new diorama uses Bedroom floor, facing 0 and `dioramaId` `null` until its first save; opening clears undo; a save shows a toast; a failed save shows a toast and keeps `isDirty` true (FR-003, FR-004, FR-006, FR-011, FR-054, FR-063, FR-065, FR-066)
- [X] T072 [US4] Extend `src/features/menu/MainMenu.tsx` and create `src/features/menu/DioramaRow.tsx`: `diorama-list` shown only with entries, `diorama-item` with `data-diorama-id`, name and last-edited date, newest first, `diorama-open`, `diorama-rename`, `diorama-delete`, and an empty state prompting the user to create one (FR-002, FR-007)
- [X] T073 [US4] Create `src/features/dialogs/ConfirmDialog.tsx`, `src/features/dialogs/RenameDialog.tsx` and `src/features/dialogs/UnsavedDialog.tsx` per the dialog table in `contracts/ui-and-input.md`: `confirm-ok`, `confirm-discard` and `rename-input` with no length cap, with refused names keeping the dialog open and showing an inline message (FR-005, FR-006, FR-065)
- [X] T074 [US4] Add `save-button` and `back-to-menu` to `src/features/overlay/Toolbar.tsx`, and show the diorama name in the overlay (FR-063, FR-065)
- [X] T075 [US4] Create `src/store/autosave.ts`, running every 30 seconds in Build mode only, saving only if `isDirty` is true and no drag is active, and showing the normal toast (FR-067)
- [X] T076 [US4] (Could) Capture a small thumbnail at save in `src/scene/PlayfieldCanvas.tsx`, store it on the diorama, show it in `src/features/menu/DioramaRow.tsx`, and retry a failed write once without it (FR-008)

**Checkpoint**: Work persists across reloads, and corrupt data cannot crash the app

---

## Phase 7: User Story 7 - Verify the app automatically (Priority: P2)

**Goal**: Prove the Section 10 contract exactly as written

**Independent Test**: With `?test=1`, drive the hook and confirm results match the UI's rules; confirm the hook is absent from a production build without it

### Tests for User Story 7

- [X] T077 [P] [US7] Write `tests/e2e/us7-hook.spec.ts`, covering each hook method, each row of the `contracts/test-hook.md` actions table, each reason code, omitted and given `rotation`, and synchronous results (FR-085, FR-086)
- [X] T078 [P] [US7] Write `tests/e2e/us7-testids.spec.ts`, asserting every Section 10.1 id exists on its screen, plus `data-diorama-id` and `data-mode` (FR-083)
- [X] T079 [P] [US7] Write `tests/e2e/us7-gating.spec.ts`, confirming a production build has no hook without `?test=1` and has it with `?test=1` (FR-084)

### Implementation for User Story 7

- [X] T080 [US7] Fix every gap the tests found in `src/testing/testHook.ts` and the commands it calls, including an unknown `type` returning `not_found`, and confirm `getState()` has all Section 9 fields under their exact names (FR-093)

**Checkpoint**: The Section 10 contract passes in full

---

## Phase 8: User Story 5 - Choose a setting (Priority: P3)

**Goal**: Switch between Bedroom floor and Kitchen table without disturbing the layout

**Independent Test**: Build a small layout, switch settings back and forth, save and reopen

### Tests for User Story 5

- [X] T081 [P] [US5] Write `tests/e2e/us5-setting.spec.ts` for spec US5 acceptance scenarios, confirming no piece moves and the setting persists

### Implementation for User Story 5

- [X] T082 [P] [US5] Download CC0 floorboard, tabletop and fabric textures from ambientCG as in T022 into `public/assets/textures/`, and add them to `CREDITS.md`
- [X] T083 [P] [US5] Create `src/scene/Settings/BedroomFloor.tsx` with warm floorboards, a soft rug and edge props such as a chair leg, all props outside the grid (FR-012)
- [X] T084 [P] [US5] Create `src/scene/Settings/KitchenTable.tsx` with a tabletop and edge props such as a fruit bowl, all props outside the grid (FR-012)
- [X] T085 [US5] Create `src/scene/Settings/SettingScene.tsx` to crossfade ground and props within 1 second, and extend `src/scene/Lighting.tsx` to ease to cool daylight for Bedroom floor or warmer light for Kitchen table (FR-010)
- [X] T086 [US5] Add a `setSetting` command to `src/store/commands.ts`, marking the diorama unsaved, and add `setting-select` to `src/features/overlay/Toolbar.tsx` as a native select with values `bedroom` and `kitchen`, labelled "Bedroom floor" and "Kitchen table", available in both modes (FR-009, FR-011)

**Checkpoint**: Both settings work and persist

---

## Phase 9: User Story 6 - Hear the toy come alive (Priority: P3)

**Goal**: Every action has a sound, with music and persistent volume controls

**Independent Test**: Perform each build and play action and listen, adjust volume, reload and confirm the settings persisted

### Tests for User Story 6

- [X] T087 [P] [US6] Write `tests/unit/audioSettings.test.ts`, covering defaults, unreadable data and clamping to 0 to 1
- [X] T088 [P] [US6] Write `tests/e2e/us6-audio.spec.ts` for spec US6 acceptance scenarios that can be automated: no playback before interaction, the sound log order, controls on both screens, and persistence across a reload

### Implementation for User Story 6

- [X] T089 [P] [US6] Implement `src/persistence/audioSettings.ts` under `wooden-diorama:audio` with `muted` "default false", `musicVolume` "0 to 1, default 0.5" and `sfxVolume` "0 to 1, default 0.8", falling back to defaults on unreadable data (FR-075)
- [X] T090 [P] [US6] Source `.mp3` effects from OpenGameArt, CC0 or CC-BY only, confirming each licence on its page: pick up, place, move, rotate, delete, snap, invalid, UI click, whistle, chug loop and bump, with wood-on-wood sounds for place, snap and rotate, trimmed of leading silence, into `public/assets/audio/sfx/`, and add them to `CREDITS.md`; list any sound not found for T092 (FR-069 to FR-071, FR-079, FR-081)
- [X] T091 [P] [US6] Source one cozy looping music track from OpenGameArt, CC0 or CC-BY only, 5 MB or less, not from any commercial game, into `public/assets/audio/music/`, and add it to `CREDITS.md`; if none is suitable, record that for T093 (FR-073, FR-079, FR-081)
- [X] T092 [US6] Implement Web Audio synthesis for any sound missing after T090 in `src/audio/synthSfx.ts`, keeping place and delete clearly different, and note it in `CREDITS.md` (FR-069, FR-082)
- [X] T093 [US6] If no music file exists after T091, implement generated music in `src/audio/musicFallback.ts`, imported dynamically so `tone` stays out of the main bundle, and note it in `CREDITS.md` (R12, FR-073, FR-082). Outcome: not needed, a sourced track exists, so `tone` was removed
- [X] T094 [US6] Create `src/audio/audioEngine.ts` per R12: effects preloaded with Howler in Web Audio mode, music with `html5: true` and looping, nothing passed to Howler until the first `pointerdown` or `keydown`, with mute and separate volumes applied (FR-073, FR-074, FR-076)
- [X] T095 [US6] Connect `src/audio/soundLog.ts` to the engine as its playback handler, add `ui` to `src/components/ui/button.tsx` and `src/components/ui/toggle.tsx`, and update chug volume from train speed in `src/scene/Train.tsx` (FR-071, FR-072)
- [X] T096 [US6] Create `src/features/overlay/AudioControls.tsx` with `mute-toggle`, `music-volume` and `sfx-volume` as range inputs from 0 to 100 stored as 0 to 1, and show it in `src/features/menu/MainMenu.tsx` and `src/features/overlay/PlayfieldScreen.tsx` (FR-075)

**Checkpoint**: All user stories work with sound

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Prove the measurable limits and finish delivery

- [X] T097 Add `low-quality-toggle` and a `setLowQuality` command in `src/features/overlay/Toolbar.tsx`, `src/store/commands.ts` and `src/scene/PlayfieldCanvas.tsx`: turn off shadow casting and contact quads, and lower the pixel ratio to 0.75 (FR-078)
- [X] T098 [P] Write `tests/e2e/overlay-limits.spec.ts`: panels sum to 25% of the viewport or less at 1920 × 1080 and 1280 × 720, every control has an accessible name and can be reached by keyboard with a visible focus ring, and the whole grid is visible by default (FR-043, FR-090, SC-011, SC-014)
- [X] T099 [P] Write `tests/e2e/full-session.spec.ts`: a full build, play, save, reload and reopen session with all 12 items and both settings, failing on any console error (FR-089, SC-008, SC-010)
- [X] T100 Using `chrome-devtools`, trace 100 placed pieces at 1920 × 1080 in Build and Play, fix anything under 30 fps in `src/scene/`, and confirm the limits in FR-077; record the real GPU used in `README.md`
- [X] T101 Create `scripts/check-budgets.mjs`, checking that `public/assets` is under 20 MB, per-file budgets hold, the entry chunk has no Three.js, startup downloads are within 4 MB and `tone` is not in the main bundle; throttle to 25 Mbps with an empty cache and confirm the user can build within 5 seconds (R11, FR-077, FR-081, SC-005, SC-006)
- [X] T102 Audit Section 7.1 in `src/index.css`, `src/components/ui/` and `src/scene/geometry/materials.ts`, removing pure black, pure white or neon including library defaults, and review screenshots of both settings against SC-013, improving `src/scene/geometry/` if the result looks flat or generic (FR-041, FR-042)
- [X] T103 Check every Section 7.2 timing against a performance trace, and adjust `src/scene/ActivePiece.tsx` until each passes (FR-045, SC-012)
- [X] T104 Run `npm run test:e2e` in Chromium, Firefox and WebKit, fixing browser-specific failures in `src/`; verify `npm install`, `npm run dev` and `npm run build` from a fresh clone (FR-087, FR-088, SC-015)
- [X] T105 [P] Complete `CREDITS.md`: every asset with file path, title, author, source URL and licence, and the fallback note for models, Section 8's required record (FR-080, FR-082)
- [X] T106 [P] Rewrite `README.md` with how to run the app, all controls and known limitations, including a WebGL-capable browser, the GPU actually tested and any browser check that could not run on real Safari (FR-091)
- [X] T107 Run every scenario in `specs/001-track-diorama-builder/quickstart.md`, confirm each Must in `requirement.md` passes and nothing from Section 12 was added, and fix any failures (FR-092, SC-001, SC-002, SC-003, SC-004, SC-007)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup, and blocks all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 for the scene, commands and interaction controller
- **US3 (Phase 5)**: Depends on US2 for connectors
- **US4 (Phase 6)**: Depends on Foundational and US1; independent of US2 and US3, though it saves their data
- **US7 (Phase 7)**: Depends on US1, US2, US3 and US4, because it tests the whole contract
- **US5 (Phase 8)**: Depends on US1; independent of the other stories
- **US6 (Phase 9)**: Depends on US1 and the sound events from US2 and US3
- **Polish (Phase 10)**: Depends on all stories

### Within Each Story

- Write tests first and confirm they fail
- Domain logic comes before store commands, then scene and interaction, then overlay, then the hook
- `src/store/commands.ts`, `src/testing/testHook.ts` and `src/features/overlay/Toolbar.tsx` are edited by several tasks, so those tasks run one at a time

### Parallel Opportunities

After US1, US4 and US5 can run in parallel. US2, then US3, form a chain.

```text
Phase 1:  T004, T005, T006, T007
Phase 2:  T009, T010, T011, T013, then T015, T016
US1:      T020, T021, T022, T023, T024, T025
US2:      T039, T040, T041, T049
US3:      T052, T053, T054, T060
US4:      T066, T067, T068
US7:      T077, T078, T079
US5:      T081, T082, T083, T084
US6:      T087, T088, T089, T090, T091
Polish:   T098, T099, T105, T106
```

## Implementation Strategy

### MVP First

1. Complete Phases 1 and 2.
2. Complete US1, then stop and validate: a working layout builder.
3. US2 and US3 complete the core toy: build, connect and play. This is the first version worth showing.

### Incremental Delivery

1. Add US4 so work persists.
2. Add US7 to lock the contract before more features land.
3. Add US5 and US6 for character and sound.
4. Finish with Polish, where the measurable limits are proven.

The story priorities order the work only. Definition of done still needs every Must, so all phases are required except the tasks marked (Could).

## Requirement Coverage

| FR | Tasks | FR | Tasks |
| --- | --- | --- | --- |
| FR-001 | T018 | FR-048 | T012 |
| FR-002 | T072 | FR-049 | T012, T036 |
| FR-003 | T068, T071 | FR-050 | T012, T038 |
| FR-004 | T071 | FR-051 | T061 |
| FR-005 | T068, T073 | FR-052 | T061 |
| FR-006 | T071, T073 | FR-053 | T059, T062, T063 |
| FR-007 | T072 | FR-054 | T059, T071 |
| FR-008 | T076 | FR-055 | T059, T063 |
| FR-009 | T086 | FR-056 | T057, T061 |
| FR-010 | T085 | FR-057 | T063 |
| FR-011 | T071, T086 | FR-058 | T057 |
| FR-012 | T083, T084 | FR-059 | T057, T062 |
| FR-013 | T030, T064 | FR-060 | T024, T061 |
| FR-014 | T030 | FR-061 | T028, T059, T064 |
| FR-015 | T029 | FR-062 | T059 |
| FR-016 | T029 | FR-063 | T070, T071, T074 |
| FR-017 | T029, T037 | FR-064 | T070 |
| FR-018 | T036 | FR-065 | T071, T073, T074 |
| FR-019 | T028, T036 | FR-066 | T071 |
| FR-020 | T063 | FR-067 | T075 |
| FR-021 | T028, T034 | FR-068 | T069, T070 |
| FR-022 | T028, T034 | FR-069 | T090, T092 |
| FR-023 | T028, T034 | FR-070 | T090 |
| FR-024 | T033 | FR-071 | T059, T090, T095 |
| FR-025 | T028 | FR-072 | T095 |
| FR-026 | T035 | FR-073 | T091, T093, T094 |
| FR-027 | T044, T046, T048 | FR-074 | T094 |
| FR-028 | T044, T046, T048 | FR-075 | T089, T096 |
| FR-029 | T035, T044, T047 | FR-076 | T094 |
| FR-030 | T044, T047, T050 | FR-077 | T100, T101 |
| FR-031 | T045, T047 | FR-078 | T097 |
| FR-032 | T042 | FR-079 | T022, T090, T091 |
| FR-033 | T042 | FR-080 | T105 |
| FR-034 | T043 | FR-081 | T022, T090, T091, T101 |
| FR-035 | T042, T049 | FR-082 | T092, T093, T105 |
| FR-036 | T044 | FR-083 | T078 |
| FR-037 | T044 | FR-084 | T019, T079 |
| FR-038 | T024, T025 | FR-085 | T038, T051, T065, T077 |
| FR-039 | T010, T025 | FR-086 | T008, T077 |
| FR-040 | T060 | FR-087 | T104 |
| FR-041 | T023, T102 | FR-088 | T104 |
| FR-042 | T016, T102 | FR-089 | T099 |
| FR-043 | T037, T098 | FR-090 | T015, T098 |
| FR-044 | T029, T032 | FR-091 | T106 |
| FR-045 | T033, T048, T103 | FR-092 | T107 |
| FR-046 | T010, T012 | FR-093 | T008, T070, T080 |
| FR-047 | T012 | | |

Each `data-testid` is covered where its control is built, and T078 verifies them all.
