# Implementation Plan: Track Diorama Builder

## Overview

This plan builds Track in TypeScript, following the layering in `design.md`. Work starts with the project scaffold and test tooling. Next comes the framework-free domain core in `src/domain/` (catalogue, grid, connections, placement, history, track geometry, train simulation, save format), then persistence, audio and the Zustand store factory. The runtime services, the `window.__DIORAMA__` test hook and the input layer come after that. The React Three Fiber scene and the Tailwind/shadcn overlay come last, and the final tasks wire everything together in `App.tsx`. The plan ends with assets, `CREDITS.md`, `README.md`, a clean install and build check, and the definition of done.

Each property-based test task implements exactly one Correctness Property from `design.md` with fast-check (at least 100 runs, tagged `// Feature: track-diorama-builder, Property N: <title>`). `requirement.md` stays the single source of truth and is never edited.

## Tasks

- [ ] 1. Scaffold the project and test tooling
  - [ ] 1.1 Create the Vite + React + TypeScript project skeleton
    - Create `package.json` with the npm scripts `dev` (`vite`), `build` (`tsc -b && vite build`), `preview`, `test` (`vitest --run`) and `test:e2e` (`playwright test`), and `"engines": { "node": "22.17.0" }` to match `.nvmrc`
    - Install runtime dependencies only from the allowed list: `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `@react-spring/three`, `howler`, `nanoid`, `tone`, plus the shadcn/ui helpers `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`. Pin the latest mutually compatible stable versions (R3F 9 with React 19, drei 10)
    - Install dev dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`, `@types/react-dom`, `@types/three`, `@types/howler`, `vitest`, `fast-check`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@playwright/test`
    - Add strict `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` with the `@/` alias to `src/`, `vite.config.ts` with the React and Tailwind plugins, `components.json` for shadcn/ui and `src/lib/utils.ts` (`cn` helper)
    - Add `index.html` with `<title>Track</title>` and `#root`, `src/index.css` with the Tailwind import, a placeholder `src/main.tsx` and `src/App.tsx`
    - Create `public/assets/models/`, `public/assets/textures/`, `public/assets/audio/sfx/` and `public/assets/audio/music/`, each with a `.gitkeep`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 3.8, 34.5, 40.2, 40.3_

  - [ ] 1.2 Configure Vitest and Playwright
    - Add `vitest.config.ts` (Node environment by default, `tests/setup.ts` as setup file, `@/` alias) and `tests/setup.ts` calling `fc.configureGlobal({ numRuns: 100 })` and registering `@testing-library/jest-dom`
    - Add `playwright.config.ts` with Chromium, Firefox and WebKit projects, a `webServer` that runs `npm run build && npm run preview`, and `baseURL` for the preview server
    - Add `tests/e2e/fixtures.ts` with a page fixture that fails the test on any `console.error` or `pageerror`
    - _Requirements: 40.1, 40.4_

  - [ ]* 1.3 Write repository audit tests for the stack rules
    - `tests/unit/audit/dependencies.test.ts`: runtime dependencies in `package.json` match the allow-list; build tooling (TypeScript, Vite, Tailwind) appears only in `devDependencies`; no physics engine package is present; no file under `src/` has a static `import ... from 'tone'` (only `import('tone')`); no file under `src/domain/` imports React, Three.js, Zustand, drei, howler or DOM-only modules
    - _Requirements: 1.6, 1.7, 1.8_

- [ ] 2. Implement the domain types, catalogue, connectors and grid
  - [ ] 2.1 Create `src/domain/types.ts`, `src/domain/catalogue.ts` and `src/domain/connectors.ts`
    - Define the Section 9 types verbatim (`TrackType`, `DecorationType`, `PieceType`, `Rotation`, `Piece`, `GameState`, `Diorama`, `SaveFile`) plus `Dir`, `Tile`, `Placement`, `Reason`, `SoundEvent`, `AudioSettings`, `AppSettings`
    - Define `CATALOGUE` with the 12 items in Section 6 order: exact labels, `kind`, `size` (2 for `hill`, 1 otherwise) and ordered `connectors0`; implement `itemOf`, `isPieceType`, `isTrackType`, `isRotation`
    - Implement `rotateDir`, `opposite`, `dirDelta`, `connectorsOf` and `nextRotation`
    - _Requirements: 14.3, 28.1, 28.2, 28.3, 28.4, 35.1, 35.2_

  - [ ] 2.2 Create `src/domain/grid.ts`
    - Implement `GRID`, `tileCentre`, `worldToTile` (null unless −8 ≤ x < 8 and −8 ≤ z < 8, otherwise `floor(x + 8)`, `floor(z + 8)`), `footprintTiles`, `footprintCentre`, `inGrid` and `tileKey`
    - _Requirements: 2.3, 2.7, 8.1, 28.3_

  - [ ]* 2.3 Write property test for pointer-to-tile mapping
    - **Property 1: Pointer maps to the nearest tile**
    - **Validates: Requirements 2.3, 2.7, 8.6**
    - File: `tests/unit/domain/grid-tiles.property.test.ts`

  - [ ]* 2.4 Write property test for footprints
    - **Property 2: Footprints follow the catalogue**
    - **Validates: Requirements 28.3, 16.1**
    - File: `tests/unit/domain/grid-footprint.property.test.ts`

  - [ ]* 2.5 Write property test for connector rotation
    - **Property 3: Connectors rotate clockwise with the piece**
    - **Validates: Requirements 14.3, 14.4, 28.4**
    - File: `tests/unit/domain/connectors.property.test.ts`

  - [ ]* 2.6 Write unit tests for the catalogue
    - Exactly 12 items with the exact labels and kinds; connectors at 0°; "curve at 90° has W and S"; "buffer at 180° has N"; the buffer's stop block side is not a connector
    - File: `tests/unit/domain/catalogue.test.ts`
    - _Requirements: 14.3, 28.1, 28.2, 28.4_

- [ ] 3. Implement connections and auto-adjust
  - [ ] 3.1 Create `src/domain/occupancy.ts` and `src/domain/connections.ts`
    - `buildOccupancy(pieces)` maps every footprint tile key to its piece
    - `getConnections` returns each connected pair once, ids sorted within a pair and pairs sorted lexicographically; `openEnds` lists unconnected connectors, including those facing the grid boundary; `newConnections(before, after)`; `neighbourAcross`
    - _Requirements: 14.2, 14.5, 14.6, 14.9, 39.12, 41.6_

  - [ ]* 3.2 Write property test for the connection resolver
    - **Property 4: Connection resolver matches the adjacency rule**
    - **Validates: Requirements 14.2, 14.5, 39.12, 41.6**
    - File: `tests/unit/domain/connections-resolver.property.test.ts`; compare against a brute-force pairwise oracle using `arbBoard` / `arbLayout`

  - [ ]* 3.3 Write property test for open ends
    - **Property 5: Open ends are the unconnected connectors**
    - **Validates: Requirements 14.6, 14.9**
    - File: `tests/unit/domain/connections-open-ends.property.test.ts`

  - [ ] 3.4 Create `src/domain/autoAdjust.ts`
    - Implement `resolveAutoRotation(pieces, type, gridX, gridZ, current)`: keep `current` for decorations, when no neighbour has a connector facing the tile, or when `current` already connects; otherwise return the first of current + 90, + 180, + 270 that connects; otherwise `current`
    - _Requirements: 15.1, 15.2, 15.6_

