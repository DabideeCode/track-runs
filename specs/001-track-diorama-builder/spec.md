# Feature Specification: Track, a Wooden Train Diorama Builder

**Feature Branch**: `run/speckit-r1`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Build Track, the app described in requirement.md. Treat requirement.md as the complete set of requirements."

**Authority**: `requirement.md` v1.1 is the single source of truth. If this spec and `requirement.md` differ, `requirement.md` wins. Tags such as `[AC-5.3]` point to the requirement each item traces to. Priorities come from `requirement.md` Section 2: an item with no tag is a **Must**, and **(Should)** or **(Could)** is marked where it applies. Exact contract names (test ids, event names, reason codes, field names, storage keys) are defined in `requirement.md` Sections 9 and 10 and are referenced here rather than copied.

## User Scenarios & Testing *(mandatory)*

Story priorities give the build order. Every Must requirement is needed for the app to be complete, whatever the priority of its story.

### User Story 1 - Build a diorama on the grid (Priority: P1)

A person opens a new diorama and sees a wooden scene with a subtle 16 × 16 grid. They pick items from the palette, drag or click them onto tiles, then select, move, rotate and delete them. Tracks snap together, and the app refuses placements that break the rules.

**Why this priority**: Building is the heart of the app, and every other story needs placed pieces.

**Independent Test**: From an empty diorama, place all 12 catalogue items, move and rotate some, delete one, and try an illegal placement. The piece list and the visuals match after each action.

**Acceptance Scenarios**:

1. **Given** an empty Build mode playfield, **When** the user drags Straight track onto a free tile, **Then** a green ghost follows the pointer, snaps to tiles, and one piece is added on release.
2. **Given** a palette item is selected, **When** the user clicks a free tile, **Then** that item is placed there.
3. **Given** a tile holding a track, **When** the user drags a decoration onto it, **Then** the ghost is red, nothing is placed, the piece shakes and disappears, and the invalid sound plays.
4. **Given** a selected placed piece, **When** the user presses R, **Then** it turns 90° clockwise with an eased animation and the rotate sound plays.
5. **Given** a placed piece, **When** the user drags it to an invalid tile, **Then** it returns to its previous tile and rotation.
6. **Given** a track with an open end facing a free tile, **When** the user drops a track there at a rotation that would not connect, **Then** the new track rotates to the first clockwise rotation that connects, and both the place and snap sounds play.
7. **Given** a diorama with a station, **When** the user looks at the palette, **Then** the station item is disabled and a tooltip explains why.
8. **Given** the playfield, **When** the user right-drags, middle-drags or scrolls, **Then** the camera orbits, pans or zooms within its limits, and "Reset view" restores the default view.

---

### User Story 2 - Run the train (Priority: P1)

The user switches to Play mode. A locomotive and two carriages depart the station and follow the track they built. The train can drive itself or be driven with W and S. It stops and turns back at dead ends and runs forever on a closed loop.

**Why this priority**: Playing with what you built is the payoff of the product.

**Independent Test**: Lay a closed loop and a separate line ending in a buffer stop, each with a station in turn. Enter Play mode and confirm Auto and Manual behaviour on each.

**Acceptance Scenarios**:

1. **Given** no station, **When** the user switches to Play, **Then** the message "Place a station to start" appears and the mode stays Build.
2. **Given** a station on a closed loop, **When** the user enters Play, **Then** the whistle plays and the train runs in Auto at 1.5 tiles per second indefinitely, with all three vehicles on the track centreline.
3. **Given** Auto driving towards an open end or buffer stop, **When** the train arrives, **Then** it eases to a stop, the bump plays, it pauses for 1 second, then runs in the opposite direction.
4. **Given** Manual driving, **When** W is held, **Then** the train reaches 2 tiles per second within 1 second, and releasing the key stops it within 0.5 seconds.
5. **Given** Manual driving at a dead end, **When** the key for that direction is held, **Then** the train will not move further that way.
6. **Given** Play mode, **When** the user tries to place, move, rotate or delete a piece, **Then** nothing changes.
7. **Given** a running train, **When** the user returns to Build mode, **Then** the train stops and parks at the station with its saved start facing.
8. **Given** a tunnel on the route, **When** the train passes through, **Then** the shell hides it except near the openings.

---

### User Story 3 - Keep and manage dioramas (Priority: P1)

The app opens on a main menu of saved dioramas. Users save their work, come back after a reload, and rename or delete entries. They are never at risk of silently losing changes.

