# Track: design and decisions

`requirement.md` is the source of truth. This file records how it gets built and every decision the
requirements leave open (as `CLAUDE.md` asks). Nothing here overrides `requirement.md`.

## Shape of the code

| Folder | Responsibility | React / three? |
| --- | --- | --- |
| `src/game/` | Catalogue, grid maths, FR-8 rules, connections, track paths, train simulation, persistence, store, test hook | No (store uses Zustand only). Unit-tested with Vitest |
| `src/audio/` | Sound engine and the sound log | No |
| `src/scene/` | Everything inside the WebGL canvas | Yes |
| `src/ui/` | HTML overlay screens and panels | Yes |
| `src/components/ui/` | shadcn/ui components (Radix) | Yes |

One store (`src/game/store.ts`) holds Section 9's `GameState` plus UI extras (screen, drag, toast).
Every mutation, from the UI or the hook, goes through the same store actions, so AC-8.5 and "same
sounds" hold by construction.

## Key technical decisions

- **Picking without R3F events.** All board input runs through window pointer listeners. The pointer
  ray is intersected analytically with each piece's bounding box, then with the ground plane. That
  works with instancing, and one code path serves palette drags, board drags, clicks and hover.
- **Instanced rendering.** Each piece type is one merged geometry per material (wood, paint, plastic),
  drawn with `InstancedMesh`. 100 pieces cost about 30 draw calls. Vertex colours carry the paint.
  A single animation map writes instance matrices; it only runs while something moves.
- **On-demand rendering.** `frameloop="demand"` in Build, `"always"` in Play.
- **Train simulation is outside the canvas.** It runs on its own rAF loop, so `getTrain()` does not
  depend on WebGL.
- **Track chain.** With no junctions, the tracks reachable from the station always form one simple
  path or one simple loop. The train state is a single coordinate `s` along that chain, with `+s` the
  direction the locomotive faces. Forward is always `+s`, reverse is `-s`.
- **Soft contact shadows.** One directional shadow map, plus a cheap instanced radial blob under each
  tall piece. The blob also delivers "shadow softens and spreads" on grab.

## Decisions the requirements leave open

### Placement and input
- A click with a palette tool places the piece and keeps the tool, for repeated placing. Clicking an
  occupied tile with a tool active is an invalid placement, it does not select.
- Dragging from the palette does not change `selectedTool` permanently; after the drop the previous
  tool is restored and the new piece is selected.
- R also rotates the hover ghost while a tool is active (the requirement only names the drag ghost).
- Pressing a placed piece and moving less than 5 px is a click. Grabbing a tile of a hill keeps that
  grab offset while dragging.
- The hill's pointer tile is its anchor when dragged from the palette, so tile coordinates match
  `gridX`/`gridZ` exactly.
- Validation order is `play_mode`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`. Unknown
  piece types return `not_found`.
- Auto-adjust (AC-7.3) runs on every drop, click placement, and hook `placePiece` without a rotation.
  Moves are drops too, so UI drags and hook `movePiece` both apply it.
- A rotation that creates a connection also plays `snap` (AC-7.5 says "making a connection").
- Failed hook actions play `invalid`, except `not_found`, which has no UI equivalent.
- Undo covers pieces only (AC-6.5 lists place, move, rotate and delete). Setting and facing are not
  undoable. Undo is disabled in Play mode, and it stays dirty.

### Train
- "Centred on the station" means the locomotive: `getTrain()` reports the station at progress 0.5.
  Carriages trail behind it.
- `progress` runs along the direction the locomotive faces, so it rises while going forward.
- `getTrain()` returns the parked train in Build mode, and `null` without a station.
- A train stops with its leading end at the end of the chain: the locomotive nose going forward, the
  last carriage's tail in reverse. The buffer stop's usable length ends at the block face.
- When the track behind the station is shorter than the train, the carriages run on along the end
  tangent, past the open end. Reverse travel is then limited to the starting point, so the train can
  always return to the station. This is listed as a known limitation in `README.md`.
- Entering Play resets `driveMode` to `auto` (AC-10.2 says Play starts in Auto).
- Switching Auto to Manual while moving brakes to a stop. Pressing W and S together counts as neither.
- The whistle plays when entering Play mode only, not on each reversal. `chug` is logged each time
  the loop starts, and `bump` once per arrival at a dead end.

### Persistence
- A new diorama has `dioramaId: null` and is not written until its first save or autosave. Opening
  and leaving an untouched new diorama therefore saves nothing and asks nothing.
- `isDirty` tracks pieces, setting, start facing and name. Mode changes are not edits.
- Autosave also shows a toast, because AC-11.4 says each save.
- Saving keeps corrupt entries in storage rather than deleting them. A wholly unreadable file is moved
  to `wooden-diorama:v1:corrupt`, then the app starts clean.
- Thumbnails (AC-1.7) are small JPEG data URLs captured at save.

### Interface
- **Rename** is inline: Enter or blur confirms, Escape cancels, and a check button also confirms
  (`confirm-ok`). Invalid names show an error and keep the old name. Names are trimmed.
- **Setting selector** is a Radix Select. `data-testid="setting-select"` is on its trigger.
- **Volume sliders** are Radix Sliders. The test id is on the root, which forwards focus to the thumb
  so keyboard control works from either.
- `drive-toggle` and `flip-direction` stay in the DOM in both modes, disabled where not applicable.
- The palette is both disabled and hidden in Play mode.
- At most one toast shows at a time, so `data-testid="toast"` always matches one element.
- Added test id: `low-quality` for the Low quality toggle. The preference is stored under
  `wooden-diorama:prefs`.
- No web font: common free fonts are under the OFL, which Section 8 does not allow. The UI uses a
  single system stack (`ui-rounded`, then Segoe UI / system-ui).

### Dependencies
Beyond Section 3's list, the app uses only what shadcn/ui itself is made of: `@radix-ui/*`, `clsx`,
`tailwind-merge`, `class-variance-authority` and `lucide-react`. Vite, Tailwind, TypeScript, Vitest and
Playwright are dev dependencies. `tone` and `@react-spring/three` are unused: real music was sourced,
and the motion lives in the instance animation loop.

### Assets
- **Models:** built from primitives (Section 8 fallback). No CC0 model has the exact curve radius,
  scale and wooden look of Section 6, so `public/assets/models/` is empty and `CREDITS.md` says why.
- **Textures:** ambientCG CC0.
- **Sound effects:** Kenney CC0 recordings, reshaped; the clatter loop is built from them. Whistle is
  CC-BY.
- **Music:** "Life of Riley", Kevin MacLeod, CC-BY 4.0, re-encoded to 128 kbps (3.6 MB).