- [ ] 4. Implement undo history and the placement engine
  - [ ] 4.1 Create `src/domain/history.ts`
    - Define `HistoryEntry` (place, remove, move with from/to `Placement`, rotate) and `History { past, future }`; `HISTORY_LIMIT = 50`
    - Implement `record` (push, drop the oldest beyond 50, clear `future`), `undo` (apply the exact inverse; reinsert removed pieces at their original index) and `redo` (re-apply the entry with the same ids and values)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ] 4.2 Create `src/domain/placement.ts`
    - Implement `applyBuild(ctx, request)` for place, move, rotate and remove, returning `BuildOutcome` with `pieces`, `entry`, `id`, `sound` and `snap`
    - Validate in the order `play_mode`, `not_found` (unknown id, unknown type, bad rotation), `out_of_bounds` (non-integer or footprint off the grid), `station_limit`, `on_track`, `occupied`, treating the moving piece's own tiles as free; never throw on bad input
    - Place appends with `newId()` and applies `resolveAutoRotation` only when `autoAdjust` is true (default rotation 0); move keeps the array index and id, never auto-adjusts, and a same-tile same-rotation move returns `ok: true` with `entry: null`; rotate uses `nextRotation`; remove records its index
    - Set `snap` from `newConnections(before, after)`, always false for remove
    - Implement `checkFootprint(pieces, type, gridX, gridZ, { movingId, isNew })` with the same rules for ghost tint and drop validity
    - _Requirements: 11.2, 11.7, 12.2, 12.4, 12.6, 14.1, 14.8, 15.4, 15.5, 15.7, 16.1, 16.2, 16.3, 16.4, 16.5, 16.7, 16.10, 16.11, 16.12, 18.4, 28.18, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.18, 39.19, 41.2, 41.4, 41.5_

  - [ ]* 4.3 Write shared fast-check generators
    - `tests/unit/arbitraries.ts`: `arbBoard` (applies random successful requests through `applyBuild`, so every board is reachable), `arbRequest` (valid and invalid coordinates, non-integers, negatives, hill at 15, unknown types, bad rotations, unknown ids), `arbLayout` (random track layouts containing a station) and `arbLoop` (closed rectangular loops of straights joined by 4 correctly rotated curves)
    - _Requirements: 16.8, 19.3, 20.5_

  - [ ]* 4.4 Write property test for reason codes
    - **Property 6: Reason codes follow the rules and their precedence**
    - **Validates: Requirements 14.8, 16.2, 16.3, 16.4, 16.5, 16.10, 16.12, 18.4, 39.7, 39.8, 39.19, 41.2, 41.5**
    - File: `tests/unit/domain/placement-reasons.property.test.ts`; use an independent reference oracle

  - [ ]* 4.5 Write property test for successful placement
    - **Property 7: A successful placement adds exactly one piece**
    - **Validates: Requirements 11.2, 11.7, 39.3**
    - File: `tests/unit/domain/placement-place.property.test.ts`

  - [ ]* 4.6 Write property test for moves
    - **Property 8: A successful move changes only that piece's anchor**
    - **Validates: Requirements 12.2, 15.7, 39.4**
    - File: `tests/unit/domain/placement-move.property.test.ts`

  - [ ]* 4.7 Write property test for rotation
    - **Property 9: Rotation cycles clockwise without moving the piece**
    - **Validates: Requirements 12.4, 15.3, 28.18, 39.5**
    - File: `tests/unit/domain/placement-rotate.property.test.ts`

  - [ ]* 4.8 Write property test for removal
    - **Property 10: Removal deletes exactly one piece and its connections**
    - **Validates: Requirements 12.6, 14.9, 39.6**
    - File: `tests/unit/domain/placement-remove.property.test.ts`

  - [ ]* 4.9 Write property test for the rotation choice of new placements
    - **Property 13: Rotation choice for new placements**
    - **Validates: Requirements 15.1, 15.2, 15.4, 15.5, 15.6, 39.18**
    - File: `tests/unit/domain/placement-auto-adjust.property.test.ts`

  - [ ]* 4.10 Write property test for history recording
    - **Property 16: History records one entry per effective action**
    - **Validates: Requirements 13.1, 13.2, 13.5**
    - File: `tests/unit/domain/history-record.property.test.ts`

  - [ ]* 4.11 Write property test for undoing everything
    - **Property 17: Undoing everything restores the start**
    - **Validates: Requirements 13.3, 13.6**
    - File: `tests/unit/domain/history-undo-all.property.test.ts`

  - [ ]* 4.12 Write property test for undo then redo
    - **Property 18: Undo then redo is the identity**
    - **Validates: Requirements 13.4, 13.7**
    - File: `tests/unit/domain/history-undo-redo.property.test.ts`

  - [ ]* 4.13 Write unit tests for placement edge cases
    - Hill anchored at gridX 15 or gridZ 15 (`out_of_bounds`); hill moved one tile east onto its own tiles (accepted); decoration over a track and a decoration (`on_track`); track on a decoration (`occupied`); second station (`station_limit`); rotate in Play mode (`play_mode`); unknown id (`not_found`)
    - File: `tests/unit/domain/placement.test.ts`
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.10, 16.12_

