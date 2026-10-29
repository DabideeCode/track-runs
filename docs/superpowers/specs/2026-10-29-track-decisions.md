# Track — Design decisions not covered by requirement.md

`requirement.md` is the spec. This file records every choice it leaves open, as required by `CLAUDE.md`.
Each entry is the builder's call.

## Assets (§8)

- **D1. Everything procedural (the §8 fallback).** Models are built from Three.js primitives and merged geometries.
  Textures (wood grain, floorboards, tabletop, block letters) are drawn on canvases at runtime. Sound effects are
  synthesised with the Web Audio API (modal "wood knock" synthesis plus filtered noise). Music is generated with `tone`.
  Reasons: there is no licensing risk, the download is close to 0 MB against the 20 MB budget, and the app is playable well within 5 s.
  `public/assets/{models,textures,audio/sfx,audio/music}/` exist (with `.gitkeep`) and are documented as empty in `CREDITS.md`.

## Interaction

- **D2. Palette press = select + potential drag.** Pressing a palette item selects it (`selectedTool`). Moving the pointer
  over the canvas while it is held turns the press into a drag with a ghost. Releasing over the palette or overlay is just a click,
  with no invalid sound. Releasing over the canvas off-grid or on an invalid tile cancels and plays `invalid`.
- **D3. The tool stays selected after placing**, so the user can place repeatedly. Escape deselects (AC-5.6).
- **D4. With a tool selected, left-clicking always attempts a placement.** Clicking an occupied tile is an invalid
  placement (red ghost plus `invalid` sound). It does not select the piece there. To select pieces, deselect the tool first (Escape or click it again).
- **D5. Pointer-to-tile maths runs on a ray–plane (y = 0) intersection using the live camera.** It does not use R3F's mesh raycasts,
  so drags that start on HTML elements track correctly.
- **D6. Auto-adjust (AC-7.3) applies to every drop of a track, both new placements and moves, from the UI and from the hook.**
  The hook's `placePiece` skips it when `rotation` is given (§10.2). `movePiece` has no rotation parameter, so it applies the rule like a UI drop does.
  The ghost shows the user's rotation; the adjustment happens on drop.
- **D7. Sounds for moves.** A valid move logs `move` (not `place`), plus `snap` if a new connection formed. A new placement logs `place`, plus `snap`.
  A grab from the palette or the board logs `pickup`.
- **D8. Validation reason precedence:** `play_mode` → `not_found` → `out_of_bounds` → `station_limit` → `on_track` → `occupied`.
  A decoration whose footprint touches any track tile gives `on_track`. Any other overlap gives `occupied`.
- **D9. `rotatePiece` and `R` always succeed in Build mode.** Footprints never change with rotation.
- **D10. Flip direction (button and F) is enabled in Build mode only**, because it sets the *start* facing.
- **D11. Keyboard shortcuts are ignored** while focus is in a text input, textarea, select or contenteditable element, or while a dialog is open.

## Train

- **D12. "Spawns centred on the station" means the locomotive is centred on the station** (progress 0.5), so `getTrain().pieceId`
  is the station. Carriages trail behind along the track. Where the track runs out behind, they extend along the straight continuation of the last end, off the track.
- **D13. Canonical path direction per piece:** from its first listed connector to its second (straight, station, tunnel: N→S; curve: S→E).
  The buffer runs from S to its internal dead end at local z = −0.25. `progress` is measured along this canonical direction.
  Facing 0 (towards the station's N connector) is therefore travel towards progress 0.
- **D14. Dead-end detection uses the train's extent.** Moving forward, the locomotive nose (0.45 ahead of the loco centre) must stay on track.
  In reverse, the tail of the last carriage (2.25 behind) must. Spacing: loco 0.9, carriages 0.8, gaps 0.1, so the carriage centres are 0.95 and 1.85 behind the loco centre.
- **D15. Kinematics.** Auto: accelerate and brake at 3 tiles/s²; cruise at 1.5; braking speed ≤ √(2·a·d). Manual: accelerate at 2.5 tiles/s²
  (top speed of 2 in 0.8 s); brake at 5 tiles/s² (from 2 to 0 in 0.4 s); the same √(2·a·d) clamp at ends. In auto, after a 1 s pause at an end the train reverses. If the
  new direction is blocked too, it waits silently (`bump` plays once per arrival at an end).
- **D16. Sound log entries for running.** `whistle` plays on entering Play mode. `chug` is logged once each time the train starts moving from rest
  (the chug loop audio itself is continuous, with volume and tempo following speed). `bump` plays when the train arrives at an end.
- **D17. Train runtime state lives in a module-level object, not in Zustand.** It is updated every frame and read by `getTrain()`.
  §9's single store still holds all game state.

## UI

- **D18. The setting selector is a styled native `<select>`** (values `bedroom`/`kitchen`), for robustness with test automation and keyboard use.
  Other controls use shadcn/Radix (Dialog/AlertDialog, Slider, Tooltip, Button).
- **D19. Toasts are a small custom component** (`role="status"`, `aria-live="polite"`, `data-testid="toast"`). Sonner is not in the allowed dependency list.
- **D20. The unsaved-changes dialog** has Save (`confirm-ok`), Discard (`confirm-discard`) and Cancel. The delete dialog's Delete button is `confirm-ok`.
  The rename dialog's Rename button is `confirm-ok`, and Enter submits.
- **D21. Names are trimmed.** A name is valid if 1–40 characters after trimming. Duplicate names are allowed on rename, and only "New diorama" numbering avoids them.
- **D22. Sliders** are shadcn/Radix Sliders, with the `data-testid` on the slider root and an accessible name on the thumb. Range 0–100.
- **D23. Audio controls appear in both the main menu and the playfield overlay**, because music plays on both screens.
- **D24. Autosave** runs every 30 s in Build mode when `isDirty`. It also creates the save for a never-saved diorama, and shows a quieter "Autosaved" toast.
- **D25. Thumbnails (AC-1.7).** On save, the canvas is re-rendered and downscaled to a 192×108 JPEG data URL.
- **D26. Corrupt storage.** An unparsable `wooden-diorama:v1` value is copied to `wooden-diorama:v1:backup` before the first overwrite.
  A diorama is skipped (with `console.warn`) if any field is invalid or its pieces violate FR-8 when replayed in order.
- **D27. Undo/redo** stores piece-array snapshots (limit 50). It is ignored in Play mode, is applied instantly (no animation), and is cleared when a diorama is opened or created.

## Rendering

- **D28. Shared geometry and materials.** Each piece type is built once, as one merged `BufferGeometry` per material, and shared by every instance
  (1–3 meshes per piece). There is no per-piece `InstancedMesh`, because each piece animates on its own.
- **D29. Soft shadows** use one directional light with PCFSoft shadows and a 2048 map. A blob-shadow decal under lifted pieces spreads and softens with lift height
  (the "shadow softens and spreads" on grab). Low quality: shadows off, DPR 1.
- **D30. Piece animation uses per-frame critically damped springs and small timelines** (pure functions in `src/scene/anim.ts`), not `@react-spring/three`.
  This gives drag velocity for the tilt and keeps one animation system.
