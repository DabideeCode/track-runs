# Feature Specification: Track, a Wooden Train Diorama Builder

**Feature Branch**: `run/speckit-r2`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Build Track, the app described in requirement.md. Treat requirement.md as the complete set of requirements."

**Source of truth**: `requirement.md` v1.1. This spec organises it into user journeys and records
decisions where it is silent. If the two ever disagree, `requirement.md` wins. Glossary terms
(tile, piece, track, decoration, connector, open end, setting, ghost, Build mode, Play mode) and
the orientation rules are those of `requirement.md` Section 4.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a diorama on the grid (Priority: P1)

A user starts a new diorama, picks items from the palette and places tracks and decorations on a
16 × 16 grid. They orbit, pan and zoom to look around. Pieces feel like wooden toys being picked
up and set down, and impossible placements are refused clearly.

**Why this priority**: Building is the core creative activity. Without it nothing else exists to
save or play with.

**Independent Test**: Open a new diorama, drag and click items from the palette onto the grid, and
try invalid placements. This delivers a usable toy-layout builder with no train, saving or audio.

**Acceptance Scenarios**:

1. **Given** a new empty diorama, **When** the user drags Straight track onto a free tile, **Then**
   a ghost follows the pointer snapped to the nearest tile, tinted green, and releasing adds
   exactly one piece on that tile.
2. **Given** a palette item is selected, **When** the user clicks a free tile, **Then** that item is
   placed there.
3. **Given** a tile holds a track, **When** the user drags a decoration onto it, **Then** the ghost is
   tinted red, and releasing cancels the placement with the invalid sound and no change to the
   diorama.
4. **Given** the user drags a Hill so that part of it would be off the grid, **When** they release,
   **Then** the placement is cancelled.
5. **Given** a drag is in progress, **When** the user presses Escape, **Then** the drag is cancelled;
   with no drag active, Escape deselects the palette tool.
6. **Given** any camera position, **When** the user right-drags, middle-drags or scrolls, **Then**
   the view orbits, pans or zooms within its limits, and "Reset view" restores the default view.

---

### User Story 2 - Refine the layout and connect tracks (Priority: P1)

The user selects placed pieces, moves, rotates and deletes them, and joins tracks into a route.
Open ends are marked so gaps are easy to spot, and joining two tracks gives a satisfying snap.

**Why this priority**: A layout cannot become a working railway unless pieces can be corrected and
connected.

**Independent Test**: Place several tracks, then move, rotate and delete them and watch connections
and open-end markers update. This delivers a complete editing experience without the train.

**Acceptance Scenarios**:

1. **Given** a placed piece, **When** the user clicks it, **Then** it is selected and outlined.
2. **Given** a selected piece, **When** the user presses R, **Then** it turns 90° clockwise with an
   ease-out.
3. **Given** a piece is dragged, **When** it is dropped on an invalid tile, **Then** it shakes and
   returns to its previous tile and rotation.
4. **Given** a selected piece, **When** the user presses Delete or Backspace or uses the delete
   button, **Then** it shrinks or lifts away, fades and is removed.
5. **Given** a track with an open end facing a neighbouring tile, **When** a track is dropped there
   in a rotation that would leave it unconnected, **Then** it turns to the first clockwise rotation
   that connects, and the snap sound plays in addition to the place sound.
6. **Given** a station already exists, **When** the user views the palette, **Then** the station item
   is disabled with a tooltip explaining why.
7. **Given** recent edits, **When** the user presses Ctrl+Z (Cmd+Z on macOS), **Then** the last place,
   move, rotate or delete is undone, and Ctrl+Shift+Z (Cmd+Shift+Z) redoes it.

---

### User Story 3 - Play with the train (Priority: P1)

With a station placed, the user switches to Play mode. A locomotive and two carriages run along the
track by themselves, or the user drives them with the keyboard. Back in Build mode the train parks
at the station again.

**Why this priority**: Playing on the tracks you built is the payoff of the whole app.

**Independent Test**: Build a closed loop and a dead-end line, each with a station, then enter Play
mode, watch Auto driving and drive in Manual. This delivers the play experience on top of US1 and
US2.

**Acceptance Scenarios**:

1. **Given** a diorama with no station, **When** the user switches to Play, **Then** the message
   "Place a station to start" appears and the app stays in Build mode.
2. **Given** a station, **When** the user switches to Play, **Then** the train starts automatically in
   Auto driving at 1.5 tiles per second, and editing is disabled.