**Why this priority**: The app opens on this screen, and users need their creations to last.

**Independent Test**: Create and save a diorama, reload the page, reopen it and confirm it is identical. Then rename it, delete it, and confirm the empty state returns.

**Acceptance Scenarios**:

1. **Given** no saved dioramas, **When** the app opens, **Then** the "Track" heading and an empty state prompting creation are shown.
2. **Given** saved dioramas, **When** the menu shows, **Then** each lists its name and last-edited date, newest first.
3. **Given** a diorama named "Untitled diorama" exists, **When** the user chooses New diorama, **Then** the new one is called "Untitled diorama 2" and opens empty in Build mode on Bedroom floor.
4. **Given** a saved diorama, **When** the page reloads and the user opens it, **Then** its name, setting, start facing and pieces are identical, in Build mode.
5. **Given** unsaved changes, **When** the user returns to the menu, **Then** they are asked to save, discard or cancel.
6. **Given** a saved entry, **When** the user deletes it, **Then** a confirmation is required first.
7. **Given** one corrupt saved entry among valid ones, **When** the menu loads, **Then** that entry is skipped, a warning is logged, and the other entries appear.

---

### User Story 4 - Choose the setting and start direction (Priority: P2)

The user switches between Bedroom floor and Kitchen table to change the mood of the scene, and chooses which way the locomotive leaves the station.

**Why this priority**: Both add personality and variety, but the core loop works without them.

**Independent Test**: On a diorama with pieces, switch setting and flip direction, save, reload, and confirm both persist while no piece has moved.

**Acceptance Scenarios**:

1. **Given** a populated diorama, **When** the user switches setting, **Then** the surface, surrounding props and lighting change within 1 second and no piece moves.
2. **Given** a station, **When** the user presses F or Flip direction, **Then** the parked locomotive faces the other way and the train departs that way in Play mode.
3. **Given** a changed setting and start facing, **When** the diorama is saved and reopened, **Then** both are restored.

---

### User Story 5 - Feel and sound like a real wooden toy (Priority: P2)

Every interaction has weight and sound. Pieces lift, settle, shake and shrink with soft motion. Wooden clicks accompany building, the train whistles and chugs, and cozy music plays in the background.

**Why this priority**: This is what separates Track from a plain grid editor. It is a Must, but it is layered on top of working behaviour.

**Independent Test**: Perform each moment in `requirement.md` Section 7.2 and each sound in FR-12, checking timing and sound logging. Change the audio settings and reload to confirm they persist.

**Acceptance Scenarios**:

1. **Given** a piece, **When** it is grabbed, **Then** it lifts 0.3 tiles within 150 ms and its shadow softens and spreads.
2. **Given** a drag, **When** the target tile changes, **Then** the piece follows with a damped spring that settles within 250 ms and tilts up to 8° toward its movement.
3. **Given** a valid drop, **When** the piece lands, **Then** it settles in under 300 ms and the place sound plays on contact.
4. **Given** a fresh page load, **When** the user has not interacted yet, **Then** no audio plays; **When** they first interact, **Then** music begins.
5. **Given** changed mute and volume settings, **When** the page reloads, **Then** the settings are kept.
6. **Given** any build action, **When** it occurs, **Then** its own distinct sound starts within 100 ms.

---

### User Story 6 - Work safely and comfortably (Priority: P3)

Conveniences make longer sessions easier: undo and redo, autosave, a low-quality option for weak devices, and optional menu thumbnails.

**Why this priority**: These are Should and Could items. They are expected or welcome, but only when no Must is put at risk.

**Independent Test**: Make more than 20 edits and undo 20 of them, wait 30 seconds and confirm the autosave, then toggle Low quality.

**Acceptance Scenarios**:

1. **Given** at least 20 edits, **When** the user presses Ctrl+Z (Cmd+Z on macOS) 20 times, **Then** each edit is reversed in turn, and Ctrl+Shift+Z (Cmd+Shift+Z) redoes them.
2. **Given** unsaved changes in Build mode, **When** 30 seconds pass, **Then** the diorama is saved automatically.
3. **Given** a running scene, **When** Low quality is turned on, **Then** shadows turn off and render resolution drops.
4. **Given** a saved diorama, **When** the menu shows, **Then** its entry may show a thumbnail captured at its last save.

---

### User Story 7 - Be verifiable by automated tests (Priority: P1)

An automated test suite drives the app through named on-screen elements and a test hook, and inspects its state without reading pixels.

**Why this priority**: `requirement.md` makes this contract a Must and a condition of being done.