- [ ] 5. Implement track geometry and the train simulation
  - [ ] 5.1 Create `src/domain/trackPath.ts`
    - Local centrelines at 0°: straight, tunnel and station from (0, −0.5) to (0, 0.5), length 1; curve as a quarter circle of radius 0.5 centred on (0.5, 0.5) from (0, 0.5) to (0.5, 0), length π/4; buffer from (0, 0.5) to the stop block face (0, −0.25), length 0.75
    - Implement `pathLength`, `pointAt` and `tangentAt` in world coordinates, applying the clockwise rotation (x, z) → (−z, x) per 90° and the tile centre offset
    - _Requirements: 19.8, 19.9, 28.6, 28.19_

  - [ ]* 5.2 Write property test for centreline geometry
    - **Property 36: Centrelines match the catalogue geometry**
    - **Validates: Requirements 19.8, 19.9, 28.19**
    - File: `tests/unit/domain/train-centreline.property.test.ts`

  - [ ] 5.3 Create `src/domain/trackGraph.ts`
    - Implement `buildTrackGraph` (links per connector end; the buffer's stop block end is always `null`), `advance` (follows links, stops exactly at a dead end with `blocked: true`), `distanceToDeadEnd` and `walkPose` (continues on a straight extension past a dead end with `onTrack: false`)
    - _Requirements: 19.3, 19.10, 20.5_

  - [ ] 5.4 Create `src/domain/train.ts`
    - Define the constants from the design (vehicle lengths 0.9 and 0.8, coupling gap 0.1, spacings 0.95 and 0.9, auto cruise 1.5, auto departure acceleration 6, dead-end braking envelope 3, manual acceleration 2 and top speed 2, manual braking 5, pause 1 s, whistle throttle 3 s, sub-step 1/120 s, frame clamp 0.1 s)
    - Implement `TrainSim`, `parkTrain` (progress 0.5 on the station; facing 0 heads toward connector 0, facing 180 toward connector 1), `startPlay`, `stepTrain` (speed envelope `sqrt(2 × 3 × D)` from the leading end, auto cruise/pause/reverse/blocked phases, manual thrust and braking with direction changes only at speed 0, held key toward a dead end keeps the train still, drive-mode switches), `vehiclePoses` and `snapshot`
    - Emit `whistle` (throttled to once per 3 s), `chugStart`, `chugStop` and `bump` events as specified
    - _Requirements: 17.1, 17.4, 17.5, 17.8, 19.1, 19.3, 19.4, 19.5, 19.6, 19.10, 20.2, 20.3, 20.4, 20.5, 20.7, 20.8, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 26.1, 26.2, 26.4, 26.6, 39.13, 39.20_

  - [ ]* 5.5 Write property test for the parked train
    - **Property 37: The parked train sits on the station facing the chosen way**
    - **Validates: Requirements 17.1, 17.2, 17.4, 17.5, 18.5, 39.20**
    - File: `tests/unit/domain/train-park.property.test.ts`

  - [ ]* 5.6 Write property test for vehicle placement and spacing
    - **Property 38: Vehicles stay on the centreline at fixed spacing**
    - **Validates: Requirements 17.8, 19.3, 19.4, 19.5, 19.6, 19.10, 39.13**
    - File: `tests/unit/domain/train-spacing.property.test.ts`

  - [ ]* 5.7 Write property test for dead ends
    - **Property 39: The train never passes a dead end**
    - **Validates: Requirements 20.3, 21.5**
    - File: `tests/unit/domain/train-dead-end.property.test.ts`

  - [ ]* 5.8 Write property test for auto driving
    - **Property 40: Auto driving cruises, pauses and reverses**
    - **Validates: Requirements 17.8, 18.3, 20.2, 20.4, 20.5, 21.8**
    - File: `tests/unit/domain/train-auto.property.test.ts`

  - [ ]* 5.9 Write property test for manual driving
    - **Property 41: Manual driving respects its speed limits**
    - **Validates: Requirements 20.8, 21.1, 21.2, 21.3, 21.4, 21.7**
    - File: `tests/unit/domain/train-manual.property.test.ts`

  - [ ]* 5.10 Write property test for train sound events
    - **Property 42: Train sounds match the motion**
    - **Validates: Requirements 26.1, 26.2, 26.4, 26.5, 26.6**
    - File: `tests/unit/domain/train-sounds.property.test.ts`

  - [ ]* 5.11 Write unit tests for train scenarios
    - Lone station: moves forward to the dead end, bumps, pauses 1 s, then becomes `blocked` with no further sounds; held key toward a dead end keeps the train still while the other key moves it away; Manual to Auto at a dead end pauses and reverses; frame `dt` above 0.1 s is clamped
    - File: `tests/unit/domain/train.test.ts`
    - _Requirements: 19.10, 20.4, 20.7, 21.6_

- [ ] 6. Implement naming, save-format validation, the autosave rule and colour tokens
  - [ ] 6.1 Create `src/domain/naming.ts`
    - `nextUntitledName(savedNames)` returns "Untitled diorama" or the smallest free "Untitled diorama N" with N ≥ 2; `validateName(input)` trims and accepts 1 to 40 UTF-16 code units
    - _Requirements: 4.2, 4.3, 5.2, 5.3_

  - [ ]* 6.2 Write property test for untitled names
    - **Property 22: Untitled names are the smallest free name**
    - **Validates: Requirements 4.2, 4.3**
    - File: `tests/unit/domain/naming-untitled.property.test.ts`

  - [ ] 6.3 Create `src/domain/saveFormat.ts`
    - `parseSaveFile(raw)` returns `missing`, `corrupt` (not JSON, empty string, wrong shape) or `ok` with raw `entries`, `valid` dioramas and `invalidCount`; never throws
    - `validateDiorama` and `validatePiece` apply every rule in Requirement 24.1 plus the ISO 8601 pattern and D-20 (duplicate piece ids, overlapping footprints, more than one station fail)
    - `parseAudioSettings` (invalid JSON or non-object: all defaults; invalid field: that field's default; `warn` flag) and `parseAppSettings` (default `lowQuality: false`); `sortNewestFirst` by `updatedAt` descending, then id
    - _Requirements: 3.4, 3.5, 24.1, 24.2, 24.4, 24.6, 27.8, 27.12, 33.5, 36.1, 36.2_

  - [ ]* 6.4 Write property test for the SaveFile JSON round trip
    - **Property 26: SaveFile JSON round trip**
    - **Validates: Requirements 36.2, 36.8**
    - File: `tests/unit/persistence/savefile-roundtrip.property.test.ts`

  - [ ] 6.5 Create `src/domain/autosave.ts`
    - Implement `AUTOSAVE_MS = 30_000`, `nextAutosaveDue(prev, event)` for `dirtied`, `attempted`, `returnedToBuild` and `cleaned`, and `isAutosaveDue(dueAt, now, mode, dirty)` (never due in Play mode or when clean)
    - _Requirements: 23.1, 23.4, 23.5_

  - [ ] 6.6 Create `src/theme/palette.ts` and `src/domain/color.ts`
    - Define every overlay and material colour token (cream, honey wood, sage, dusty blue, terracotta, walnut and so on, plus the ghost green `#7fbf7a` and red `#d9776a`, focus ring and the two light colours)
    - Implement hex-to-HSL conversion and `checkPaletteRule(hex, { accent })` (saturation ≤ 60%, or ≤ 70% for ghost tints and focus rings; lightness 8% to 96%)
    - _Requirements: 30.2, 30.3_

  - [ ]* 6.7 Write unit tests for colour tokens
    - Every token in `theme/palette.ts` passes `checkPaletteRule`; the bedroom light is cooler (bluer) than the kitchen light
    - File: `tests/unit/theme/palette.test.ts`
    - _Requirements: 7.6, 7.7, 30.3_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement persistence
  - [ ] 8.1 Create `src/persistence/storage.ts`
    - Define `KeyValueStorage` (`getItem`, `setItem` that may throw, `keys`); `browserStorage()` wraps `window.localStorage` and falls back to memory storage with one warning when access throws (D-30); `memoryStorage(init, { failWrites })` for tests
    - _Requirements: 1.9, 24.5, 41.8_

  - [ ] 8.2 Create `src/persistence/saveRepository.ts`
    - `list()` returns valid dioramas newest first and logs one `console.warn` per skipped entry or one for a corrupt file (none for a missing key); `get(id)`
    - `upsert`, `rename` and `remove` follow the write algorithm: parse; back up a corrupt raw value to a new `wooden-diorama:v1:corrupt-<ISO>` key (suffix `-2`, `-3` if taken) and abort with `backup_failed` if that write throws; keep invalid entries unchanged; replace by id in place or append; one `setItem` of `{ version: 1, dioramas }`
    - First save assigns a nanoid id and equal UTC ISO `createdAt`/`updatedAt`; later saves and renames keep `id` and `createdAt`, set `updatedAt` (never earlier than `createdAt`); rename keeps `thumbnail`
    - _Requirements: 3.2, 3.4, 5.2, 5.5, 6.6, 22.1, 22.12, 22.13, 24.1, 24.2, 24.3, 24.7, 24.8, 35.5, 36.1, 36.3, 36.4, 36.5, 36.7_

  - [ ] 8.3 Create `src/persistence/settingsRepository.ts`
    - Read and write `wooden-diorama:audio` (`{ muted, musicVolume, sfxVolume }`) and `wooden-diorama:settings` (`{ lowQuality }`) using the parsers from `saveFormat.ts`; write failures log a warning and keep the in-memory value
    - _Requirements: 27.7, 27.8, 27.9, 33.4, 33.5, 36.6_

  - [ ]* 8.4 Write property test for rename validation
    - **Property 23: Rename accepts exactly 1 to 40 trimmed characters**
    - **Validates: Requirements 5.2, 5.3, 6.6**
    - File: `tests/unit/domain/naming-rename.property.test.ts`

  - [ ]* 8.5 Write property test for the menu list
    - **Property 24: The menu lists the valid entries newest first**
    - **Validates: Requirements 3.2, 3.4, 3.5, 24.1**
    - File: `tests/unit/persistence/saves-list.property.test.ts`

  - [ ]* 8.6 Write property test for crash-free loading
    - **Property 25: Loading never crashes**
    - **Validates: Requirements 24.2, 24.5, 33.5**
    - File: `tests/unit/persistence/saves-load-safe.property.test.ts`; spy on `console.error` and assert it is never called

  - [ ]* 8.7 Write property test for isolated writes
    - **Property 28: Writes touch only their own entry**
    - **Validates: Requirements 5.5, 22.13, 24.7, 36.5**
    - File: `tests/unit/persistence/saves-isolation.property.test.ts`

  - [ ]* 8.8 Write property test for timestamps
    - **Property 29: Timestamps stay consistent**
    - **Validates: Requirements 36.3, 36.4**
    - File: `tests/unit/persistence/saves-timestamps.property.test.ts`

  - [ ]* 8.9 Write property test for corrupt-data backup
    - **Property 31: Corrupt data is backed up before it is replaced**
    - **Validates: Requirements 24.3**
    - File: `tests/unit/persistence/saves-backup.property.test.ts`

  - [ ]* 8.10 Write property test for settings parsing and round trip
    - **Property 32: Settings parse safely and round trip**
    - **Validates: Requirements 24.4, 27.9, 27.12, 33.5**
    - File: `tests/unit/persistence/settings.property.test.ts`

- [ ] 9. Implement the audio manager
  - [ ] 9.1 Create `src/audio/synth.ts` and `src/audio/soundBank.ts`
    - Web Audio recipes connected to `Howler.masterGain`: wood knock (band-pass noise burst plus sine partial), UI click, whistle (two detuned sines with vibrato), looping chug pattern with speed-dependent rate, soft bump; place, delete and invalid use different recipes
    - `soundBank.ts` maps each event to `{ kind: 'file', src }` or `{ kind: 'synth', recipe }`; start with synth entries for every event (files are wired in task 17.1)
    - _Requirements: 25.8, 25.9, 34.11_

  - [ ] 9.2 Create `src/audio/AudioManager.ts` and `src/audio/gains.ts`
    - Implement `AudioPort`: `play` and `startChug` append to the sound log first, always (cap 10,000 entries), then produce sound only when unlocked and not muted; `setChugLevel`, `stopChug`, `apply(settings)`, `getLog()`
    - One-time capture-phase `pointerdown`/`keydown` unlock that resumes `Howler.ctx` and starts music; nothing triggered before unlock is played later
    - Pure `computeGains({ muted, musicVolume, sfxVolume }, speed)` for music, effects and chug gain (effects × speed / 2); slider changes update live sounds at once; mute keeps the stored volumes
    - Preload file sounds as decoded buffers (`html5: false`); on load error fall back to the synth recipe with a warning
    - _Requirements: 25.1, 25.10, 25.11, 25.12, 26.2, 26.3, 26.5, 27.4, 27.5, 27.10, 27.11, 39.15_

  - [ ] 9.3 Create `src/audio/music.ts`
    - If a music file exists in `public/assets/audio/music/`, loop it with a `Howl`; otherwise `await import('tone')`, point Tone at Howler's context and play the generated loop (about 92 BPM, I–vi–IV–V, plucked marimba-like synth, soft pad, brush-noise beat); a failed import logs a warning and leaves music silent
    - _Requirements: 1.7, 27.1, 27.2, 27.3, 34.12_

  - [ ]* 9.4 Write property test for gains
    - **Property 34: Gains follow mute and volume**
    - **Validates: Requirements 26.3, 27.10**
    - File: `tests/unit/audio/gains.property.test.ts`

  - [ ]* 9.5 Write property test for the sound log
    - **Property 35: The sound log ignores mute and unlock state**
    - **Validates: Requirements 25.12, 27.5, 39.15**
    - File: `tests/unit/audio/sound-log.property.test.ts`

  - [ ]* 9.6 Write unit tests for the audio manager
    - With Howler mocked: unlock on the first pointer or key event; no deferred playback; place and delete use different clips; volume changes reach live sounds; `chug` logged once per start; `tone` is reached only through dynamic import
    - File: `tests/unit/audio/AudioManager.test.ts`
    - _Requirements: 1.7, 25.8, 26.2, 27.4, 27.5, 27.11_

- [ ] 10. Implement the Zustand store
  - [ ] 10.1 Create the store core with build, history and selection actions
    - `src/store/ports.ts`: `AudioPort`, `TrainPort` (`enterPlay`, `exitPlay`, `setDriveMode`, `snapshot`), `ScenePort` (`captureThumbnail`, `resetView`), `AppDeps`
    - `src/store/createAppStore.ts`: `createAppStore(deps)` with `GameState` plus the `Extras` from the design (`screen`, `savedList`, `history`, `drag`, `hoverTile`, `hoverPieceId`, `dialog`, `renamingId`, `renameError`, `toasts`, `audio`, `lowQuality`, `autosaveDueAt`, `createdAt`, `thumbnail`)
    - Actions `placePiece`, `movePiece`, `rotatePiece`, `removePiece`, `deleteSelected`, `selectPiece`, `selectTool` (no-op in Play mode or for a station when one exists), `undo`, `redo` (ignored in Play mode, during a drag or with nothing available; no sound; clears a stale `selectedPieceId`), `pushToast` and `dismissToast` (3 s, at most 3 shown)
    - On success: set `pieces`, record history, set `isDirty`, update `autosaveDueAt`, then `audio.play(sound)` and `audio.play('snap')`; on rejection: only `audio.play('invalid')`
    - `src/store/selectors.ts` (memoised occupancy, connections, open ends, station) and `src/store/useAppStore.ts` (React binding with `useShallow`)
    - _Requirements: 2.2, 10.3, 10.5, 10.7, 11.7, 12.1, 12.6, 12.7, 12.10, 13.1, 13.3, 13.4, 13.8, 13.9, 14.7, 14.9, 14.10, 15.8, 16.6, 16.11, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 35.3, 35.4, 35.8_

  - [ ] 10.2 Add menu, navigation, save and autosave actions to `createAppStore.ts`
    - `refreshList`, `newDiorama` (defaults from Requirement 35.6, name from `nextUntitledName`, history cleared, nothing written), `openDiorama(id)` (saved order, history cleared, `isDirty` false), `renameDiorama` (validation message on invalid names; failure toast keeps the old name), `requestDeleteDiorama`, `confirmDialog`, `cancelDialog`, `discardAndLeave`, `backToMenu` (opens the unsaved-changes dialog when dirty)
    - `save(trigger)`: capture a thumbnail (saved without it if capture throws or returns null), upsert, toast "Saved", set `dioramaId`, clear `isDirty` and `autosaveDueAt`; on failure toast "Save failed. Your changes are still here." and keep `isDirty`; autosave failure retries in 30 s; dialog saves go to the menu only on success
    - A 1-second autosave interval using `isAutosaveDue`
    - _Requirements: 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 6.1, 6.4, 13.10, 22.1, 22.2, 22.3, 22.6, 22.7, 22.8, 22.9, 22.10, 22.11, 22.12, 23.1, 23.2, 23.3, 23.4, 23.5, 35.6, 35.7, 36.7_

  - [ ] 10.3 Add drag actions to `createAppStore.ts`
    - `beginDrag(src)` (palette or board; sets `selectedTool` for palette drags; plays `pickup`), `setDragTile(tile | null)` (updates `drag.valid` with `checkFootprint`, moving piece excluded), `rotateDrag()` (plays `rotate`), `drop()` (palette: `placePiece` with drag rotation and `autoAdjust: true`; board: `movePiece` with drag rotation; off-grid: `invalid` and cancel; same-tile drop plays `move`), `cancelDrag()`
    - _Requirements: 2.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 12.2, 12.3, 12.5, 12.9, 16.10, 25.1, 25.3_

  - [ ] 10.4 Add mode, drive, start-facing, setting, audio and quality actions to `createAppStore.ts`
    - `setMode('play')`: no station gives toast "Place a station to start", `invalid` and `{ ok: false, reason: 'no_station' }`; otherwise cancel any drag, clear selection and hover, set `mode` and `driveMode = 'auto'`, call `train.enterPlay`; `setMode('build')` calls `train.exitPlay` and resets the autosave timer; same-mode calls return `{ ok: true }`; `isDirty` unchanged
    - `setDriveMode`, `toggleDriveMode` (Play mode only from the UI), `flipStartFacing` (Build mode only; sets `isDirty`), `setSetting` (both modes; dirty only on a change), `setMuted`, `setMusicVolume`, `setSfxVolume` (persist and `audio.apply`), `setLowQuality` (persist)
    - _Requirements: 7.2, 7.4, 7.9, 17.3, 17.6, 17.9, 17.10, 18.2, 18.3, 18.5, 18.6, 20.1, 20.6, 27.7, 33.3, 33.4, 35.4, 39.9, 39.10, 39.11_

  - [ ]* 10.5 Write the store test harness
    - `tests/unit/store/harness.ts`: `memoryStorage`, a recording fake `AudioPort`, a fake `TrainPort` backed by the pure train functions, a fake `ScenePort` with switchable thumbnail failure, a controllable clock and a seeded id generator
    - _Requirements: 16.7, 39.17_

  - [ ]* 10.6 Write property test for rejected actions
    - **Property 11: Rejected actions change nothing**
    - **Validates: Requirements 11.4, 11.10, 12.3, 14.10, 16.11, 25.7, 35.8**
    - File: `tests/unit/store/store-rejected.property.test.ts`

  - [ ]* 10.7 Write property test for board invariants
    - **Property 12: Board invariants hold over any action sequence**
    - **Validates: Requirements 14.1, 16.1, 16.8, 16.9, 35.2, 41.4**
    - File: `tests/unit/store/store-invariants.property.test.ts`; use `fc.commands` with build requests, undo and redo

  - [ ]* 10.8 Write property test for build sounds
    - **Property 14: Build sounds match the outcome**
    - **Validates: Requirements 14.7, 15.8, 18.7, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 39.16**
    - File: `tests/unit/store/store-sounds.property.test.ts`

  - [ ]* 10.9 Write property test for ghost tint validity
    - **Property 15: Ghost tint agrees with the drop result**
    - **Validates: Requirements 11.5, 11.6**
    - File: `tests/unit/store/store-ghost.property.test.ts`

  - [ ]* 10.10 Write property test for selection and dirty state
    - **Property 19: Selection and dirty-state invariants**
    - **Validates: Requirements 13.9, 35.3, 35.4**
    - File: `tests/unit/store/store-dirty.property.test.ts`; use `fc.commands` over all store actions

  - [ ]* 10.11 Write property test for setting changes
    - **Property 21: Setting changes touch nothing else**
    - **Validates: Requirements 7.4, 7.10**
    - File: `tests/unit/store/store-setting.property.test.ts`

  - [ ]* 10.12 Write property test for the save and reopen round trip
    - **Property 27: Save and reopen round trip**
    - **Validates: Requirements 4.4, 7.5, 17.7, 22.4, 22.5**
    - File: `tests/unit/store/store-save-reopen.property.test.ts`; simulate a reload by creating a second store on the same storage

  - [ ]* 10.13 Write property test for failed writes
    - **Property 30: Failed writes leave storage untouched**
    - **Validates: Requirements 5.9, 22.11, 36.7**
    - File: `tests/unit/store/store-write-failure.property.test.ts`

  - [ ]* 10.14 Write property test for autosave timing
    - **Property 33: Autosave fires 30 seconds after its trigger**
    - **Validates: Requirements 23.1, 23.4, 23.5**
    - File: `tests/unit/store/store-autosave.property.test.ts`

  - [ ]* 10.15 Write unit tests for store flows
    - New diorama defaults and naming; open resets history and selection; Escape with and without a drag; R during a drag; station palette lock; Play mode entry without a station (toast text, `invalid`, `no_station`, mode stays `build`); back to menu with and without unsaved changes via Save, Discard and Cancel; save failure and autosave retry; thumbnail failure; rename and delete failure toasts
    - File: `tests/unit/store/store-flows.test.ts`
    - _Requirements: 4.1, 4.5, 4.6, 5.9, 6.4, 10.7, 11.8, 11.9, 18.2, 22.6, 22.7, 22.8, 22.9, 22.10, 22.11, 23.4_

- [ ] 11. Implement runtime services, the test hook and bootstrap
  - [ ] 11.1 Create `src/runtime/TrainRuntime.ts`
    - Implements `TrainPort`; in Build mode `snapshot()` and `poses()` derive the parked train from the store's `pieces` and `startFacing` (memoised), returning `null` with no station
    - `enterPlay`, `exitPlay` (stops the chug), `setKeys` (cleared on `window` blur), `tick(frameDt)` running 1/120 s sub-steps and forwarding events to the audio manager (`whistle`, `chugStart` → `startChug`, `chugStop` → `stopChug`, `bump`) and `setChugLevel(speed / 2)` every frame
    - _Requirements: 7.10, 17.2, 17.9, 18.3, 18.5, 26.1, 26.2, 26.3, 26.4, 26.5, 39.13, 39.14, 39.20_

  - [ ] 11.2 Create `src/runtime/SceneBridge.ts`
    - Implements `ScenePort`: `register(camera, gl, scene, controls)`, `captureThumbnail()` (render one frame, copy into a 320 × 240 canvas, JPEG quality 0.7, null on failure), `resetView()`, and `rayFromClient(clientX, clientY)` (ray–plane y = 0 intersection, then `worldToTile`; null outside the canvas or for a parallel ray), plus `tileToScreen(gridX, gridZ)` for the debug global
    - _Requirements: 2.3, 2.4, 2.7, 6.1, 9.8_

  - [ ] 11.3 Create `src/testHook/installTestHook.ts`
    - Define the `DioramaTestHook` interface verbatim from Section 10.2 of `requirement.md` and assign `window.__DIORAMA__` with the 10 synchronous methods mapped as in the design table (`placePiece` passes `autoAdjust: rotation === undefined`; `getTrain` uses `TrainRuntime.snapshot()`; `getSoundLog` returns a copy)
    - Install the separate `window.__DIORAMA_DEBUG__.tileToScreen` helper under the same conditions
    - _Requirements: 38.4, 38.5, 39.1, 39.2, 39.3, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 39.10, 39.11, 39.12, 39.13, 39.14, 39.15, 39.16, 39.18, 39.19, 39.20, 42.2_

  - [ ] 11.4 Create `src/app/bootstrap.ts` and wire `src/main.tsx`
    - Build `browserStorage`, the repositories, `AudioManager`, `TrainRuntime`, `SceneBridge` and the store; apply stored audio and quality settings
    - Evaluate `import.meta.env.DEV || new URLSearchParams(location.search).get('test') === '1'` once; when true, `await import('./testHook/installTestHook')` and install the hook before the first React render; otherwise never load the module
    - Render `<App/>` in `StrictMode`
    - _Requirements: 3.1, 27.8, 33.4, 38.1, 38.2, 38.3, 38.4, 38.5_

  - [ ]* 11.5 Write unit tests for the test hook and train runtime
    - All 10 hook methods exist and return non-Promise values; `placePiece` with a bad type or rotation returns `not_found`; `setMode('play')` without a station returns `no_station` and logs `invalid`; `getTrain()` is `null` without a station and parked values in Build mode; `TrainRuntime` forwards `chug` once per start and stops it on `exitPlay`
    - File: `tests/unit/testHook/testHook.test.ts`
    - _Requirements: 17.9, 18.5, 39.1, 39.8, 39.9, 39.14, 39.20_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement input handling
  - [ ] 13.1 Create `src/input/DragController.ts`
    - Pure transition functions plus `window` pointer listeners for the state machine in the design: palette press → click selects the tool and plays `ui`, or more than 4 px of movement starts a palette drag; canvas press with a tool → place on release at the tile under the pointer; piece press without a tool → select on release, or a board drag once the pointer reaches a different tile; empty-ground press without a tool clears selection; off-grid release plays `invalid`
    - Use `SceneBridge.rayFromClient` for tiles; ignore all gestures in Play mode; leave right and middle buttons to the camera; update `hoverTile` and `hoverPieceId` in Build mode
    - _Requirements: 2.4, 8.4, 8.6, 10.3, 11.1, 11.2, 11.3, 11.4, 11.10, 12.1, 12.2, 12.3, 18.4, 25.1, 31.9_

  - [ ] 13.2 Create `src/input/useKeyboardShortcuts.ts`
    - One `keydown`/`keyup` listener on `window` while the playfield is shown; ignore events whose target is an `input`, `textarea`, `select` or content-editable element
    - Build mode: R rotates the drag or the selected piece; Delete and Backspace delete the selected piece (`preventDefault`); Escape cancels the drag or clears the tool; F flips the start facing (ignoring `event.repeat`); Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes
    - Play mode: W and S call `TrainRuntime.setKeys` on keydown and keyup (manual driving only); all build keys ignored
    - _Requirements: 11.8, 11.9, 12.4, 12.5, 12.6, 12.9, 12.10, 13.3, 13.4, 13.8, 17.3, 17.10, 21.1, 21.2, 21.8_

  - [ ]* 13.3 Write property test for test hook and UI equivalence
    - **Property 20: Test hook and UI paths are equivalent**
    - **Validates: Requirements 16.7, 39.2, 39.17**
    - File: `tests/unit/store/store-hook-ui-equivalence.property.test.ts`; drive one store through the drag controller transitions (fake `rayFromClient`) and the keyboard handler, the other through the hook, with identical seeds

  - [ ]* 13.4 Write unit tests for keyboard and drag handling
    - Keys ignored while a text input has focus; F with `repeat` does not toggle twice; Cmd and Ctrl both trigger undo and redo; W/S ignored in Build mode and in Auto mode; a 3 px palette move is a click and a 5 px move is a drag; Escape during a board drag returns the piece
    - File: `tests/unit/input/input.test.ts`
    - _Requirements: 12.9, 13.8, 17.3, 17.10, 21.8_

- [ ] 14. Implement the 3D scene
  - [ ] 14.1 Create `src/scene/models/materials.ts`
    - Generate textures once on a 2D canvas (512 × 512 wood grain from sine-warped value noise, 1024 × 1024 floorboards, 512 × 512 felt and tabletop, letter textures A, B, C), all at most 1024 × 1024
    - Cached shared materials: `woodMaterial(tint)` (roughness 0.72, metalness 0, grain map), `paintMaterial` (0.65), `plasticMaterial` (0.42), `feltMaterial` (0.95), shared ghost and fade materials; colours only from `theme/palette.ts`; no environment map
    - _Requirements: 29.1, 29.2, 29.3, 29.5, 30.1, 30.3, 32.5, 34.8_

  - [ ] 14.2 Create `src/scene/models/geometry.ts`
    - `sweepProfile` and the grooved rail profile (0.30 × 0.08, two 0.05 × 0.025 grooves, 0.025 rounded top edges); curve rails with 16 segments
    - Part lists `{ geometry, material }` for all 12 types with the sizes in Requirement 28 (house 1.0, pine tree 1.2, round tree 1.0, hill 0.6 peak lathe over 2 × 2, car 0.5 × 0.3 with plastic wheels, cassette 0.68 × 0.43 × 0.08, three lettered blocks), station platform and roof inside the tile, tunnel arch 0.9 × 0.55 with the opaque interior plug from s = 0.2 to 0.8; `RoundedBoxGeometry` and chamfers with radius at least 0.02; merge same-material parts
    - _Requirements: 19.7, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11, 28.12, 28.13, 28.14, 28.15, 28.16, 29.4, 34.8, 34.9_

  - [ ] 14.3 Create `src/scene/models/trainGeometry.ts`
    - Locomotive (0.9 long: boiler, cab, chimney, plastic wheels) and two carriages (0.8 long, sage and dusty blue) built with the helpers from `geometry.ts`, with rounded, slightly tapered ends
    - _Requirements: 19.1, 19.2, 29.1, 29.4, 29.5_

  - [ ] 14.4 Create `src/scene/animation/spring.ts`, `src/scene/animation/tactile.ts` and `src/scene/quality.ts`
    - Pure `springStep(pos, vel, target, dt, { stiffness: 500, damping: 40 })` with snap-to-target below 0.002 and speed 0.01; `tiltFor(velocity)` clamped to 0° to 8°; timing constants (grab 120 ms, drop 80 + 160 ms, shake 200 ms with `0.06 × sin(2π × 5t) × (1 − t / 0.2)`, rotate 150 ms, delete 200 ms, hover 120 ms and 0.05 lift); `nextRotationTarget(prevAngle)` that always subtracts 90°
    - `dprFor(devicePixelRatio, lowQuality)` returning `min(d, 1.5)` or `min(d, 1)`
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9, 31.10, 32.3, 33.2_

  - [ ]* 14.5 Write property test for the drag spring and tilt
    - **Property 43: Drag spring settles and tilt stays bounded**
    - **Validates: Requirements 31.2, 31.3**
    - File: `tests/unit/scene/spring.property.test.ts`

  - [ ]* 14.6 Write property test for rotation animation targets
    - **Property 44: Rotation animation always turns clockwise to the stored rotation**
    - **Validates: Requirements 31.7**
    - File: `tests/unit/scene/rotation-target.property.test.ts`

  - [ ]* 14.7 Write property test for the pixel ratio cap
    - **Property 45: Render pixel ratio is capped**
    - **Validates: Requirements 32.3, 33.2**
    - File: `tests/unit/scene/quality.property.test.ts`

  - [ ] 14.8 Create `src/scene/CameraRig.tsx`
    - drei `<CameraControls>` with left = none, middle = truck, right = rotate, wheel = dolly, touches disabled, polar 20° to 80°, distance 4 to 30, `dollyToCursor` off; `setBoundary` to the grid box; default pose (target origin, distance 18, polar 50°, azimuth 45°) applied without transition on open; register `resetView` (animated `setLookAt`) with `SceneBridge`; never touch the store
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.11_

  - [ ] 14.9 Create `src/scene/Lighting.tsx`, `src/scene/settings/BedroomSetting.tsx` and `src/scene/settings/KitchenSetting.tsx`
    - One shadow-casting directional light (map 2048 × 2048, soft shadows, orthographic bounds ±12; `castShadow` off in Low quality), hemisphere and weak ambient fill; colours `#e6ecff` (bedroom) and `#ffd6a5` (kitchen) animated over 400 ms on change
    - Bedroom: grained floorboards 40 × 40, dusty-blue felt rug under the grid, bed leg, toy crate, slipper, book stack. Kitchen: tabletop 30 × 24, fruit bowl, mug, salt shaker, napkin. All props 0.3 to 4 units outside the grid and not raycast
    - _Requirements: 7.3, 7.6, 7.7, 7.8, 30.1, 30.9, 32.4, 33.1_

  - [ ] 14.10 Create `src/scene/GridLines.tsx` and `src/scene/TileHighlight.tsx`
    - One `LineSegments` with 34 lines on every tile edge, opacity 0.3 in Build mode springing to 0.05 within 250 ms in Play mode; one cream quad on `hoverTile`, hidden in Play mode, off the grid and when the pointer leaves the canvas
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 14.11 Create `src/scene/pieces/PieceLayer.tsx`, `PickProxies.tsx`, `BlobShadows.tsx` and `OpenEndMarkers.tsx`
    - `PieceLayer`: drei `<Merged>` instancing of the part lists for all non-active pieces, each in an `animated.group` with hover lift (+0.05, 120 ms) and the drop bounce; transforms from `footprintCentre` and `rotation.y = −rotation × π / 180`
    - `PickProxies`: one invisible shared box per piece for raycasting, setting the pointer cursor on hover
    - `BlobShadows`: one instanced radial-gradient plane per piece and for the train, hidden in Low quality
    - `OpenEndMarkers`: instanced 0.18-wide cream pegs at each open end edge midpoint, Build mode only, from `openEnds(pieces)`
    - _Requirements: 14.1, 14.6, 14.9, 28.17, 28.19, 30.10, 31.9, 32.5, 33.1_

  - [ ] 14.12 Create `src/scene/pieces/ActivePiece.tsx`
    - Selected piece with drei `<Outlines>`; palette ghost tinted green or red from `drag.valid`; dragged piece lifted to 0.3 in 120 ms with a ×1.4 softer blob, spring follow and tilt in `useFrame`; valid drop fall and bounce; invalid drop shake then return (board) or fade out (ghost); rotate tween to the cumulative angle; 200 ms exiting copy for deleted pieces (scale 0.6, rise 0.2, fade to 0); undo and redo applied without animation; all sharing geometry and materials
    - _Requirements: 11.1, 11.5, 11.6, 12.1, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.10, 31.11_

  - [ ] 14.13 Create `src/scene/train/TrainView.tsx`
    - Three groups (locomotive and 2 carriages) using `trainGeometry.ts`; in `useFrame` call `trainRuntime.tick(dt)` in Play mode and write `trainRuntime.poses()` into the transforms without React state updates; render nothing when `poses()` is null
    - _Requirements: 17.2, 17.9, 19.1, 19.3, 19.4, 19.5, 19.6, 19.7, 19.10_

  - [ ] 14.14 Create `src/scene/Scene.tsx` and `src/scene/SceneCanvas.tsx`
    - `SceneCanvas`: fixed full-viewport container, `<Canvas dpr={dprFor(...)} shadows={lowQuality ? false : 'soft'}>` with fov 40, context menu suppressed, DPR recomputed on resize and quality change; registers camera, renderer and scene with `SceneBridge`; error boundary with "The 3D view stopped. Reload to continue." and a Reload button; `webglcontextlost` handling
    - `Scene`: composes `CameraRig`, `Lighting`, the active setting, `GridLines`, `TileHighlight`, `PieceLayer`, `ActivePiece`, `BlobShadows`, `OpenEndMarkers`, `PickProxies` and `TrainView`; draws no HTML controls
    - _Requirements: 2.1, 2.6, 2.8, 9.10, 32.1, 32.2, 32.3, 33.2, 33.3_

  - [ ]* 14.15 Write unit tests for rendering helpers
    - In Node without WebGL: bounding boxes of every part list match Requirement 28 sizes; wood and paint roughness ≥ 0.6, plastic 0.3 to 0.6, no `envMap`; one geometry and material set per type; textures at most 1024 × 1024; props lie outside the grid within 4 units; the tunnel plug spans s = 0.2 to 0.8 and encloses the vehicle cross-section; vehicle lengths within tolerance; camera controls config values and the default pose
    - File: `tests/unit/scene/rendering.test.ts`
    - _Requirements: 7.8, 9.5, 9.6, 9.8, 19.2, 19.7, 28.10, 28.11, 28.12, 28.13, 28.14, 28.15, 29.1, 29.2, 29.3, 32.4, 32.5_

- [ ] 15. Implement the HTML overlay
  - [ ] 15.1 Add shadcn/ui components, theme and icons
    - Generate `src/ui/components/ui/` `button`, `toggle`, `toggle-group`, `slider`, `alert-dialog`, `tooltip` and `toast`; map palette tokens into Tailwind theme variables in `src/index.css`; set the rounded system font stack; radius ≥ 6 px, panel padding ≥ 12 px, gaps ≥ 8 px, translucent or shadowed panels; `focus-visible:ring-2 ring-offset-2` on every control
    - `src/ui/icons.tsx`: the 12 palette item SVG icons in a rounded 2 px stroke style matching lucide-react
    - _Requirements: 1.3, 10.2, 30.2, 30.4, 30.5, 30.6, 30.7, 40.5_

  - [ ] 15.2 Create `src/ui/MainMenu.tsx` and `src/ui/DioramaCard.tsx`
    - `main-menu` with `h1` "Track", `new-diorama`, `diorama-list` of `diorama-item` cards with `data-diorama-id`, thumbnail or placeholder (`onError` falls back), full name, locale date via `Intl.DateTimeFormat`, and `diorama-open`, `diorama-rename`, `diorama-delete` icon buttons with `aria-label`s
    - Rename swaps in a focused, prefilled `rename-input`; Enter or blur confirms, Escape cancels; the validation message says names must be 1 to 40 characters; the empty state prompts creating a diorama and keeps New diorama enabled
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 4.1, 4.4, 5.1, 5.2, 5.3, 5.7, 5.8, 6.2, 6.3, 6.5, 37.1, 37.2, 37.3, 37.4, 37.14, 40.6_

  - [ ] 15.3 Create `src/ui/Palette.tsx`
    - Tracks and Decorations groups with the 12 `palette-<type>` buttons (icon plus exact label) in 2 columns; highlight only the `selectedTool`; pointer-down hands off to `DragController`
    - Station item uses `aria-disabled="true"` with a Radix tooltip "Only one station per diorama" on hover and focus while a station exists; in Play mode the palette fades out over 200 ms and its items are `disabled`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 16.6, 16.13, 28.1, 37.8, 41.2_

  - [ ] 15.4 Create `src/ui/TopBar.tsx`, `src/ui/ActionBar.tsx` and `src/ui/ViewPanel.tsx`
    - TopBar: `back-to-menu`, diorama name, `save-button`, `mode-toggle`, `drive-toggle` (disabled in Build mode), `flip-direction` (disabled in Play mode), `setting-select` ToggleGroup with "Bedroom floor" and "Kitchen table" and `data-value`, enabled in both modes
    - ActionBar: `delete-piece` (disabled with no selection or in Play mode), Undo, Redo
    - ViewPanel: `reset-view`, Low quality toggle, `mute-toggle`, `music-volume` and `sfx-volume` sliders (0 to 1, step 0.01, `aria-label`s on thumbs)
    - Every control has an accessible name and plays `ui` on activation
    - _Requirements: 7.1, 7.9, 9.8, 12.7, 12.8, 17.3, 17.10, 18.1, 20.1, 20.6, 22.1, 25.10, 27.6, 33.3, 37.9, 37.10, 37.11, 40.6, 41.3_

  - [ ] 15.5 Create `src/ui/UnsavedChangesDialog.tsx`, `src/ui/DeleteDioramaDialog.tsx` and `src/ui/Toasts.tsx`
    - AlertDialogs: delete dialog with "Delete" (`confirm-ok`) and "Cancel"; unsaved-changes dialog with "Save" (`confirm-ok`), "Discard" (`confirm-discard`) and "Cancel"; Escape cancels
    - Toasts: one `data-testid="toast"` `role="status"` element per message, newest at the bottom, up to 3
    - _Requirements: 5.4, 5.6, 22.2, 22.6, 22.9, 37.5, 37.6, 37.12_

  - [ ] 15.6 Create `src/ui/Playfield.tsx` and wire `src/App.tsx`
    - `Playfield` (`playfield` with `data-mode` bound to `mode`): `SceneCanvas` plus a `pointer-events: none` overlay root whose panels set `pointer-events: auto`; mounts `useKeyboardShortcuts` and the `DragController` listeners
    - `App` switches between `MainMenu` and `Playfield` on `screen`, shows the dialogs and toasts on both screens, wraps subtrees in error boundaries that log with `console.warn` and offer a way back to the menu, and keeps the title "Track"
    - _Requirements: 2.1, 2.5, 2.6, 3.1, 3.6, 3.8, 30.8, 37.7, 37.13, 37.15, 40.4_

  - [ ]* 15.7 Write component tests for the main menu
    - jsdom: heading text "Track"; list order and dates; empty state; rename input focus, Enter, blur, Escape and validation message; delete dialog confirm and cancel; placeholder on a broken thumbnail
    - File: `tests/component/MainMenu.test.tsx`
    - _Requirements: 3.5, 3.7, 5.1, 5.3, 5.4, 5.6, 5.7, 6.5, 37.14_

  - [ ]* 15.8 Write component tests for the playfield overlay
    - jsdom: palette groups and labels; highlight for all 13 `selectedTool` values; disabled station with tooltip; palette disabled in Play mode; toggle disabled states; toasts carry `data-testid="toast"`; every interactive control has a non-empty accessible name; each single-instance test id appears at most once
    - File: `tests/component/Playfield.test.tsx`
    - _Requirements: 10.1, 10.4, 10.5, 10.6, 10.7, 12.8, 16.13, 20.6, 37.12, 37.13, 40.6_

- [ ] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Add assets and performance wiring
  - [ ] 17.1 Add CC0 sound files and wire them into `src/audio/soundBank.ts`
    - Add Kenney "Impact Sounds" and "Interface Sounds" (CC0) clips for pickup, place, move, rotate, delete, snap, invalid, bump and ui as `.ogg` (optional `.mp3` second source) under `public/assets/audio/sfx/`; add a CC0 or CC-BY music loop of at most 5 MB under `public/assets/audio/music/` if one fits the style, otherwise keep the `tone` fallback
    - Point `soundBank.ts` at the files; keep synthesis for whistle, chug and any event without a suitable file
    - _Requirements: 25.8, 25.9, 27.2, 27.3, 34.1, 34.4, 34.5, 34.6, 34.7, 34.11, 34.12_

  - [ ] 17.2 Code-split the playfield and add the dev FPS overlay
    - Load `Playfield` (three, R3F, drei, spring) with `React.lazy` and prefetch the chunk right after the menu renders; keep `tone` in its own chunk
    - Add `src/ui/PerfOverlay.tsx`, shown only in development with `?perf=1`, displaying a 10-second average FPS
    - _Requirements: 32.1, 32.2, 32.6_

  - [ ]* 17.3 Write the asset audit test
    - `tests/unit/audit/assets.test.ts`: only `.glb`, `.mp3`, `.ogg` (and `.gitkeep`) under `public/assets/` in the right subfolders; each model ≤ 1,000,000 bytes, each music file ≤ 5,000,000 bytes, total < 20,000,000 bytes; every file has a `CREDITS.md` row with path, title, author, source URL and licence
    - _Requirements: 32.7, 34.2, 34.3, 34.5, 34.6, 34.7_

- [ ] 18. Write end-to-end tests
  - [ ]* 18.1 Write Playwright tests for the test contract
    - Hook defined with 10 functions before the menu shows and kept across menu ↔ playfield navigation; `typeof window.__DIORAMA__ === 'undefined'` in the production build without `?test=1`; every Section 10.1 test id present and unique on its screen; title "Track" on both screens
    - File: `tests/e2e/contract.spec.ts`
    - _Requirements: 3.1, 3.8, 37.1, 37.7, 37.9, 37.10, 37.11, 37.13, 38.1, 38.3, 38.4, 38.5_

  - [ ]* 18.2 Write Playwright tests for hook-driven building and play
    - Place, move, rotate and remove with every reason code; `getConnections` and `getSoundLog` after each call; Play mode entry with and without a station (`data-mode` stays `build`); `getTrain()` motion on a loop and on a dead-end line; manual driving with W and S
    - File: `tests/e2e/hook-flows.spec.ts`
    - _Requirements: 18.2, 18.3, 18.5, 18.6, 20.2, 20.4, 20.5, 21.1, 21.2, 37.15, 39.3, 39.7, 39.9, 39.12, 39.16_

  - [ ]* 18.3 Write Playwright tests for UI building
    - Using `window.__DIORAMA_DEBUG__.tileToScreen`: palette click-to-place, palette drag and drop, board drag, R, Delete, Escape, undo and redo; right-click opens no context menu
    - File: `tests/e2e/ui-build.spec.ts`
    - _Requirements: 9.10, 11.2, 11.3, 11.8, 12.1, 12.2, 12.4, 12.6, 13.3, 13.4, 25.1_

  - [ ]* 18.4 Write Playwright tests for persistence
    - Save, reload and reopen identical; unsaved-changes dialog via Save, Discard and Cancel; corrupt data seeded with `page.addInitScript` is skipped with a warning and no error, and a backup key appears after the next save; audio settings survive a reload
    - File: `tests/e2e/persistence.spec.ts`
    - _Requirements: 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 24.1, 24.2, 24.3, 27.7, 27.8_

  - [ ]* 18.5 Write Playwright tests for layout, accessibility, network and the dev server
    - Canvas fills and follows the viewport; overlay coverage under 25% at 1920 × 1080; keyboard focus ring at least 2 px; no requests to other origins after first load; a smoke test against `npm run dev` that shows the menu and exposes the hook without `?test=1`
    - File: `tests/e2e/layout.spec.ts`
    - _Requirements: 1.9, 2.1, 2.8, 30.8, 38.2, 40.5, 40.8, 41.8, 42.6_

- [ ] 19. Write documentation files and verify the definition of done
  - [ ] 19.1 Write `CREDITS.md`
    - One row per file under `public/assets/` (path, title, author, source URL, licence); a CC-BY row names author, URL and CC-BY; a "Fallbacks" section naming each item, sound event or music replaced and the method (Three.js primitives with procedural wood materials, procedural canvas textures, Web Audio API synthesis, procedural music with `tone`)
    - _Requirements: 34.2, 34.3, 34.10, 42.3, 42.5_

  - [ ] 19.2 Rewrite `README.md`
    - Required Node.js version (v22.17.0 from `.nvmrc`); `npm install`, `npm run dev`, `npm run build` (plus `npm test`, `npm run test:e2e`) with what each does; every control (left click and drag, right-drag orbit, middle-drag pan, wheel zoom, R, Delete/Backspace, Escape, F, W/S, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z); test hook note (`?test=1`); a known-limitations section including D-19 (vehicles may touch on back-to-back curves)
    - _Requirements: 40.7, 40.9_

  - [ ]* 19.3 Write the documentation audit test
    - `tests/unit/audit/docs.test.ts`: README contains the Node version, the three npm commands, every control and a known-limitations heading; `CREDITS.md` has a Fallbacks section
    - _Requirements: 34.10, 40.7, 40.9_

  - [ ] 19.4 Verify a clean install, type-check and build
    - Remove `node_modules/` and `dist/` inside the project, run `npm install` and `npm run build` with Node v22.17.0, then `npm test`; fix every TypeScript error, build error and failing test until all three commands exit with code 0
    - _Requirements: 1.1, 40.2, 40.3, 42.4_

  - [ ] 19.5 Close the definition-of-done gaps
    - Compare the `DioramaTestHook` type, the `data-testid` values, the reason codes and the sound event names against Section 10 of `requirement.md` and fix any mismatch; run `npm run test:e2e` in Chromium, Firefox and WebKit and fix failures and console errors; check that every Must acceptance criterion maps to code or a test, and add missing code where one does not
    - _Requirements: 40.1, 40.4, 42.1, 42.2, 42.6_

- [ ] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; core implementation tasks are never optional.
- The language is TypeScript throughout, as in `design.md`.
- Each task references granular acceptance criteria in `requirements.md` for traceability.
- Each of the 45 Correctness Properties has exactly one property-test sub-task, run with fast-check at no fewer than 100 iterations and tagged with its property number.
- Decision recorded for this plan: `design.md` groups several properties per test file. This plan gives each property its own file in the same folder, so property tasks do not write to the same file and can run in parallel. The coverage is the same.
- Decision recorded for this plan: Properties 11, 12, 15, 27, 30 and 33 depend on store behaviour (history, sound log, `drag.valid`, `isDirty`, toasts, autosave timeline), so they are tested against `createAppStore` with the task 10.5 harness and not against the pure domain functions alone.
- The manual checks in the design's Testing Strategy (visual review, listening review, the 30 fps trace on Intel Iris Xe class hardware, the 25 Mbps first-load check, manual Edge and Safari runs) are not coding tasks and are not in this list. Tasks 17.2 and 18.x provide the tooling those checks use.
- Should and Could requirements (6, 13, 15, 23, 33) are included because the design covers them and they do not put any Must at risk.
- `requirement.md` must not be edited, moved or deleted by any task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.5", "2.6", "6.1", "6.6"] },
    { "id": 3, "tasks": ["2.3", "2.4", "3.1", "4.1", "5.1", "6.2", "6.3", "6.5", "6.7", "8.1", "9.1"] },
    { "id": 4, "tasks": ["3.4", "5.2", "5.3", "6.4", "9.3"] },
    { "id": 5, "tasks": ["4.2", "5.4", "8.2", "8.3", "9.2"] },
    { "id": 6, "tasks": ["4.3", "5.11", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "9.4", "9.5", "9.6", "10.1"] },
    { "id": 7, "tasks": ["3.2", "3.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "10.2", "11.1", "11.2", "14.1", "14.4"] },
    { "id": 8, "tasks": ["10.3", "14.2", "14.5", "14.6", "14.7"] },
    { "id": 9, "tasks": ["10.4", "14.3"] },
    { "id": 10, "tasks": ["10.5", "11.3", "13.1", "13.2", "14.8", "14.9", "14.10", "14.11", "14.13", "15.1"] },
    { "id": 11, "tasks": ["10.6", "10.7", "10.8", "10.9", "10.10", "10.11", "10.12", "10.13", "10.14", "11.4", "11.5", "13.3", "13.4", "14.12", "15.2", "15.3", "15.4", "15.5"] },
    { "id": 12, "tasks": ["10.15", "14.14", "14.15", "15.7"] },
    { "id": 13, "tasks": ["15.6"] },
    { "id": 14, "tasks": ["15.8", "17.1", "17.2"] },
    { "id": 15, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5", "19.1", "19.2"] },
    { "id": 16, "tasks": ["17.3", "19.3", "19.4"] },
    { "id": 17, "tasks": ["19.5"] }
  ]
}
```