3. **Given** Auto driving on a line with an open end or buffer stop, **When** the train reaches it,
   **Then** it eases to a stop, pauses for 1 second and runs in the opposite direction.
4. **Given** Auto driving on a closed loop, **When** time passes, **Then** the train keeps running
   indefinitely.
5. **Given** Manual driving, **When** the user holds W or S, **Then** the train moves forward or in
   reverse, reaching 2 tiles per second within 1 second, and stops within 0.5 seconds of release.
6. **Given** Manual driving at an open end or buffer stop, **When** the user holds the key toward it,
   **Then** the train stays stopped, and the opposite key still moves it away.
7. **Given** Play mode, **When** the user returns to Build mode, **Then** the train stops and parks at
   the station with its start facing.
8. **Given** Build mode, **When** the user uses "Flip direction" or presses F, **Then** the parked
   locomotive's departure facing toggles.

---

### User Story 4 - Save, reopen and manage dioramas (Priority: P2)

The user keeps a collection of dioramas. They save work, come back after closing the browser, and
rename or delete entries from the main menu. They cannot lose changes by accident.

**Why this priority**: Saved creations turn a one-off toy into something to return to, but the app
still delights in a single session without it.

**Independent Test**: Create and save two dioramas, reload the page, reopen, rename and delete them,
and try leaving with unsaved changes.

**Acceptance Scenarios**:

1. **Given** no saved dioramas, **When** the app opens, **Then** the main menu shows an empty state
   prompting the user to create one.
2. **Given** a diorama in the playfield, **When** the user presses Save, **Then** it is stored and a
   toast confirms it.
3. **Given** a saved diorama, **When** the page is reloaded and the entry opened, **Then** it opens in
   Build mode exactly as saved.
4. **Given** several saved dioramas, **When** the menu is shown, **Then** each entry shows its name and
   last-edited date, newest first.
5. **Given** unsaved changes, **When** the user goes back to the menu, **Then** they are asked to save,
   discard or cancel.
6. **Given** a rename, **When** the new name is blank or over 40 characters, **Then** it is refused and
   the old name stays.
7. **Given** a delete request, **When** the user confirms in the dialog, **Then** the entry is removed.
8. **Given** a corrupt saved entry, **When** the menu loads, **Then** that entry is skipped, a warning
   is logged and the app keeps working.

---

### User Story 5 - Choose a setting (Priority: P3)

The user switches the diorama between a Bedroom floor and a Kitchen table, changing the mood of the
scene without disturbing their layout.

**Why this priority**: Settings add character, but the toy works fully on the default setting.

**Independent Test**: Build a small layout, switch settings back and forth, save and reopen.

**Acceptance Scenarios**:

1. **Given** a layout on Bedroom floor, **When** the user selects Kitchen table, **Then** the ground,
   props and lighting mood change within 1 second and no piece moves.
2. **Given** a diorama saved on Kitchen table, **When** it is reopened, **Then** it opens on Kitchen
   table.

---

### User Story 6 - Hear the toy come alive (Priority: P3)

Every action has a sound: wooden knocks and clicks while building, a whistle and clatter while the
train runs, and cozy music underneath. The user controls volume and can mute everything.

**Why this priority**: Sound completes the tactile feel, but the app is usable in silence.

**Independent Test**: Perform each build and play action and listen, adjust the volume controls,
reload and confirm the settings persisted.

**Acceptance Scenarios**:

1. **Given** the app has just opened, **When** the user has not interacted yet, **Then** no audio
   plays; after the first interaction music begins.
2. **Given** Build mode, **When** the user places and then deletes a piece, **Then** the two sounds are
   clearly different.
3. **Given** the train is running, **When** its speed changes, **Then** the chug or clatter volume
   follows the speed.
4. **Given** changed volumes and mute, **When** the page is reloaded, **Then** those settings persist.

---

### User Story 7 - Verify the app automatically (Priority: P2)

A test author drives the app through stable element ids and a test hook, and gets the same rules and
sounds a real user would.

**Why this priority**: Definition of done requires this contract to be implemented exactly.

**Independent Test**: With `?test=1` in the URL, use the hook to place, move, rotate and remove
pieces, switch modes and read train state. Confirm results and reason codes match the UI's rules,
and that the hook is absent from a production build without `?test=1`.

**Acceptance Scenarios**:

1. **Given** the URL contains `?test=1`, **When** the app loads, **Then** the test hook is available.
2. **Given** a production build without `?test=1`, **When** the app loads, **Then** the hook is absent.
3. **Given** the hook, **When** it attempts an action the UI would refuse, **Then** it returns
   `ok: false` with the matching reason code and the action has no effect on the diorama.
4. **Given** the hook, **When** it places a track without a rotation, **Then** the auto-adjust rule
   applies; when a rotation is given, it is used as is.

---

### Edge Cases

These are decisions, recorded here as `CLAUDE.md` requires, for situations `requirement.md` does not
settle.

**Placement and editing**

- **Reason priority**: when several rules fail, the first match in this order is reported: `play_mode`,
  `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`. A decoration overlapping any
  track reports `on_track`. Any other overlap reports `occupied`. Non-integer coordinates report `out_of_bounds`.
- **A piece and its own tiles**: a move ignores the moving piece's own tiles, so a Hill can shift by
  one tile.
- **Palette tool and clicks**: while a palette tool is selected, a left click always tries to place, so
  clicking an occupied tile is an invalid placement rather than a selection. With no tool selected, a
  click on an empty tile clears the piece selection. Selecting a tool clears the piece selection.
- **Repeat placing**: the palette tool stays selected after a click placement. The station tool
  deselects itself, because the item becomes disabled.
- **Hover ghost**: the ghost also shows while a tool is selected and the pointer is over the grid, and
  R rotates it. That rotation resets when the tool changes.
- **Dropping outside the grid**: releasing over the overlay or outside the window counts as off the grid.
- **Drop on its own tile**: a piece picked up and released on its own tile with unchanged rotation
  settles back with no `move` sound, no undo step and no unsaved change.
- **Escape**: Escape cancels a drag silently, because the user chose it rather than dropping invalidly.
  With no drag and no tool, Escape clears the piece selection.
- **Moves and auto-adjust**: "dropped" covers both palette drops and moves, so the rule applies to
  either, including the hook's `movePiece`. The whole result is one undo step.
- **Auto-adjust scope**: a track counts as unconnected only if it would have no connection to any
  neighbour. With several candidates, the first clockwise rotation forming any connection wins.
- **Undo**: undo and redo are silent, do nothing in Play mode, and start empty when a diorama is
  opened. Setting and start-facing changes are not undo steps.
- **Text entry**: keyboard shortcuts are ignored while typing in a text field or while a dialog is
  open.
- **Play mode input**: R, F, Delete, Backspace and undo do nothing there. Entering Play mode clears the
  selected tool and the selected piece.

**Train**

- **Spawn point**: the locomotive is centred on the station. "Spawns centred" cannot apply to the whole
  train, since it is longer than the single-tile station. Carriages trail behind it along the track.
- **Running out of track behind**: where the track behind ends, carriages continue in a straight line
  past that end at their fixed spacing, sitting on the surface. They may overlap decorations or the
  grid edge, as nothing collides with the train.
- **Where the train stops**: the front of the leading vehicle stops at the end of the track, or at the
  block of a buffer stop. In reverse the leading vehicle is the last carriage, so a line with room for
  the train never has carriages running past its ends.
- **Track shorter than the train** (for example a lone station): the train cannot fit, so it uses the
  front of the locomotive as the limit in forward and the rear of the locomotive in reverse. It still
  shuttles and never locks up, and carriages overhang as above.
- **Reachable track**: the train runs only on tracks connected to the station. Unconnected tracks are
  allowed and simply never used. Track has no junctions, so each connected run is a line or a loop.
- **Auto and Manual**: entering Play mode always starts in Auto, whatever the toggle was set to.
  Switching to Manual with no key held brings the train to a stop within 0.5 seconds. Switching to Auto
  carries on in the current direction at 1.5 tiles per second. Parking at the station resets the
  direction to `forward`.
- **Both keys**: W and S held together count as no key held.
- **Lost keys**: if the window loses focus, held keys are treated as released.
- **Hidden tab**: time spent with the tab hidden does not advance the train in one jump.
- **No station**: deleting the station removes the parked train, and the hook then
  reports no train.
- **Hook mode calls**: `setMode` to the current mode succeeds and changes nothing, so the train does
  not restart.

**Saving and storage**

- **New dioramas**: a new diorama has no saved entry until its first save or autosave, so an untouched
  one never appears in the menu. Default-name numbering uses the lowest free number against saved
  names.
- **What counts as a change**: changes to pieces, setting or start facing mark the diorama unsaved.
  Mode, camera, selection and audio changes do not.