**Independent Test**: Open the app with `?test=1`, then exercise every hook function and locate every listed test id. Confirm the hook is absent from a production build without that URL flag.

**Acceptance Scenarios**:

1. **Given** the app is opened with `?test=1`, **When** a test calls the hook's place function on an occupied tile, **Then** it gets `ok: false` with reason `occupied`, no piece is added, and `invalid` is logged.
2. **Given** a production build without `?test=1`, **When** a test looks for the hook, **Then** it does not exist.
3. **Given** two connected tracks, **When** a test requests connections, **Then** that pair is returned.

---

### Edge Cases

- **Release over an overlay panel or outside the window**: this counts as releasing off the grid, so the placement is cancelled with the invalid sound and a moved piece returns home.
- **Pointer capture lost mid-drag (for example the window loses focus)**: the drag is cancelled as if Escape were pressed, with no invalid sound.
- **Hill near the east or south edge**: an anchor in column 15 or row 15 is invalid because the footprint would leave the grid.
- **Moving a piece onto itself**: a hill may move one tile so that its new footprint overlaps its old one, because a piece never blocks itself. Dropping a piece on its own tile with no change plays the move sound but creates no edit, no undo step and no unsaved change.
- **Moving the station**: this is allowed and never triggers the station limit. The parked train goes with it.
- **Deleting the station**: the parked train disappears with it. The station palette item is enabled again and the saved start facing is kept. Undoing brings both back.
- **Station with little or no track behind or ahead**: see decision D-09.
- **Both W and S held**: treated as neither held, so the train stops.
- **W or S held when the window loses focus**: treated as released.
- **Auto switched to Manual during the 1 second pause**: the pause ends and the train stays stopped until a key is held.
- **Manual switched to Auto at a dead end**: treated as arriving at that dead end, so the train pauses for 1 second and then runs the other way.
- **Whole save file unreadable or of an unknown version**: the menu shows the empty state, a warning is logged and the app keeps working (D-18).
- **Storage full or unavailable**: the save fails with a toast saying so, the diorama stays marked unsaved and the app keeps working.
- **Unreadable audio settings**: defaults are used.
- **Blank or over-long rename**: rejected with a visible message, and the old name is kept.
- **Modifier or typing conflicts**: shortcuts are ignored while typing in a text field or while a dialog is open (D-20).

## Requirements *(mandatory)*

### Functional Requirements

**Main menu**

- **FR-001** `[AC-1.8]`: The main menu MUST show the app name "Track" as its heading, and the browser tab title MUST be "Track".
- **FR-002** `[AC-1.1]`: The menu MUST list saved dioramas with name and last-edited date, newest first.
- **FR-003** `[AC-1.6]`: With no saves, the menu MUST show an empty state prompting the user to create one.
- **FR-004** `[AC-1.2]`: "New diorama" MUST open an empty playfield in Build mode with the Bedroom floor setting, named "Untitled diorama", or "Untitled diorama 2", "3" and so on if that name is taken.
- **FR-005** `[AC-1.3]`: Opening a saved diorama MUST load it in Build mode exactly as saved.
- **FR-006** `[AC-1.4]`: Users MUST be able to rename a diorama. Names MUST be 1 to 40 characters and MUST NOT be blank.
- **FR-007** `[AC-1.5]`: Users MUST be able to delete a diorama after confirming in a dialog.
- **FR-008** `[AC-1.7]` **(Could)**: Each entry may show a thumbnail captured at its last save.

**Setting**

- **FR-009** `[AC-2.1]`: The playfield MUST offer exactly two settings: Bedroom floor and Kitchen table.
- **FR-010** `[AC-2.2]`: Switching setting MUST change the ground surface, surrounding props and lighting mood within 1 second, without moving any pieces.
- **FR-011** `[AC-2.3]`: The setting MUST be saved with the diorama.
- **FR-012** `[AC-2.4]`: Bedroom floor MUST show warm wooden floorboards, a soft rug and cool daylight. Kitchen table MUST show a tabletop surface with warmer light. Props around the grid edge MUST give a sense of scale and MUST never occupy grid tiles.

**Grid and camera**