- **Autosave**: an autosave, like a manual save, shows a toast, and it can create the first saved
  entry. It runs only when there are unsaved changes.
- **Renaming**: rename uses a small dialog whose confirm button is the shared confirm control; Enter
  also confirms. Names are trimmed first, and duplicates are allowed apart from the default-name rule.
  Over-long names are refused, not silently cut. A rename counts as an edit, so it updates the
  last-edited date.
- **Unsaved-changes dialog**: the shared confirm control is Save. Escape equals Cancel.
- **Validation on load**: an entry counts as corrupt if its fields are the wrong shape or if its pieces
  break the rules in FR-8 of `requirement.md`. A whole file that cannot be read, or has an unknown
  version, gives an empty menu and a warning.
- **Unreadable data is kept**: saves never delete entries the app could not read. If the whole file is
  unreadable, a copy is kept under a separate key before the first new save.
- **Storage failure**: if storage is full or unavailable, a toast says the save failed, the diorama
  stays unsaved and the app keeps running. Warnings, not errors, are logged, so normal use stays free
  of console errors.
- **Audio settings**: unreadable audio settings fall back to the defaults.

**Audio**

- **Sound log**: the log records events when they are triggered, including while muted and before the
  first interaction, so results do not depend on audibility. The looping chug is logged once each time
  it starts.
- **Snap**: `snap` plays once after the primary sound whenever a place, move or rotate forms at least
  one new connection.
- **Hook rejections**: a refused hook action logs `invalid`, the same as a refused UI action. A refused
  mode change shows the message and has no sound of its own.

## Requirements *(mandatory)*

Every requirement below is **Must** unless tagged *(Should)* or *(Could)*. These priorities carry the
meanings in `requirement.md` Section 2. The source acceptance criterion or section is in brackets.
Note that this spec's FR-001 numbering is separate from the FR-1 numbering in `requirement.md`.

### Functional Requirements

#### Main menu

- **FR-001** [AC-1.8]: The main menu MUST display the app name "Track" as its heading, and the browser
  tab title MUST be "Track".
- **FR-002** [AC-1.1]: The app MUST open on a main menu listing saved dioramas, each showing its name
  and last-edited date, newest first.
- **FR-003** [AC-1.2]: "New diorama" MUST open an empty playfield in Build mode with the Bedroom floor
  setting and the name "Untitled diorama", or "Untitled diorama 2", "3" and so on if the name is taken.
- **FR-004** [AC-1.3]: Opening a saved diorama MUST load it in Build mode exactly as saved.
- **FR-005** [AC-1.4]: Users MUST be able to rename a diorama. Names MUST be 1 to 40 characters and
  MUST NOT be blank.
- **FR-006** [AC-1.5]: Users MUST be able to delete a diorama after confirming in a dialog.
- **FR-007** [AC-1.6]: With no saves, the menu MUST show an empty state prompting the user to create
  one.
- **FR-008** [AC-1.7] *(Could)*: Each entry MAY show a thumbnail captured at its last save.

#### Setting

- **FR-009** [AC-2.1]: The playfield MUST offer exactly two settings: Bedroom floor and Kitchen table.
- **FR-010** [AC-2.2]: Switching setting MUST change the ground surface, surrounding props and lighting
  mood within 1 second without moving any pieces.
- **FR-011** [AC-2.3]: The setting MUST be saved with the diorama.
- **FR-012** [AC-2.4]: Bedroom floor MUST show warm wooden floorboards with a soft rug and cool
  daylight. Kitchen table MUST show a tabletop surface with warmer light. Props around the grid edge
  MUST give a sense of scale and MUST NOT occupy grid tiles.

#### Grid and camera

- **FR-013** [AC-3.1]: The grid MUST be 16 × 16 tiles centred on the scene origin, visible as subtle
  lines in Build mode and hidden or faded in Play mode.
- **FR-014** [AC-3.2]: Hovering the pointer over the grid MUST highlight the tile under it.
- **FR-015** [AC-3.3]: Right-drag MUST orbit, middle-drag MUST pan and the scroll wheel MUST zoom. The
  left mouse button MUST stay reserved for pieces.
- **FR-016** [AC-3.4]: The camera MUST stay between 20° and 80° from vertical (never below the surface),
  zoom between 4 and 30 units from its target, and keep its target within the grid area.
- **FR-017** [AC-3.5]: A "Reset view" button MUST restore the default camera.

#### Palette

- **FR-018** [AC-4.1, Section 6]: The palette MUST list exactly the 12 items of `requirement.md`
  Section 6 in two groups, Tracks and Decorations, each with a name and an icon or preview.
- **FR-019** [AC-4.2]: The selected palette item MUST be visibly highlighted and held as the selected
  tool.
- **FR-020** [AC-4.3]: The palette MUST be hidden or disabled in Play mode.

#### Placing pieces

- **FR-021** [AC-5.1]: Dragging an item from the palette onto the grid MUST show a ghost that follows
  the pointer and snaps to the nearest tile.
- **FR-022** [AC-5.2]: Clicking a tile while a palette item is selected MUST place that item.
- **FR-023** [AC-5.3]: Releasing on a valid tile MUST place the piece. Releasing off the grid or on an
  invalid tile MUST cancel the placement and play the invalid sound.
- **FR-024** [AC-5.4]: The ghost MUST be tinted green on a valid tile and red on an invalid one, using
  the rules in FR-046 to FR-050.
- **FR-025** [AC-5.5]: Placing a piece MUST add exactly one entry to the diorama's pieces.
- **FR-026** [AC-5.6]: Escape MUST cancel the current drag, or deselect the palette tool if no drag is
  active.

#### Moving, rotating and deleting

- **FR-027** [AC-6.1]: Clicking a placed piece MUST select it and show an outline.
- **FR-028** [AC-6.2]: Dragging a placed piece MUST move it. If the drop is invalid, the piece MUST
  return to its previous tile and rotation.
- **FR-029** [AC-6.3]: R MUST rotate the selected piece, or the ghost during a drag, 90° clockwise.
- **FR-030** [AC-6.4]: Delete or Backspace MUST remove the selected piece, and a delete button in the
  overlay MUST do the same.
- **FR-031** [AC-6.5] *(Should)*: Ctrl+Z (Cmd+Z on macOS) SHOULD undo the last place, move, rotate or
  delete for at least 20 steps, and Ctrl+Shift+Z (Cmd+Shift+Z) SHOULD redo.

#### Tracks and connection

- **FR-032** [AC-7.1]: Tracks MUST always snap to tile centres and to 90° rotations.
- **FR-033** [AC-7.2]: Two tracks MUST count as connected when they sit on adjacent tiles and both have
  a connector on their shared edge.
- **FR-034** [AC-7.3] *(Should)*: When a track is dropped next to an existing track that has an open
  end facing it, and its current rotation would leave it unconnected, it SHOULD rotate to the first
  rotation (clockwise from its current one) that connects. The user MUST still be able to rotate it
  afterwards with R.
- **FR-035** [AC-7.4]: Open ends MUST show a small visual marker in Build mode.
- **FR-036** [AC-7.5]: Making a connection MUST play the snap sound in addition to the place sound.
- **FR-037** [AC-7.6]: Tracks MAY be placed unconnected, and the train handles open ends as in FR-058
  and FR-059.

#### Item catalogue

- **FR-038** [Section 6]: Each of the 12 items MUST match its kind, footprint, connectors at 0°, size
  and description in `requirement.md` Section 6.
- **FR-039** [Section 6]: The Hill's anchor MUST be its north-west tile. It MUST also occupy the tiles to
  the east, south and south-east, and rotating it MUST change only its appearance, not its footprint.
- **FR-040** [Section 6]: The locomotive MUST be about 0.9 tiles long and carriages about 0.8 tiles
  long. The train MUST NOT be a palette item.
- **FR-041** [Section 6]: Wooden parts MUST show visible grain with a soft matte finish (roughness 0.6
  or higher, no mirror reflections). Painted parts MUST be matte. Plastic parts MUST have a slight
  sheen. Edges MUST be softly bevelled or rounded, never razor-sharp.

#### Look and feel

- **FR-042** [Section 7.1]: The visual style MUST meet `requirement.md` Section 7.1: stylised realistic;
  soft, warm, low-saturation colours with no pure black, pure white or neon; rounded corners, generous
  spacing, one clear typeface and a consistent icon style.
- **FR-043** [Section 7.1]: Overlay panels MUST be translucent or softly shadowed and MUST cover no more
  than 25% of the viewport in Build mode.
- **FR-044** [Section 7.1]: The scene MUST have one main directional light with soft shadows plus
  ambient fill, and pieces MUST cast contact shadows on the ground.