- **FR-013** `[AC-3.1]`: The 16 × 16 grid MUST be centred on the scene origin, visible as subtle lines in Build mode, and hidden or faded in Play mode.
- **FR-014** `[AC-3.2]`: Hovering the pointer over the grid MUST highlight the tile under it.
- **FR-015** `[AC-3.3]`: Right-drag MUST orbit, middle-drag MUST pan and the scroll wheel MUST zoom. The left mouse button MUST be reserved for pieces.
- **FR-016** `[AC-3.4]`: The camera MUST stay between 20° and 80° from vertical, never go below the surface, zoom between 4 and 30 units from its target, and keep its target within the grid area.
- **FR-017** `[AC-3.5]`: A "Reset view" button MUST restore the default camera.

**Item catalogue**

- **FR-018** `[Section 6]`: The app MUST offer exactly the 12 items in `requirement.md` Section 6, with the type ids, kinds, footprints, connectors at 0°, descriptions and sizes given there.
- **FR-019** `[Section 6]`: The hill's anchor MUST be its north-west tile. It MUST also occupy the tiles to the east, south and south-east, and rotating it MUST change only its appearance, not its footprint.
- **FR-020** `[Section 6]`: Wooden parts MUST show visible grain with a soft matte finish (roughness 0.6 or higher, no mirror reflections). Painted parts MUST be matte. Plastic parts MUST have a slight sheen. Edges MUST be softly bevelled or rounded, never razor-sharp.
- **FR-021** `[Section 6]`: The locomotive MUST be about 0.9 tiles long and each carriage about 0.8 tiles long. The train MUST NOT be a palette item.
- **FR-022** `[Section 4]`: Grid position, world position, compass directions and clockwise rotation MUST follow the orientation rules in `requirement.md` Section 4.

**Palette**

- **FR-023** `[AC-4.1]`: The palette MUST list all 12 items in two groups, Tracks and Decorations, each with a name and an icon or preview.
- **FR-024** `[AC-4.2]`: The selected palette item MUST be visibly highlighted and recorded as `selectedTool`.
- **FR-025** `[AC-4.3]`: The palette MUST be hidden or disabled in Play mode.

**Placing pieces**

- **FR-026** `[AC-5.1]`: Dragging an item from the palette onto the grid MUST show a ghost that follows the pointer and snaps to the nearest tile.
- **FR-027** `[AC-5.2]`: Clicking a tile while a palette item is selected MUST also place that item (see D-01 and D-02).
- **FR-028** `[AC-5.3]`: Releasing on a valid tile MUST place the piece. Releasing off the grid or on an invalid tile MUST cancel the placement and play the invalid sound.
- **FR-029** `[AC-5.4]`: The ghost MUST be tinted green on a valid tile and red on an invalid one, using the placement rules below.
- **FR-030** `[AC-5.5]`: Placing a piece MUST add exactly one entry to the piece list.
- **FR-031** `[AC-5.6]`: Escape MUST cancel the current drag, or deselect the palette tool if no drag is active.

**Moving, rotating and deleting**

- **FR-032** `[AC-6.1]`: Clicking a placed piece MUST select it and show an outline.
- **FR-033** `[AC-6.2]`: Dragging a placed piece MUST move it. If the drop is invalid, the piece MUST return to its previous tile and rotation.
- **FR-034** `[AC-6.3]`: R MUST rotate the selected piece, or the ghost during a drag, 90° clockwise.
- **FR-035** `[AC-6.4]`: Delete, Backspace and an overlay delete button MUST each remove the selected piece.
- **FR-036** `[AC-6.5]` **(Should)**: Ctrl+Z (Cmd+Z on macOS) SHOULD undo the last place, move, rotate or delete for at least 20 steps, and Ctrl+Shift+Z (Cmd+Shift+Z) SHOULD redo.

**Track snapping and connection**

- **FR-037** `[AC-7.1]`: Tracks MUST always snap to tile centres and 90° rotations.
- **FR-038** `[AC-7.2]`: Two tracks MUST be treated as connected when they sit on adjacent tiles and both have a connector on their shared edge.
- **FR-039** `[AC-7.3]` **(Should)**: When a track is dropped next to an existing track with an open end facing it, and its current rotation would leave it unconnected, it SHOULD rotate to the first rotation, clockwise from its current one, that connects. The user can still rotate it afterwards with R.
- **FR-040** `[AC-7.4]`: Open ends MUST show a small visual marker in Build mode.
- **FR-041** `[AC-7.5]`: Making a connection MUST play the snap sound in addition to the place sound.
- **FR-042** `[AC-7.6]`: Tracks MAY be placed unconnected.

**Placement rules**