- **FR-045** [Section 7.2]: Grab, drag, valid drop, invalid drop, rotate, delete and hover MUST each
  behave exactly as the table in `requirement.md` Section 7.2 states. All motion MUST use easing or
  springs. Nothing may teleport, except that undo and redo MAY apply instantly. Weight MUST be conveyed
  through animation, not simulated physics.

#### Placement rules

- **FR-046** [AC-8.1]: A tile MUST hold at most one piece. A 2 × 2 piece MUST occupy 4 tiles, all of
  which must be free.
- **FR-047** [AC-8.2]: No piece may extend beyond the grid.
- **FR-048** [AC-8.3]: Decorations MUST NOT occupy a tile that holds a track.
- **FR-049** [AC-8.4]: A diorama MUST have at most one station. While one exists, the station palette
  item MUST be disabled with a tooltip explaining why.
- **FR-050** [AC-8.5]: These rules MUST apply equally to UI actions and to the test hook.

#### Start position

- **FR-051** [AC-9.1]: The station MUST be the train's start track, and the train MUST spawn centred on
  it.
- **FR-052** [AC-9.2]: In Build mode the train MUST be shown parked at the station.
- **FR-053** [AC-9.3]: A "Flip direction" control (overlay button or the F key) MUST toggle which way
  the locomotive faces when it departs. Facing 0 means it faces the station's north connector, as
  rotated with the station. Facing 180 means it faces the other connector. The default MUST be 0.
- **FR-054** [AC-9.4]: The start facing MUST be saved with the diorama.

#### Play mode and the train

- **FR-055** [AC-10.1]: A Build/Play toggle MUST switch modes. Entering Play mode without a station MUST
  show "Place a station to start" and stay in Build mode.
- **FR-056** [AC-10.2, AC-10.3, AC-10.4]: Entering Play mode MUST start the train automatically in Auto
  driving. The train MUST be a locomotive plus 2 carriages, all following the track centreline
  including through curves, with carriages trailing at a fixed spacing. "Forward" means the locomotive
  leads; "reverse" means the carriages lead.
- **FR-057** [AC-10.5]: An Auto/Manual toggle in the overlay MUST switch the driving style at any time
  in Play mode.
- **FR-058** [AC-10.6]: In Auto the train MUST run at 1.5 tiles per second. At an open end or buffer stop
  it MUST ease to a stop, pause for 1 second, then run in the opposite direction. On a closed loop it
  MUST run indefinitely.
- **FR-059** [AC-10.7]: In Manual, holding W MUST move the train forward and holding S MUST move it in
  reverse. It MUST reach its top speed of 2 tiles per second within 1 second of a key being held.
  Releasing both keys MUST bring it to a stop within 0.5 seconds. At an open end or buffer stop it MUST
  stop and not move further in that direction.
- **FR-060** [AC-10.8]: Inside a tunnel, the tunnel shell MUST hide the train except near the openings.
- **FR-061** [AC-10.9]: Pieces MUST NOT be placed, moved, rotated or deleted in Play mode.
- **FR-062** [AC-10.10]: Returning to Build mode MUST stop the train and park it back at the station
  with its start facing.

#### Saving and persistence

- **FR-063** [AC-11.1, Section 9]: A Save button MUST store the current diorama (name, setting, start
  facing and pieces) in the browser's local storage, using the key and format in `requirement.md`
  Section 9.
- **FR-064** [AC-11.2]: After a page reload, a saved diorama MUST appear in the main menu and reopen
  identically.
- **FR-065** [AC-11.3]: Returning to the menu with unsaved changes MUST ask the user to save, discard or
  cancel.
- **FR-066** [AC-11.4]: A toast MUST confirm each save.
- **FR-067** [AC-11.5] *(Should)*: While in Build mode, unsaved changes SHOULD be autosaved every 30
  seconds.
- **FR-068** [AC-11.6]: Corrupt or unreadable saved data MUST NOT crash the app. The menu MUST skip that
  entry and log a warning to the console.

#### Audio

- **FR-069** [AC-12.1]: Every build action MUST play its own sound effect: pick up, place, move (on
  drop), rotate, delete, snap (connection made) and invalid placement. Place and delete MUST sound
  clearly different.
- **FR-070** [AC-12.2]: Place, snap and rotate MUST use wood-on-wood sounds, such as a soft knock or
  click.
- **FR-071** [AC-12.3]: Play mode MUST have a whistle when the train starts, a looping chug or clatter
  while it moves with volume following speed, and a soft bump when it stops at a dead end.