- **FR-043** `[AC-8.1]`: A tile MUST hold at most one piece. All 4 tiles of a 2 × 2 piece MUST be free.
- **FR-044** `[AC-8.2]`: No piece may extend beyond the grid.
- **FR-045** `[AC-8.3]`: Decorations MUST NOT occupy a tile that holds a track.
- **FR-046** `[AC-8.4]`: A diorama MUST have at most one station. While one exists, the station palette item MUST be disabled, with a tooltip explaining why.
- **FR-047** `[AC-8.5]`: These rules MUST apply equally to UI actions and to the test hook.

**Start position**

- **FR-048** `[AC-9.1]`: The station MUST be the train's start track, and the train MUST spawn centred on it (see D-09).
- **FR-049** `[AC-9.2]`: In Build mode, the train MUST be shown parked at the station.
- **FR-050** `[AC-9.3]`: A "Flip direction" control and the F key MUST toggle which way the locomotive faces when it departs. Facing 0 means it faces the station's north connector as rotated with the station; facing 180 means it faces the other connector. The default MUST be 0.
- **FR-051** `[AC-9.4]`: The start facing MUST be saved with the diorama.

**Play mode and the train**

- **FR-052** `[AC-10.1]`: A Build/Play toggle MUST switch modes. Entering Play without a station MUST show "Place a station to start" and stay in Build mode.
- **FR-053** `[AC-10.2]`: Entering Play MUST start the train automatically in Auto driving.
- **FR-054** `[AC-10.3]`: The train MUST be a locomotive plus 2 carriages. All three MUST follow the track centreline, including through curves, with the carriages trailing at a fixed spacing.
- **FR-055** `[AC-10.4]`: "Forward" MUST mean the locomotive leads, and "reverse" MUST mean the carriages lead.
- **FR-056** `[AC-10.5]`: An Auto/Manual toggle MUST switch the driving style at any time in Play mode.
- **FR-057** `[AC-10.6]`: In Auto, the train MUST run at 1.5 tiles per second. At an open end or buffer stop it MUST ease to a stop, pause for 1 second, then run in the opposite direction. On a closed loop it MUST run indefinitely.
- **FR-058** `[AC-10.7]`: In Manual, holding W MUST move the train forward and holding S MUST move it in reverse. It MUST reach its top speed of 2 tiles per second within 1 second of a key being held, and releasing both keys MUST bring it to a stop within 0.5 seconds. At an open end or buffer stop it MUST stop and refuse to move further in that direction.
- **FR-059** `[AC-10.8]`: Inside a tunnel, the shell MUST hide the train except near the openings.
- **FR-060** `[AC-10.9]`: Pieces MUST NOT be placed, moved, rotated or deleted in Play mode.
- **FR-061** `[AC-10.10]`: Returning to Build mode MUST stop the train and park it at the station with its saved start facing.

**Saving and persistence**

- **FR-062** `[AC-11.1]`: A Save button MUST store the current diorama (name, setting, start facing and pieces) on the user's device.
- **FR-063** `[AC-11.2]`: After a page reload, a saved diorama MUST appear in the main menu and reopen identically.
- **FR-064** `[AC-11.3]`: Returning to the menu with unsaved changes MUST ask the user to save, discard or cancel.
- **FR-065** `[AC-11.4]`: A toast MUST confirm each save.
- **FR-066** `[AC-11.5]` **(Should)**: While in Build mode, unsaved changes SHOULD be autosaved every 30 seconds.
- **FR-067** `[AC-11.6]`: Corrupt or unreadable saved data MUST never crash the app. The menu MUST skip that entry and log a warning to the console.

**Audio**

- **FR-068** `[AC-12.1]`: Every build action MUST play its own sound: pick up, place, move (on drop), rotate, delete, snap (connection made) and invalid placement. Place and delete MUST sound clearly different.
- **FR-069** `[AC-12.2]`: Place, snap and rotate MUST use wood-on-wood sounds, such as a soft knock or click.
- **FR-070** `[AC-12.3]`: Play mode MUST have a whistle when the train starts, a looping chug or clatter while it moves with volume following speed, and a soft bump when it stops at a dead end.
- **FR-071** `[AC-12.4]`: Menu and overlay buttons MUST play a subtle UI click.
- **FR-072** `[AC-12.5]`: Background music MUST loop in the main menu and the playfield, in a cozy, catchy chamber pop, indie folk or acoustic-electronic style. Music from any commercial game MUST NOT be used.
- **FR-073** `[AC-12.6]`: Audio MUST start only after the first user interaction.
- **FR-074** `[AC-12.7]`: The overlay MUST have a mute toggle and separate music and effects volume sliders, and these settings MUST persist across sessions.
- **FR-075** `[AC-12.8]`: Each sound MUST start within 100 ms of the action that triggers it.