- **FR-072** [AC-12.4]: Menu and overlay buttons MUST play a subtle UI click.
- **FR-073** [AC-12.5]: Background music MUST loop in the main menu and the playfield, in a cozy, catchy
  chamber pop, indie folk or acoustic-electronic style, similar in mood to life-simulation and
  park-builder soundtracks. Music from any commercial game MUST NOT be used.
- **FR-074** [AC-12.6]: Audio MUST start only after the first user interaction.
- **FR-075** [AC-12.7, Section 9]: The overlay MUST have a mute toggle and separate volume sliders for
  music and effects, and these settings MUST persist across sessions under the key in
  `requirement.md` Section 9.
- **FR-076** [AC-12.8]: Each sound MUST start within 100 ms of the action that triggers it.

#### Performance

- **FR-077** [Section 7.3]: The app MUST meet every Must limit in `requirement.md` Section 7.3: at least
  30 fps with 100 pieces at 1920 × 1080 on an integrated GPU; the capped render density; the
  one-shadow-light and shadow-size limits; shared repeated geometry; playable within 5 seconds on a
  25 Mbps connection; and total assets under 20 MB.
- **FR-078** [Section 7.3] *(Should)*: A "Low quality" toggle SHOULD turn off shadows and lower render
  resolution.

#### Assets

- **FR-079** [Section 8]: All 3D models, textures, sound effects and music MUST be CC0 or CC-BY, with
  every CC-BY asset credited, and MUST NOT come from commercial games or other copyrighted media.
- **FR-080** [Section 8]: `CREDITS.md` MUST list every asset with its file path, title, author, source
  URL and licence, and MUST note any fallback used.
- **FR-081** [Section 8]: Assets MUST follow the folders, formats and per-file budgets in
  `requirement.md` Section 8.
- **FR-082** [Section 8]: If a suitable asset cannot be obtained, the app MUST fall back to generated
  models, procedural wood materials, synthesised effects and generated music as Section 8 allows. Any
  fallback MUST still meet Sections 6 and 7.

#### Test contract

- **FR-083** [Section 10.1]: Each element listed in `requirement.md` Section 10.1 MUST carry exactly the
  listed test id, plus the extra attributes listed there.
- **FR-084** [Section 10.2]: The test hook MUST be exposed exactly as `requirement.md` Section 10.2
  defines when the URL contains `?test=1` or the app runs in development mode. It MUST NOT be exposed in
  a production build unless the URL contains `?test=1`.
- **FR-085** [Section 10.2]: Hook actions MUST apply exactly the same validation as the UI and trigger
  the same sounds. If `rotation` is omitted in `placePiece`, the auto-adjust rule MUST apply. If it is
  given, it MUST be used as is.
- **FR-086** [Section 10.2]: Hook reason codes and sound event names MUST be exactly those listed in
  `requirement.md` Section 10.2.

#### Quality and delivery

- **FR-087** [Section 11]: The app MUST run in the latest desktop versions of Chrome, Edge, Firefox and
  Safari.
- **FR-088** [Section 11]: Install, development start and production build MUST all succeed from a clean
  clone using the commands in `requirement.md` Section 11, and the build MUST report no type errors.
- **FR-089** [Section 11]: There MUST be no console errors during normal use.
- **FR-090** [Section 11]: Overlay controls MUST show a visible keyboard focus state and have accessible
  names.
- **FR-091** [Section 11]: `README.md` MUST explain how to run the app, list the controls and note any
  known limitations.
- **FR-092** [Sections 2, 12]: Everything in `requirement.md` Section 12, and anything that document
  does not list, MUST stay out of scope.
- **FR-093** [Section 9]: Session state and saved data MUST use exactly the names and types in
  `requirement.md` Section 9. Additional fields are allowed.

### Key Entities *(include if feature involves data)*

Exact names and types are fixed by `requirement.md` Section 9.

- **Diorama**: one saved creation. Has an identity, a name, a setting, a start facing, its pieces,
  created and last-edited times and an optional thumbnail.
- **Piece**: one placed item. Has an identity, a type from the 12 catalogue items, a grid tile and one
  of four rotations. A piece is either a track or a decoration.
- **Connection**: a derived link between two adjacent tracks with connectors on their shared edge. It
  is never stored. Open ends are derived the same way.
- **Train**: one locomotive and two carriages. It is derived from the station and start facing while
  parked, and has a current track, position, direction and speed in Play mode. It is not saved.