**Look and feel**

- **FR-076** `[Section 7.1]`: The app MUST follow the stylised realistic style, the soft warm palette with no pure black, pure white or neon, and the interface and lighting rules in `requirement.md` Section 7.1.
- **FR-077** `[Section 7.1]`: Overlay panels MUST cover no more than 25% of the viewport in Build mode.
- **FR-078** `[Section 7.2]`: Grab, drag, valid drop, invalid drop, rotate, delete and hover MUST each behave as the table in `requirement.md` Section 7.2 requires. Weight MUST be conveyed through animation, not simulated physics.
- **FR-079** `[Section 7.2]`: All motion MUST use easing or springs, and nothing may teleport, except that undo and redo MAY apply instantly.
- **FR-080** `[Section 3]`: In the playfield the 3D scene MUST fill the viewport. All controls (menus, palette, buttons, dialogs, toasts) MUST sit in a separate layer above it, and the 3D scene MUST contain only the scene itself.

**Performance**

- **FR-081** `[Section 7.3]`: The app MUST meet the rendering limits in `requirement.md` Section 7.3: capped pixel ratio, at most one shadow-casting light with a limited shadow map, and shared or instanced repeated items.
- **FR-082** `[Section 7.3]` **(Should)**: A "Low quality" toggle SHOULD turn off shadows and lower render resolution.

**Assets**

- **FR-083** `[Section 8]`: All 3D models, textures, sound effects and music MUST be CC0 or CC-BY. Every CC-BY asset MUST be credited, and nothing may be taken from commercial games or other copyrighted media.
- **FR-084** `[Section 8]`: `CREDITS.md` MUST list every asset with its file path, title, author, source URL and licence, and MUST note any fallback used.
- **FR-085** `[Section 8]`: Assets MUST follow the folders, formats and size budgets in `requirement.md` Section 8.
- **FR-086** `[Section 8]`: If a suitable asset cannot be obtained, the app MUST use the fallbacks in `requirement.md` Section 8 (primitive-built models with procedural wood, synthesised sound, generated music), which MUST still meet the catalogue and look-and-feel requirements.

**Data, test contract and quality**

- **FR-087** `[Section 9]`: Game state, piece, diorama and save file data MUST use the names, types and storage keys in `requirement.md` Section 9. Additional fields are allowed. Audio settings MUST be stored separately under the key given there.
- **FR-088** `[Section 10.1]`: Every element listed in `requirement.md` Section 10.1 MUST carry exactly the test id given there.
- **FR-089** `[Section 10.2]`: When the URL contains `?test=1`, or in development mode, the app MUST expose the test hook with exactly the shape in `requirement.md` Section 10.2. Otherwise it MUST NOT be exposed.
- **FR-090** `[Section 10.2]`: Hook actions MUST apply the same validation as the UI, trigger the same sounds, and use only the listed reason codes and sound event names. If `rotation` is omitted in the place action, auto-adjust applies; if it is given, it is used as is.
- **FR-091** `[Section 11]`: The app MUST run in the latest desktop versions of Chrome, Edge, Firefox and Safari.
- **FR-092** `[Section 11]`: Install, development and production build commands MUST succeed from a clean clone, and the production build MUST report no type errors.
- **FR-093** `[Section 11]`: Normal use MUST produce no console errors.
- **FR-094** `[Section 11]`: Overlay controls MUST show a visible keyboard focus state and have accessible names.
- **FR-095** `[Section 11]`: `README.md` MUST explain how to run the app, list the controls and note known limitations.

### Key Entities *(include if feature involves data)*

- **Diorama**: One saved creation. It has an id, a name, a setting, a start facing, its pieces, created and updated timestamps and an optional thumbnail.
- **Piece**: One placed item, either a track or a decoration. It has an id, a type, a tile position and a rotation in 90° steps.
- **Catalogue item**: One of the 12 fixed item definitions, giving kind, footprint, connectors and appearance. Catalogue items are app content, not user data.
- **Connection**: A derived link between two adjacent tracks that share an edge connector. An unmatched connector is an open end.
- **Train**: One locomotive and two carriages. Its live state is the track piece the locomotive is on, progress along that piece, direction, speed and whether it is moving. It is not saved.
- **Game session**: The live state of the open diorama: pieces, selected tool and piece, mode, drive mode, setting, start facing, diorama id and name, and whether there are unsaved changes.
- **Audio settings**: Mute state plus music and effects volumes, stored per device and independent of any diorama.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Must acceptance criteria in `requirement.md` pass.
- **SC-002**: 100% of the test contract passes: every listed test id is present, every hook function behaves as specified, and the hook is absent from a production build without the URL flag.
- **SC-003**: A diorama of 100 placed pieces holds at least 30 frames per second in both Build and Play modes, at 1920 × 1080, on an integrated graphics chip such as Intel Iris Xe.
- **SC-004**: The app is playable within 5 seconds of first load on a 25 Mbps connection, and total assets stay under 20 MB.
- **SC-005**: Every sound starts within 100 ms of its triggering action.
- **SC-006**: Every interaction moment meets its timing: grab within 150 ms, drag settling within 250 ms, valid drop under 300 ms, invalid drop about 200 ms, rotate about 150 ms, delete about 200 ms.
- **SC-007**: Switching setting completes within 1 second, with zero pieces changing position.
- **SC-008**: Train speeds measure 1.5 tiles per second in Auto and reach 2 tiles per second within 1 second in Manual, and Manual stops take no more than 0.5 seconds.
- **SC-009**: Across save and reload, 100% of dioramas reopen with identical name, setting, start facing and pieces.
- **SC-010**: Overlay panels cover no more than 25% of the viewport in Build mode.
- **SC-011**: Zero console errors occur during a full session of building, playing, saving and reloading, including when corrupt saved data is present.
- **SC-012**: The app builds and runs from a clean clone, with no type errors, in the latest desktop versions of Chrome, Edge, Firefox and Safari.
- **SC-013**: `CREDITS.md` accounts for 100% of asset files and every fallback, and every asset is within its size budget.
- **SC-014**: Using only the on-screen controls and the `README.md` control list, a first-time user can go from the main menu to a train running on a closed loop they built themselves.

## Assumptions

Under `CLAUDE.md`, a decision `requirement.md` does not cover is made here and recorded, rather than left open. Each decision below can be changed later by updating this spec.

**Users and scope**

- Users are desktop browser users with a mouse and keyboard. Touch and mobile are out of scope.
- The app is single-user, and all data stays on the user's device.
- Out of scope, as listed in `requirement.md` Section 12: track junctions, switches, crossings, bridges, slopes and elevation; more than one train; physics engines and off-grid placement; touch and mobile; accounts, cloud sync, sharing and any backend; any items beyond the 12 or settings beyond the 2.
- Technology choices are fixed by the project constitution and are not repeated here.

**Decisions on interaction**

- **D-01 Clicks with a tool active**: Clicking a free tile places the tool's item. Clicking a placed piece selects that piece and clears the tool, so AC-5.2 and AC-6.1 both hold. A click on a tile that is free but invalid for the tool (such as a hill overhanging the edge) plays the invalid sound. The ghost is still red over an occupied tile. Tool and piece selection never coexist.
- **D-02 How long a tool stays selected**: A tool chosen by clicking stays selected after placing, so a user can lay several in a row. It ends with Escape, a second click on the same item, choosing a different item, selecting a piece, or entering Play. A tool also ends when placing the station disables the item. A palette drag is one-shot: it sets the tool for its duration, and the tool is cleared when it ends. After a successful drag the new piece is selected, so R works straight away. A click placement leaves nothing selected. Hook actions never change selection.
- **D-03 R with a tool hovering**: R also rotates the hover ghost of a selected tool, and the placement uses that rotation. R with nothing selected does nothing.
- **D-04 Auto-adjust scope**: Auto-adjust applies to every track arrival without an explicit rotation: palette drops, click placement, drag moves of a placed track, and the hook's place action without `rotation`. The hook's move action counts as a drop, so it also auto-adjusts, and a passed `rotation` to the place action never does. "Unconnected" means the track has no connection at all at its current rotation. If no rotation connects, it keeps its current rotation.
- **D-05 Snap sound**: Snap plays whenever an action creates at least one new connection, including a move or rotate. It plays once per action, after that action's own sound.
- **D-06 Reason priority**: When several rules fail, the hook reports the first of `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`. A decoration on a track tile reports `on_track`, and a track on any occupied tile reports `occupied`. Non-integer coordinates report `out_of_bounds`, and an unknown type reports `not_found`.
- **D-07 Sounds for failed hook actions**: Failures with `out_of_bounds`, `station_limit`, `on_track` or `occupied` log `invalid`, as a UI drop would. `play_mode`, `not_found` and `no_station` have no matching UI drop and log nothing. Hook actions log no `pickup` and no `ui`, because no drag or button press occurs.
- **D-08 Sound log**: The log records every sound event whether or not audio is unlocked, muted or at zero volume, so it is reliable before a first interaction. It lasts for the page session, and `chug` is logged each time the loop starts. A palette click logs `ui`; a palette drag start logs `pickup`.