- **Session state**: the working state of the open diorama: pieces, selected tool, selected piece, mode,
  driving style, setting, start facing, diorama identity and name, and whether changes are unsaved.
- **Save file**: the versioned collection of dioramas kept in local storage.
- **Audio settings**: mute and the music and effects volumes, kept separately from dioramas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Must acceptance criterion in `requirement.md` passes (Section 13).
- **SC-002**: Every test id, hook method, reason code and sound event name in `requirement.md` Section
  10 behaves as written, verified by automated checks (Section 13).
- **SC-003**: A first-time user can go from opening the app to a train running on a track they built
  in under 5 minutes, using only on-screen controls.
- **SC-004**: With 100 placed pieces at 1920 × 1080 on an integrated GPU such as Intel Iris Xe, the app
  holds at least 30 fps in both Build and Play modes.
- **SC-005**: On first load over a 25 Mbps connection, the user can start building within 5 seconds.
- **SC-006**: Total assets stay under 20 MB, and each file stays within its Section 8 budget.
- **SC-007**: Each sound starts within 100 ms of the action that triggers it.
- **SC-008**: A saved diorama reopens identically after a page reload in 100% of attempts, across both
  settings and all 12 item types.
- **SC-009**: Corrupt saved data causes 0 crashes: the menu still opens and all readable entries remain
  usable.
- **SC-010**: The app runs without console errors through a full session of building, playing, saving,
  reloading and reopening in the latest desktop Chrome, Edge, Firefox and Safari.
- **SC-011**: Overlay panels cover no more than 25% of the viewport in Build mode at 1920 × 1080 and at
  1280 × 720.
- **SC-012**: Each timed interaction in `requirement.md` Section 7.2 completes within its stated time,
  and no piece visibly jumps, except on undo or redo.
- **SC-013**: In a side-by-side review of screenshots of both settings, a reviewer identifies wood
  grain, matte paint and soft plastic, and judges the style neither photorealistic nor flat cartoon.
- **SC-014**: Every overlay control can be reached by keyboard, shows a visible focus state and exposes
  an accessible name.
- **SC-015**: A fresh clone installs, runs and builds with no type errors using the documented commands,
  and `CREDITS.md` lists every asset and any fallback.

## Assumptions

These record interpretations of `requirement.md`, including where two passages pull in different
directions. The Edge Cases section holds the rest of the decisions.

- **Single feature**: Track is delivered as one feature with the priorities of `requirement.md`. The
  user story priorities above order the work only; they do not lower any Must.
- **Users and devices**: a single user on a desktop or laptop browser with a mouse and keyboard. Touch
  and mobile are out of scope. A browser with 3D graphics support is assumed, and its absence is a known
  limitation for `README.md`.
- **Smallest window**: 1280 × 720 is the smallest window the layout is designed for. The performance
  target stays at 1920 × 1080.
- **Place and move sounds**: Section 7.2's "Valid drop" row says the place sound plays, while AC-12.1
  lists a separate move sound on drop. A drop from the palette plays `place` and a drop of a board piece
  plays `move`.
- **When `pickup` plays**: it plays when a drag starts from the palette or the board. Click placement
  and hook calls do not play it, as nothing is picked up.
- **Load time and asset budget**: 20 MB takes about 6.4 seconds at 25 Mbps, so a full budget cannot all
  load inside the 5-second limit. "Playable" means the user can build. Music and any other assets not
  needed to start building may finish loading afterwards.
- **Playfield overlay**: toggles that do not apply stay visible but disabled: Flip direction in Play
  mode, the driving toggle in Build mode and the delete button with nothing selected. The palette is
  disabled rather than hidden in Play mode.
- **What stays available in Play mode**: setting, Save, back to menu, Reset view, and the audio controls
  stay available. Glossary "editing" means changing pieces, so these are not editing. Start facing
  changes only in Build mode, since it applies to the parked train.
- **Audio controls**: the mute toggle and sliders appear on both the main menu and the playfield, since
  music plays on both. Defaults are unmuted, music 50%, effects 80%.
- **Default camera**: it looks at the grid centre from a moderate angle and shows the whole grid at
  1920 × 1080.
- **Hover**: tile highlight and piece hover apply only in Build mode, because the grid is hidden or
  faded and editing is off in Play mode.
- **Page reload**: there is no in-app routing. A reload always returns to the main menu.
- **Dependencies**: `requirement.md` Section 3 fixes the technology, and the constitution restates it.
  This spec does not repeat it.