**Decisions on the train**

- **D-09 Spawn position and short lines**: "Centred on the station" means the locomotive is centred on it, facing the start facing, with its carriages behind it along the track. If the track behind runs out, the remaining vehicles sit in a straight line continuing from that end, so a station alone is a valid start. The train stops when its leading vehicle reaches a dead end. A carriage already past a dead end at spawn leads no further that way, so reverse travel ends at the spawn position. This overhang is listed as a known limitation in the README.
- **D-10 Hook train values**: With a station in Build mode, the hook returns the parked train: the station's id, `progress` 0.5, `moving` false, `direction` forward, `speed` 0. With no station it returns null. Progress is measured from the end the locomotive enters when travelling forward, so it rises going forward and falls in reverse. Speed is a non-negative magnitude. `moving` is false during the 1 second pause.
- **D-11 Turning back in Auto**: The train does not turn around. After a dead end it runs with the carriages leading, and `direction` flips between forward and reverse. The whistle plays once on each entry to Play mode, not after pauses.
- **D-12 Drive mode and availability**: Each entry to Play starts in Auto, even if Manual was used last time (AC-10.2). The drive toggle is shown but disabled in Build mode. Flip direction is enabled in Build mode with or without a station, and is disabled in Play mode because the train has already departed. Setting, Save, Back to menu and the audio controls work in both modes.
- **D-13 State and animation timing**: Saved and hook-visible state changes immediately, and animation is presentation only. For example, a deleted piece leaves the piece list at once while it fades. On return to Build the train state parks at once, and the vehicles ease or fade to the station rather than jumping. Flipping direction and Reset view are eased in the same way.

**Decisions on data**

- **D-14 Names**: Leading and trailing spaces are trimmed before validation. "Taken" for default names means an exact match with a saved diorama. Renaming may produce a duplicate name, because only default names are required to be unique. Renaming counts as an edit and updates the last-edited date. Enter confirms and Escape cancels.
- **D-15 Unsaved changes**: Place, move, rotate, delete, undo, redo, setting change and flip direction all mark a diorama as unsaved. Selecting, mode changes, drive changes and camera moves do not. Switching modes does not lose changes.
- **D-16 New dioramas**: A new diorama has no id and is not listed until its first save. An untouched new diorama can be left without a prompt and is not kept.
- **D-17 Unsaved-changes dialog**: Its Save action uses the confirm id `confirm-ok`, its Discard action uses `confirm-discard`, and Cancel stays on the playfield.
- **D-18 Corrupt data**: An entry is unreadable if it fails the Section 9 shape or the placement rules (for example a piece out of range, overlapping pieces or two stations). The whole entry is skipped, not repaired. Skipped entries stay untouched in storage. A file that cannot be read at all is treated as empty and is replaced by the next save.
- **D-19 Autosave and undo**: Autosave runs only when changes exist and shows a toast, because AC-11.4 covers each save. It pauses in Play mode. It can create the first save of a new diorama. Undo history covers only place, move, rotate and delete, covers both UI and hook edits, is unavailable in Play mode, is kept across saves, and clears when a different diorama is opened. A failed action adds no step.

**Decisions on presentation and environment**

- **D-20 Keyboard**: All shortcuts are ignored while typing in a text field or while a dialog is open. Build shortcuts are ignored in Play mode, and W and S are ignored in Auto.
- **D-21 Audio controls**: Mute and the two sliders appear on both the main menu and the playfield. Defaults are unmuted with music at 50% and effects at 80%. Music continues across the menu and playfield without restarting.
- **D-22 Viewport**: The supported size is 1280 × 720 and above. The 25% overlay limit is checked at both 1920 × 1080 and 1280 × 720, with panels collapsed if needed.
- **D-23 Hook availability**: The hook exists from app start, including on the main menu, and acts on the current game session. Opening or creating a diorama replaces that session.
- **D-24 Low quality**: The setting applies per session and is not persisted, because Section 9 defines no storage for it.
- **D-25 Total assets**: The 20 MB limit covers everything under `public/assets/`.
