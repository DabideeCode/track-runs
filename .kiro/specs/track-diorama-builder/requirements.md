# Requirements Document

## Introduction

Track is a single-page web app in which a user builds a 3D toy wooden train diorama on a 16 × 16 grid and then plays with a small wooden train (a locomotive plus 2 carriages) on the tracks they built. The visual style is stylised realistic: recognisable wooden-toy materials (wood grain, matte paint, soft plastic) on simplified toy shapes, neither photorealistic nor flat cartoon. The experience is cozy and tactile, with soft warm colours, a clean interface and animated, springy interactions.

This document translates `requirement.md` (Version 1.1, 29 October 2026), which is the single source of truth, into EARS-format requirements. Each requirement states its priority (Must, Should or Could) and the section of `requirement.md` it comes from. Where `requirement.md` uses a feel word ("tactile", "cozy", "light enough for weak devices"), the measurable definition from Section 7 of `requirement.md` is used. Decisions that `requirement.md` does not cover are recorded in the "Assumptions and Decisions" section at the end of this document.

Priority meanings (from Section 2 of `requirement.md`):

- **Must**: required for the app to be considered complete.
- **Should**: expected, unless it would put a Must at risk.
- **Could**: nice to have.

Anything not listed here, or listed under "Out of Scope", is out of scope.

## Glossary

### Domain terms (from Section 4 of requirement.md)

- **Track (capital T)**: The name of the app. Lower-case "track" always means a track piece.
- **Diorama**: One saved creation: its name, setting, start facing and placed pieces.
- **Playfield**: The screen where a Diorama is built and played.
- **Tile**: One cell of the 16 × 16 grid, 1 scene unit wide.
- **Piece**: Any placed item: a track or a decoration.
- **Track_Piece**: A Piece the train can run on: `straight`, `curve`, `tunnel`, `station` or `buffer`.
- **Decoration**: A Piece the train cannot run on: `house`, `pineTree`, `roundTree`, `hill`, `car`, `cassette` or `blocks`.
- **Connector**: A Tile edge where a Track_Piece can join its neighbour.
- **Open_End**: A Track_Piece Connector with no connected neighbour.
- **Connection**: The relation between two Track_Pieces on adjacent Tiles that both have a Connector on their shared edge.
- **Setting**: The surface the Diorama sits on: Bedroom floor (`bedroom`) or Kitchen table (`kitchen`).
- **Build_Mode**: Mode for placing, moving, rotating and deleting Pieces (`mode: 'build'`).
- **Play_Mode**: Mode where the train runs; editing is disabled (`mode: 'play'`).
- **Ghost**: A translucent preview of a Piece before the Piece is placed.
- **Anchor_Tile**: The Tile given by a Piece's `gridX` and `gridZ`. For the 2 × 2 hill, the Anchor_Tile is the north-west Tile of the footprint.
- **Footprint**: The set of Tiles a Piece occupies: the Anchor_Tile for 1 × 1 Pieces; the Anchor_Tile plus the Tiles to its east, south and south-east for the hill.
- **Train**: The single locomotive plus 2 carriages. The Train is not a palette item.
- **Start_Facing**: The direction the locomotive faces when the Train departs the station: `0` or `180`.
- **Auto_Driving**: Drive mode in which the Train runs by itself (`driveMode: 'auto'`).
- **Manual_Driving**: Drive mode in which the user drives the Train with the W and S keys (`driveMode: 'manual'`).
- **Forward**: Train motion with the locomotive leading.
- **Reverse**: Train motion with the carriages leading.
- **Dead_End**: An Open_End or the stop block of a buffer stop, at which the Train cannot continue.
- **Build_Action**: A place, move, rotate or delete operation on a Piece.
- **Dirty_State**: The state in which the current Diorama has changes that are not yet saved (`isDirty: true`).

### Orientation conventions (from Section 4 of requirement.md)

- **North**: The −Z direction. **East**: The +X direction.
- **Tile_Coordinates**: Integer pair (gridX, gridZ), each 0 to 15. Tile (0, 0) is the north-west corner Tile. Tile (gridX, gridZ) has its centre at world position x = gridX − 7.5, z = gridZ − 7.5.
- **Rotation**: One of 0°, 90°, 180°, 270°. Rotation 0° is the orientation listed in the Item Catalogue. Rotations are clockwise when viewed from above, in steps of 90°, so a Connector on the north edge moves to the east edge after one rotation.

### System components

- **Track_App**: The complete Track single-page web application.
- **Main_Menu**: The screen listing saved Dioramas; the first screen shown when Track_App opens.
- **Overlay**: All HTML UI controls (menus, palette, buttons, dialogs, toasts) rendered with Tailwind CSS outside the WebGL canvas.
- **Scene_Renderer**: The 3D canvas built with Three.js via @react-three/fiber that renders only the 3D scene.
- **Store**: The single Zustand store holding the GameState defined in the Data Model requirement.
- **Grid_System**: The component that maps the pointer position on the ground plane to the nearest integer Tile_Coordinates.
- **Camera_Controller**: The component that handles camera orbit, pan, zoom, limits and reset.
- **Palette**: The HTML Overlay panel listing the 12 placeable items.
- **Placement_Engine**: The component that validates and applies Build_Actions, shared by the UI and the Test_Hook.
- **Connection_Resolver**: The component that computes Connectors, Connections and Open_Ends of Track_Pieces.
- **History_Manager**: The component that records Build_Actions for undo and redo.
- **Animation_System**: The component that animates Pieces for grab, drag, drop, rotate, delete and hover feedback with springs or easing.
- **Train_Controller**: The component that positions and moves the Train along the track centreline.
- **Persistence_Service**: The component that reads and writes Dioramas and audio settings in localStorage.
- **Audio_Manager**: The component that plays sound effects and background music and applies mute and volume settings.
- **Sound_Log**: The ordered list of sound event names recorded by the Audio_Manager.
- **Test_Hook**: The `window.__DIORAMA__` object defined in the Test Contract.
- **Project_Repository**: The project folder, including `package.json`, `README.md`, `CREDITS.md` and `public/assets/`.

## Requirements

### Requirement 1: Technology Stack

**Priority:** Must. **Source:** Section 3 (Technical constraints).

**User Story:** As a maintainer, I want the app built on a fixed, agreed technology stack, so that the codebase stays consistent and supportable.

#### Acceptance Criteria

1. THE Track_App SHALL have all of its application source code written in TypeScript, and `npm run build` SHALL report zero TypeScript errors.
2. THE Track_App SHALL use React for its user interface and Vite as its development server and production build tool, with `npm run dev` and `npm run build` both running through Vite.
3. THE Track_App SHALL style every Overlay control (menus, Palette, buttons, dialogs, toasts) with Tailwind CSS, and SHALL build its dialogs, toggles, sliders, selects and tooltips from Radix UI primitives via shadcn/ui.
4. THE Scene_Renderer SHALL render the 3D scene with Three.js via @react-three/fiber, and SHALL use @react-three/drei for 3D utilities rather than a second 3D library.
5. THE Track_App SHALL hold the GameState in the single Zustand Store and SHALL use no other state management library.
6. THE Project_Repository SHALL list as runtime dependencies in `package.json` only packages that belong to the stack in criteria 1 to 5 (React, Three.js, @react-three/fiber, @react-three/drei, Zustand, Radix UI primitives via shadcn/ui) plus any of `@react-spring/three`, `howler`, `nanoid` and `tone`; the "Radix UI primitives via shadcn/ui" stack item includes the helper packages that shadcn/ui itself requires (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix packages under `@radix-ui/*`, and `lucide-react` as shadcn/ui's default icon set); build-time tooling (TypeScript, Vite, Tailwind CSS) may appear only as development dependencies.
7. WHILE the procedural music fallback described in the Assets requirement is not in use, THE Track_App SHALL neither import nor run `tone`.
8. THE Track_App SHALL convey weight and motion only through easing and spring animation, and THE Project_Repository SHALL contain no physics engine dependency.
9. THE Track_App SHALL run entirely in the browser as the static files produced by `npm run build`, with no server-side code, and SHALL store and load all Dioramas and audio settings through the Persistence_Service in localStorage without any network request.

### Requirement 2: Application Architecture

**Priority:** Must. **Source:** Section 3 (Architecture constraints).

**User Story:** As a developer, I want a clear separation between the 3D scene, the state and the HTML controls, so that each part can be built and tested independently.

#### Acceptance Criteria

1. WHILE the Playfield is shown, THE Scene_Renderer SHALL size the 3D canvas to the full width and height of the browser viewport, with no scrollbars on the Playfield.
2. THE Track_App SHALL hold every GameState field defined in the Data Model requirement in a single Zustand Store, and the Overlay, the Scene_Renderer and the Test_Hook SHALL read and change GameState only through that Store.
3. WHEN the pointer moves over the ground plane inside the grid area (−8 ≤ x < 8 and −8 ≤ z < 8 in world units), THE Grid_System SHALL map the pointer position to the integer Tile_Coordinates of the Tile whose centre is nearest to the pointer, where a point exactly on a shared Tile edge maps to the Tile to its east or south.
4. WHEN the user clicks a Tile or releases a dragged Piece, THE Placement_Engine SHALL use the Tile_Coordinates produced by the Grid_System at that moment as the target Anchor_Tile of the placement or move.
5. THE Overlay SHALL render every menu, palette, button, dialog and toast as HTML elements styled with Tailwind CSS and layered outside the WebGL canvas, so that each element is present in the page DOM and can carry its `data-testid`.
6. THE Scene_Renderer SHALL render only the 3D scene and SHALL NOT draw any menu, palette, button, dialog or toast inside the WebGL canvas.
7. IF the pointer is over the ground plane outside the grid area, or is not over the ground plane, THEN THE Grid_System SHALL report no Tile_Coordinates, so that no Tile is highlighted and a click or release at that position counts as off the grid.
8. WHEN the browser window is resized while the Playfield is shown, THE Scene_Renderer SHALL resize the 3D canvas to the new viewport width and height within 200 ms without distorting the scene's aspect ratio.

### Requirement 3: Main Menu Listing and Branding

**Priority:** Must. **Source:** FR-1 (AC-1.1, AC-1.6, AC-1.8).

**User Story:** As a user, I want to see my saved dioramas when the app opens, so that I can pick up where I left off.

#### Acceptance Criteria

1. WHEN the Track_App loads or the page is reloaded, with or without `?test=1` in the URL, THE Track_App SHALL show the Main_Menu as the first screen, without first showing the Playfield.
2. THE Main_Menu SHALL list exactly one entry for each readable Diorama stored under the localStorage key `wooden-diorama:v1`, and each entry SHALL show the Diorama's full name and its last-edited date.
3. THE Main_Menu SHALL show each entry's last-edited date as the Diorama's `updatedAt` value, formatted in the user's locale date and time format.
4. THE Main_Menu SHALL order the saved Dioramas by `updatedAt` in descending order, so the Diorama with the most recent `updatedAt` is the first entry.
5. IF no readable saved Dioramas exist (the key `wooden-diorama:v1` is absent, its `dioramas` array is empty, or every stored entry is unreadable), THEN THE Main_Menu SHALL show an empty state, made up of zero Diorama entries and a message that prompts the user to create a Diorama, while the New diorama button stays visible and enabled.
6. WHEN the user returns to the Main_Menu from the Playfield, THE Main_Menu SHALL list the Dioramas currently stored under `wooden-diorama:v1`, including any save made in the Playfield before returning, in the order defined in criterion 4.
7. THE Main_Menu SHALL display the app name "Track" as its level-1 heading, with the heading text exactly "Track".
8. THE Track_App SHALL set the browser tab title to exactly "Track" on every screen, including the Main_Menu and the Playfield.

### Requirement 4: Creating and Opening Dioramas

**Priority:** Must. **Source:** FR-1 (AC-1.2, AC-1.3).

**User Story:** As a user, I want to start a new diorama or reopen a saved one, so that I can create and continue my builds.

#### Acceptance Criteria

1. WHEN the user activates the "New diorama" control (`new-diorama`), THE Track_App SHALL show the Playfield (`playfield` with `data-mode="build"`) in Build_Mode with 0 Pieces and the Bedroom floor Setting (`bedroom`), regardless of the Setting or Pieces of any Diorama opened earlier in the session.
2. WHEN a new Diorama is created and no saved Diorama has the exact name "Untitled diorama" (case-sensitive comparison against saved Dioramas only), THE Track_App SHALL name the new Diorama "Untitled diorama".
3. WHEN a new Diorama is created and a saved Diorama has the exact name "Untitled diorama", THE Track_App SHALL name the new Diorama "Untitled diorama N", where N is the smallest integer of 2 or more for which no saved Diorama has that exact name (for example "Untitled diorama 2", then "Untitled diorama 3").
4. WHEN the user activates the open control (`diorama-open`) on a saved Diorama entry, THE Track_App SHALL show the Playfield in Build_Mode (`data-mode="build"`) with the saved name, Setting and Start_Facing, and with the same number of Pieces as saved, each Piece having the same `id`, `type`, `gridX`, `gridZ` and `rotation` as saved, in the saved order.
5. WHEN a new Diorama is created, THE Store SHALL hold `startFacing` 0, `selectedTool` null, `selectedPieceId` null and `isDirty` false.
6. WHEN a saved Diorama is opened, THE Store SHALL hold `dioramaId` equal to that Diorama's `id`, `isDirty` false, `selectedTool` null and `selectedPieceId` null.
7. WHILE a new Diorama has not yet been saved by the Save button or by autosave, THE Persistence_Service SHALL leave the stored SaveFile unchanged, so the Main_Menu list (`diorama-list`) shows no entry for that Diorama.

### Requirement 5: Renaming and Deleting Dioramas

**Priority:** Must. **Source:** FR-1 (AC-1.4, AC-1.5).

**User Story:** As a user, I want to rename and delete dioramas, so that I can keep my collection organised.

#### Acceptance Criteria

1. WHEN the user activates the rename control (`diorama-rename`) on a saved Diorama entry, THE Main_Menu SHALL show a text input (`rename-input`) on that entry, prefilled with the Diorama's current name and holding keyboard focus.
2. WHEN the user confirms the rename by pressing Enter or by moving focus out of `rename-input`, and the name has 1 to 40 characters after leading and trailing whitespace is trimmed, THE Persistence_Service SHALL store the trimmed name for that Diorama in localStorage and THE Main_Menu SHALL show the trimmed name on that entry, including when another saved Diorama already has the same name, so that the new name still appears after a page reload.
3. IF the user confirms a name that is empty after trimming (including a whitespace-only name) or longer than 40 characters after trimming, THEN THE Main_Menu SHALL keep the previous name both in localStorage and on the entry, and show a validation message stating that names must be 1 to 40 characters.
4. WHEN the user activates the delete control (`diorama-delete`) on a saved Diorama entry, THE Main_Menu SHALL show a confirmation dialog with a `confirm-ok` button labelled "Delete" and a "Cancel" button, and SHALL leave that Diorama in localStorage until the user activates `confirm-ok`.
5. WHEN the user activates `confirm-ok` in the deletion dialog, THE Persistence_Service SHALL remove that Diorama from the SaveFile in localStorage and THE Main_Menu SHALL close the dialog and remove the `diorama-item` with that `data-diorama-id` from `diorama-list`, leaving every other saved Diorama unchanged, so that the deleted Diorama does not reappear after a page reload.
6. WHEN the user activates the "Cancel" button or presses Escape while the deletion dialog is open, THE Main_Menu SHALL close the dialog and keep the Diorama unchanged in localStorage and in `diorama-list`.
7. WHEN the user presses Escape while `rename-input` has focus, THE Main_Menu SHALL close `rename-input` and keep the previous name both in localStorage and on the entry.
8. WHEN a confirmed deletion removes the last saved Diorama, THE Main_Menu SHALL show the empty state that prompts the user to create a Diorama (AC-1.6).
9. IF the Persistence_Service cannot write to localStorage while storing a rename or a deletion, THEN THE Main_Menu SHALL keep the previous name or the Diorama's entry unchanged on screen and show a `toast` saying the change was not saved, without crashing Track_App.

### Requirement 6: Diorama Thumbnails

**Priority:** Could. **Source:** FR-1 (AC-1.7).

**User Story:** As a user, I want to see a small picture of each diorama in the menu, so that I can recognise my builds at a glance.

#### Acceptance Criteria

1. WHEN a Diorama is saved, either by the Save button or by autosave, THE Persistence_Service SHALL capture the 3D scene currently rendered by the Scene_Renderer, excluding all Overlay controls, as an image no larger than 320 × 240 pixels, and store it as an image data URL in the Diorama's `thumbnail` field, replacing any thumbnail stored by an earlier save.
2. WHERE a saved Diorama has a thumbnail, THE Main_Menu SHALL show the thumbnail in that Diorama's entry, scaled to fit the entry's thumbnail area with its aspect ratio preserved.
3. WHERE a saved Diorama has no thumbnail, THE Main_Menu SHALL show a placeholder image in that Diorama's entry, occupying the same thumbnail area as a thumbnail would.
4. IF capturing the thumbnail fails during a save, THEN THE Persistence_Service SHALL still save the Diorama's name, setting, start facing and pieces, and store that Diorama without a `thumbnail` field, so that the Main_Menu shows the placeholder image for it.
5. IF a saved Diorama's `thumbnail` value cannot be displayed as an image, THEN THE Main_Menu SHALL show the placeholder image in that Diorama's entry and keep the entry listed and openable.
6. WHEN a Diorama is renamed in the Main_Menu, THE Persistence_Service SHALL keep that Diorama's `thumbnail` unchanged.

### Requirement 7: Settings

**Priority:** Must. **Source:** FR-2.

**User Story:** As a user, I want to choose where my diorama sits, so that the scene matches the mood I want.

#### Acceptance Criteria

1. THE Playfield SHALL offer exactly two Settings, Bedroom floor (`bedroom`) and Kitchen table (`kitchen`), through a single Setting selector in the Overlay that carries `data-testid="setting-select"` and shows the currently active Setting as selected.
2. WHEN the user selects a Setting different from the active Setting, THE Store SHALL set `setting` to the selected value (`'bedroom'` or `'kitchen'`) and set `isDirty` to `true`.
3. WHEN the user selects a Setting different from the active Setting, THE Scene_Renderer SHALL finish replacing the ground surface, the surrounding props and the lighting mood with those of the selected Setting within 1 second of the selection.
4. WHEN the Setting changes, THE Store SHALL keep the number of Pieces and the `id`, `type`, `gridX`, `gridZ` and `rotation` of every Piece unchanged, and SHALL keep `startFacing`, `mode` and `driveMode` unchanged.
5. WHEN a Diorama is saved, THE Persistence_Service SHALL store the active Setting as the Diorama's `setting` value (`'bedroom'` or `'kitchen'`).
6. WHILE the Setting is Bedroom floor, THE Scene_Renderer SHALL show warm wooden floorboards with visible wood grain extending under all 256 Tiles of the grid, a soft rug, and a main directional light whose colour is cooler (higher colour temperature) than the Kitchen table main light, to give cool daylight lighting.
7. WHILE the Setting is Kitchen table, THE Scene_Renderer SHALL show a tabletop surface extending under all 256 Tiles of the grid and a main directional light whose colour is warmer (lower colour temperature) than the Bedroom floor main light.
8. THE Scene_Renderer SHALL show at least 2 scale-giving props for each Setting (for example a chair leg or a fruit bowl), each placed around the grid edge within 4 scene units of it and entirely outside the grid area (outside x = −8 to 8 and z = −8 to 8), so that no prop occupies a Tile or changes whether a Piece can be placed on any Tile.
9. WHILE the Playfield is in Play_Mode, THE Overlay SHALL keep the Setting selector enabled.
10. WHILE the Playfield is in Play_Mode, WHEN the Setting changes, THE Train_Controller SHALL keep the Train's current track Piece, progress, direction and speed continuous, with no stop, restart or jump caused by the change.

### Requirement 8: Grid Display and Tile Hover

**Priority:** Must. **Source:** FR-3 (AC-3.1, AC-3.2).

**User Story:** As a user, I want to see the grid and the tile under my pointer, so that I know where pieces will go.

#### Acceptance Criteria

1. THE Grid_System SHALL define a grid of 16 × 16 Tiles centred on the scene origin, using the Tile_Coordinates convention, so that the grid covers world positions x from −8 to +8 and z from −8 to +8.
2. WHILE in Build_Mode, THE Scene_Renderer SHALL show the grid as lines along every Tile edge, including the outer border of the grid, with opacity greater than 0 and no greater than 0.35.
3. WHILE in Play_Mode, THE Scene_Renderer SHALL hide the grid lines or fade the grid lines to opacity of 0.1 or less, reaching that state within 300 ms of entering Play_Mode.
4. WHILE in Build_Mode and the pointer is over a Tile, THE Scene_Renderer SHALL highlight exactly one Tile: the Tile at the Tile_Coordinates to which the Grid_System maps the pointer's position on the ground plane, with the highlight confined to that Tile's 1 × 1 area.
5. WHEN, in Build_Mode, the pointer moves from one Tile onto a different Tile, THE Scene_Renderer SHALL remove the highlight from the previous Tile and highlight the new Tile within 100 ms.
6. IF the pointer is outside the grid area (beyond x −8 to +8 or z −8 to +8 on the ground plane) or leaves the 3D canvas, THEN THE Scene_Renderer SHALL show no Tile highlight.
7. WHILE in Play_Mode, THE Scene_Renderer SHALL show no Tile highlight, wherever the pointer is.

### Requirement 9: Camera Controls

**Priority:** Must. **Source:** FR-3 (AC-3.3, AC-3.4, AC-3.5).

**User Story:** As a user, I want to orbit, pan and zoom the camera within sensible limits, so that I can view my diorama from any useful angle without getting lost.

#### Acceptance Criteria

1. WHEN the user drags with the right mouse button over the 3D canvas, THE Camera_Controller SHALL orbit the camera around its target, changing the camera's polar and azimuth angles while leaving the target position and the camera distance unchanged.
2. WHEN the user drags with the middle mouse button over the 3D canvas, THE Camera_Controller SHALL pan the camera by moving the camera and its target together by the same offset, leaving the camera distance and polar angle unchanged.
3. WHEN the user scrolls the mouse wheel over the 3D canvas, THE Camera_Controller SHALL zoom the camera by decreasing the camera distance from its target when the wheel scrolls forward (away from the user) and increasing it when the wheel scrolls backward, leaving the target position unchanged.
4. THE Camera_Controller SHALL reserve the left mouse button for Piece interaction, so that a left mouse button press or drag never orbits, pans or zooms the camera.
5. THE Camera_Controller SHALL keep the camera polar angle between 20° and 80° from vertical, inclusive, so that the camera stays above the surface, holding the polar angle at the nearer bound when orbit input would move it past either bound.
6. THE Camera_Controller SHALL keep the camera distance between 4 and 30 units from its target, inclusive, holding the distance at the nearer bound when zoom input would move it past either bound.
7. THE Camera_Controller SHALL keep the camera target within the grid area (x and z each between −8 and 8, inclusive), holding each axis at the nearer bound when pan input would move the target past it.
8. WHEN the user activates the "Reset view" button (`data-testid="reset-view"`), THE Camera_Controller SHALL animate the camera back to the default camera pose within 1 second: target at the scene origin, distance 18 units, polar angle 50° from vertical, viewed from the south-east (equal positive x and z offsets from the target).
9. WHEN the Playfield opens for a new or saved Diorama, THE Camera_Controller SHALL place the camera at the default camera pose defined in criterion 8.
10. WHEN the user presses the right mouse button over the 3D canvas, THE Camera_Controller SHALL prevent the browser context menu from opening.
11. WHEN the camera is orbited, panned, zoomed or reset, THE Camera_Controller SHALL leave `isDirty` in the Store unchanged.

### Requirement 10: Palette

**Priority:** Must. **Source:** FR-4.

**User Story:** As a user, I want a palette of all available items, so that I can choose what to place.

#### Acceptance Criteria

1. THE Palette SHALL list all 12 items from the Item Catalogue, each exactly once and each carrying the `data-testid` `palette-<type id>`, in two labelled groups: a Tracks group containing the 5 Track_Piece types (`straight`, `curve`, `tunnel`, `station`, `buffer`) and a Decorations group containing the 7 Decoration types (`house`, `pineTree`, `roundTree`, `hill`, `car`, `cassette`, `blocks`).
2. THE Palette SHALL show, for each item, the item name exactly as written in the Item column of the Item Catalogue (for example "Straight track", "Building blocks") together with an icon or preview image of that item.
3. WHILE in Build_Mode, WHEN the user clicks an enabled Palette item or starts dragging it, THE Store SHALL set `selectedTool` to that item's type id, replacing any previously selected tool.
4. WHILE a Palette item is the `selectedTool`, THE Palette SHALL highlight that item, and only that item, with a visual treatment (for example a border, ring or background change) that differs from every non-selected item, updating the highlight within 100 ms of `selectedTool` changing.
5. WHILE `selectedTool` is null (for example after Escape deselects the tool), THE Palette SHALL show no item as highlighted.
6. WHILE in Play_Mode, THE Palette SHALL be hidden or disabled, so that clicking or dragging a Palette item leaves `selectedTool` unchanged and shows no Ghost.
7. WHILE the Diorama contains a station Piece, THE Palette SHALL show the station item (`palette-station`) as disabled with a tooltip explaining that a Diorama allows at most one station, and clicking or dragging that item SHALL leave `selectedTool` unchanged and show no Ghost.

### Requirement 11: Placing Pieces

**Priority:** Must. **Source:** FR-5.

**User Story:** As a user, I want to drag or click items onto the grid with a clear preview, so that I can place pieces exactly where I want.

#### Acceptance Criteria

1. WHILE the user drags a Palette item over the grid, THE Scene_Renderer SHALL show a Ghost of that item, at the Ghost's current Rotation, with its Anchor_Tile on the Tile that the Grid_System maps the pointer to, and SHALL move the Ghost to the new Tile each time the pointer crosses into a different Tile.
2. WHEN the user releases a dragged Palette item on a valid Tile, THE Placement_Engine SHALL place the Piece with its Anchor_Tile on that Tile, using the Ghost's Rotation as adjusted by the auto-adjust rule of the Track Snapping and Connection requirement. A valid Tile is a Tile on which the Clipping and Placement Rules requirement reports no reason code for that Piece's Footprint.
3. WHEN the user left-clicks a Tile while a Palette item is the `selectedTool`, THE Placement_Engine SHALL attempt to place that item with its Anchor_Tile on the clicked Tile and SHALL keep that item as the `selectedTool` after the attempt, whether or not the placement succeeds.
4. IF the user releases a dragged Palette item off the grid or on a Tile that is not a valid Tile, THEN THE Placement_Engine SHALL cancel the placement, remove the Ghost and leave the `pieces` array unchanged, and THE Audio_Manager SHALL play the invalid sound.
5. WHILE the Ghost is over a Tile on which the Clipping and Placement Rules requirement reports no reason code for the Ghost's Footprint, THE Scene_Renderer SHALL tint the Ghost green.
6. WHILE the Ghost is over a Tile on which the Clipping and Placement Rules requirement reports any reason code for the Ghost's Footprint (including a hill Footprint that would extend beyond the grid), THE Scene_Renderer SHALL tint the Ghost red.
7. WHEN a Piece is placed, THE Store SHALL add exactly one entry to the `pieces` array, with an `id` different from every other Piece's `id`, the placed item's `type`, the Anchor_Tile as `gridX` and `gridZ`, and the Piece's final Rotation as `rotation`, and SHALL set `isDirty` to `true`.
8. WHEN the user presses Escape during a drag, THE Placement_Engine SHALL cancel the drag, remove the Ghost and leave the `pieces` array unchanged.
9. WHEN the user presses Escape while no drag is active, THE Store SHALL set `selectedTool` to `null`.
10. IF the user left-clicks a Tile while a Palette item is the `selectedTool` and that Tile is not a valid Tile for the item, THEN THE Placement_Engine SHALL leave the `pieces` array unchanged and THE Audio_Manager SHALL play the invalid sound.

### Requirement 12: Selecting, Moving, Rotating and Deleting Pieces

**Priority:** Must. **Source:** FR-6 (AC-6.1 to AC-6.4).

**User Story:** As a user, I want to select, move, rotate and delete placed pieces, so that I can refine my layout.

#### Acceptance Criteria

1. WHILE in Build_Mode, WHEN the user clicks a placed Piece (presses and releases the left mouse button without the pointer moving to a different Tile) while `selectedTool` is `null`, THE Store SHALL set `selectedPieceId` to that Piece's id and THE Scene_Renderer SHALL show an outline around that Piece and around no other Piece.
2. WHILE in Build_Mode, WHEN the user drags a placed Piece with the left mouse button and releases the Piece on a valid Tile (a Tile on which the placement rules in Requirement 16 allow the Piece's Footprint), THE Placement_Engine SHALL move the Piece's Anchor_Tile to that Tile, keep the Piece's id, apply the Rotation shown at release, and leave the number of entries in the `pieces` array unchanged.
3. IF the user releases a dragged placed Piece off the grid or on a Tile on which the placement rules in Requirement 16 forbid the Piece, THEN THE Placement_Engine SHALL return the Piece to the Tile and Rotation it had when the drag began and leave the `pieces` array unchanged.
4. WHEN the user presses R while a Piece is selected, no drag is active and no text input has focus, THE Placement_Engine SHALL rotate the selected Piece 90° clockwise by setting its `rotation` to the next value in the cycle 0 → 90 → 180 → 270 → 0 and SHALL keep the Piece on its current Tile.
5. WHEN the user presses R during a drag while no text input has focus, THE Placement_Engine SHALL rotate the Ghost or dragged Piece 90° clockwise in the cycle 0 → 90 → 180 → 270 → 0 and SHALL use the resulting Rotation as the Piece's current Rotation when the drag is released (for new placements, the auto-adjust rule in Requirement 15 still applies).
6. WHEN the user presses Delete or Backspace while a Piece is selected, no drag is active and no text input has focus, THE Placement_Engine SHALL remove exactly that Piece's entry from the `pieces` array and THE Store SHALL set `selectedPieceId` to `null`.
7. WHEN the user activates the Overlay delete button while a Piece is selected, THE Placement_Engine SHALL remove exactly that Piece's entry from the `pieces` array and THE Store SHALL set `selectedPieceId` to `null`.
8. WHILE no Piece is selected or the Track_App is in Play_Mode, THE Overlay SHALL show the delete button as disabled.
9. WHEN the user presses Escape during a drag of a placed Piece, THE Placement_Engine SHALL return the Piece to the Tile and Rotation it had when the drag began and leave the `pieces` array unchanged.
10. IF the user presses R, Delete or Backspace while no Piece is selected and no drag is active, THEN THE Placement_Engine SHALL leave the `pieces` array and `selectedPieceId` unchanged and THE Audio_Manager SHALL not log `rotate` or `delete` to the Sound_Log.

### Requirement 13: Undo and Redo

**Priority:** Should. **Source:** FR-6 (AC-6.5).

**User Story:** As a user, I want to undo and redo my edits, so that I can experiment without fear of mistakes.

#### Acceptance Criteria

1. WHEN a place, move, rotate or delete Build_Action succeeds in Build_Mode, whether triggered from the Overlay, the keyboard or the Test_Hook, THE History_Manager SHALL record exactly one history entry for that Build_Action, including any Rotation applied by auto-adjust, and SHALL record no entry for a rejected Build_Action or for a move onto the Piece's current Tile.
2. THE History_Manager SHALL retain at least the 20 most recent recorded Build_Actions, and WHEN recording a Build_Action would exceed its retention limit, THE History_Manager SHALL discard only the oldest recorded Build_Action.
3. WHEN the user presses Ctrl+Z (Cmd+Z on macOS) in Build_Mode and at least one recorded Build_Action has not been undone, THE History_Manager SHALL undo the most recent such Build_Action as follows: a place removes the placed Piece; a move restores the Piece's previous `gridX` and `gridZ`; a rotate restores the Piece's previous `rotation`; a delete restores the Piece with its original `id`, `type`, `gridX`, `gridZ` and `rotation`.
4. WHEN the user presses Ctrl+Shift+Z (Cmd+Shift+Z on macOS) in Build_Mode and at least one undone Build_Action is available, THE History_Manager SHALL redo the most recently undone Build_Action, producing the same Piece `id`, `type`, `gridX`, `gridZ` and `rotation` values that the Build_Action originally produced.
5. WHEN a new Build_Action succeeds after one or more undos, THE History_Manager SHALL discard all undone Build_Actions, so a following Ctrl+Shift+Z (Cmd+Shift+Z on macOS) changes nothing.
6. FOR ALL sequences of 1 to 20 successful Build_Actions, undoing every recorded Build_Action in the sequence SHALL restore the `pieces` array to the state before the sequence (round-trip property).
7. FOR ALL sequences of 1 to 20 successful Build_Actions, undoing and then redoing a Build_Action SHALL produce the same `pieces` array as before the undo (round-trip property).
8. IF the user presses an undo or redo shortcut while the Track_App is in Play_Mode, while a text input has focus, or while no matching Build_Action is available to undo or redo, THEN THE History_Manager SHALL leave the `pieces` array, `isDirty` and the undo and redo history unchanged.
9. WHEN an undo or redo changes the `pieces` array, THE Store SHALL set `isDirty` to `true`, and SHALL set `selectedPieceId` to `null` if it refers to a Piece that is no longer in the `pieces` array.
10. WHEN a saved Diorama is opened or a new Diorama is created from the Main_Menu, THE History_Manager SHALL clear all recorded and undone Build_Actions.

### Requirement 14: Track Snapping and Connection

**Priority:** Must. **Source:** FR-7 (AC-7.1, AC-7.2, AC-7.4 to AC-7.6), Section 6.

**User Story:** As a user, I want tracks to snap together cleanly, so that building a working railway is easy.

#### Acceptance Criteria

1. WHEN a Track_Piece is placed or moved, THE Placement_Engine SHALL store integer `gridX` and `gridZ` values from 0 to 15 and a `rotation` of 0, 90, 180 or 270, and THE Scene_Renderer SHALL show the Track_Piece at rest with its centre at world position x = gridX − 7.5, z = gridZ − 7.5 and its Rotation in an exact multiple of 90°.
2. THE Connection_Resolver SHALL report a Connection between two Track_Pieces if and only if their Tiles are edge-adjacent (the Tile_Coordinates differ by exactly 1 in gridX or gridZ but not both) and each Track_Piece has a Connector on the shared edge. Diagonal neighbours, Decorations and Tiles outside the grid never form a Connection.
3. THE Connection_Resolver SHALL derive each Track_Piece's Connectors from the Item Catalogue's "Connectors at 0°" column, rotated clockwise by the Piece's Rotation (for example, a `curve` at 90° has Connectors W and S, and a `buffer` at 180° has a single Connector N). The stop block side of a `buffer` SHALL NOT be a Connector.
4. THE Connection_Resolver SHALL produce, for every Track_Piece type and every starting Rotation, the original set of Connectors after four successive 90° clockwise rotations (invariant).
5. THE Connection_Resolver SHALL treat Connections as symmetric: for every pair of Track_Pieces A and B, A is connected to B exactly when B is connected to A, and `getConnections()` lists the pair once (symmetry invariant).
6. WHILE in Build_Mode, THE Scene_Renderer SHALL show exactly one marker at the midpoint of the Tile edge of each Open_End, including Connectors that face the grid boundary. The marker SHALL be no wider than 0.25 Tiles, SHALL NOT occupy a Tile or block placement, and SHALL NOT be shown on a Connector that has a Connection.
7. WHEN a successful place, move or rotate Build_Action creates one or more Connections that did not exist before the action, THE Audio_Manager SHALL play the snap sound once, within 100 ms of the action, after the sound of that Build_Action. The Sound_Log SHALL show the Build_Action's event name followed by a single `snap`.
8. THE Placement_Engine SHALL accept a Track_Piece placement on a free Tile within the grid whether or not the placement creates a Connection. A placement without a Connection SHALL show a green Ghost, return `{ ok: true }` from the Test_Hook, and play the place sound without the snap sound.
9. WHEN a Build_Action succeeds, THE Connection_Resolver SHALL update Connections and Open_Ends before the Build_Action's UI handler or Test_Hook call returns. A `getConnections()` call made straight afterwards SHALL reflect the new arrangement, and the Open_End markers SHALL update by the time the Piece's drop, rotate or delete animation ends. Deleting a Track_Piece SHALL remove all of its Connections and turn the neighbours' matching Connectors into Open_Ends.
10. IF a Build_Action fails or is cancelled, THEN THE Connection_Resolver SHALL leave all Connections and Open_End markers as they were, and THE Audio_Manager SHALL NOT play the snap sound.

### Requirement 15: Track Auto-Adjust

**Priority:** Should. **Source:** FR-7 (AC-7.3), Section 10.2.

**User Story:** As a user, I want a new track to turn itself to join the track next to it, so that I spend less time rotating pieces.

#### Acceptance Criteria

1. WHEN a Track_Piece is newly placed (a UI drop from the Palette, a UI click on a Tile with a Palette tool selected, or a Test_Hook `placePiece` call without a `rotation` argument) on a Tile that passes the placement rules and is edge-adjacent to at least one existing Track_Piece with an Open_End on the shared Tile edge, and the new Track_Piece's current Rotation (for a UI placement, the Rotation of the Ghost at the moment of the drop or click) would create no Connection, THE Placement_Engine SHALL give the new Track_Piece the first of the Rotations current + 90°, current + 180° and current + 270° (modulo 360°), checked in that order, that creates at least one Connection, and SHALL store that Rotation in the new Piece's entry in the Store's `pieces` array as part of the same place Build_Action.
2. IF none of the Rotations current + 90°, current + 180° and current + 270° of the new Track_Piece creates a Connection, THEN THE Placement_Engine SHALL complete the placement with the new Track_Piece's current Rotation unchanged.
3. WHEN the user presses R while a Track_Piece rotated by the auto-adjust rule is selected, THE Placement_Engine SHALL rotate that Track_Piece 90° clockwise from its auto-adjusted Rotation without re-applying the auto-adjust rule, even if the resulting Rotation creates no Connection.
4. WHEN the Test_Hook `placePiece` is called without a `rotation` argument, THE Placement_Engine SHALL start from Rotation 0°, apply the auto-adjust rule, and return `ok: true` with the `id` of the new Piece, whose `rotation` in `getState().pieces` equals the resulting Rotation.
5. WHEN the Test_Hook `placePiece` is called with a `rotation` argument of 0, 90, 180 or 270, THE Placement_Engine SHALL use the given Rotation without applying the auto-adjust rule, even if the given Rotation creates no Connection.
6. IF the new Track_Piece's current Rotation already creates at least one Connection, THEN THE Placement_Engine SHALL keep that Rotation and SHALL NOT check any other Rotation.
7. WHEN a placed Piece is moved, either by dragging it in the UI or through the Test_Hook `movePiece`, THE Placement_Engine SHALL keep the Piece's Rotation unchanged and SHALL NOT apply the auto-adjust rule.
8. WHEN the auto-adjust rule rotates a new Track_Piece and so creates a Connection, THE Audio_Manager SHALL append `place` followed by `snap` to the Sound_Log, with no `rotate` event for the automatic rotation.

### Requirement 16: Clipping and Placement Rules

**Priority:** Must. **Source:** FR-8, Section 10.2.

**User Story:** As a user, I want pieces to never overlap or fall off the board, so that my diorama always looks tidy and plausible.

#### Acceptance Criteria

1. THE Placement_Engine SHALL allow at most one Piece per Tile, counting all 4 Tiles of a hill's Footprint as occupied by that hill.
2. IF any Tile in a Piece's target Footprint holds a Piece other than the Piece being moved, THEN THE Placement_Engine SHALL reject the Build_Action with reason `occupied`, including when a Track_Piece targets a Tile that holds a Decoration.
3. IF any Tile in a Piece's target Footprint has a gridX or gridZ outside the integers 0 to 15 (for example a hill anchored at gridX 15 or gridZ 15), or a target coordinate is not an integer, THEN THE Placement_Engine SHALL reject the Build_Action with reason `out_of_bounds`.
4. IF a Decoration's target Footprint includes a Tile that holds a Track_Piece, THEN THE Placement_Engine SHALL reject the Build_Action with reason `on_track`.
5. IF a Build_Action would place a new station while the Diorama already contains a station, THEN THE Placement_Engine SHALL reject the placement with reason `station_limit`.
6. WHILE a station exists in the Diorama, THE Palette SHALL show the station item as disabled and SHALL prevent the station item from being selected as `selectedTool` or dragged onto the grid.
7. THE Placement_Engine SHALL apply the same placement rules, and return the same `ok` result and `reason` code, for UI actions and for Test_Hook actions.
8. FOR ALL sequences of Build_Actions, including undo and redo, every Tile SHALL be covered by the Footprint of at most one Piece and every Footprint SHALL lie within Tile_Coordinates 0 to 15 on both axes (invariant).
9. FOR ALL sequences of Build_Actions, including undo and redo, the Diorama SHALL contain at most one station (invariant).
10. WHEN a move's target Footprint overlaps only free Tiles and Tiles currently occupied by the Piece being moved (for example moving a hill 1 Tile east), THE Placement_Engine SHALL accept the move.
11. IF the Placement_Engine rejects a Build_Action, THEN THE Placement_Engine SHALL leave the `pieces` array, `isDirty` and the undo and redo history unchanged.
12. IF a Build_Action breaks more than one placement rule, THEN THE Placement_Engine SHALL report only the first matching reason in the order `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`.
13. WHILE a station exists in the Diorama, WHEN the user hovers the pointer over or moves keyboard focus to the station Palette item, THE Palette SHALL show a tooltip explaining that only one station is allowed.

### Requirement 17: Start Position and Direction

**Priority:** Must. **Source:** FR-9.

**User Story:** As a user, I want the train to start at the station facing the way I choose, so that I control where the journey begins.

#### Acceptance Criteria

1. THE Train_Controller SHALL use the station as the Train's start Track_Piece and spawn the Train with the locomotive centred on the station, so that `getTrain()` reports `pieceId` equal to the station's id and `progress` 0.5.
2. WHILE in Build_Mode and a station exists, THE Scene_Renderer SHALL show the Train parked at the station's current Tile and Rotation, including after the station is moved or rotated (by the UI, the Test_Hook, undo or redo), and `getTrain()` SHALL report `moving: false`, `speed: 0` and `direction: 'forward'`.
3. WHILE in Build_Mode, WHEN the user activates the "Flip direction" control (`data-testid="flip-direction"`) or presses the F key, THE Store SHALL toggle `startFacing` between `0` and `180` exactly once per activation or key press (key auto-repeat does not toggle again), and THE Scene_Renderer SHALL show the parked Train facing the new Start_Facing as defined in criteria 4 and 5.
4. WHILE in Build_Mode, a station exists and `startFacing` is `0`, THE Train_Controller SHALL park the Train with the locomotive facing the station's north Connector as rotated with the station (the north edge at station Rotation 0°, east at 90°, south at 180°, west at 270°) and the carriages trailing on the opposite side.
5. WHILE in Build_Mode, a station exists and `startFacing` is `180`, THE Train_Controller SHALL park the Train with the locomotive facing the station's other Connector (the south edge at station Rotation 0°, west at 90°, north at 180°, east at 270°) and the carriages trailing on the opposite side.
6. WHEN a new Diorama is created, THE Store SHALL set `startFacing` to `0`, whatever value the previously open Diorama had.
7. WHEN a Diorama is saved (manual save or autosave), THE Persistence_Service SHALL store the current `startFacing` value (`0` or `180`) as the Diorama's `startFacing`, so that reopening the Diorama restores the same Start_Facing.
8. WHEN Play_Mode is entered, THE Train_Controller SHALL start the Train from the station moving Forward, with the locomotive leading toward the Connector selected by the current Start_Facing (criteria 4 and 5).
9. IF no station exists (none placed yet, or the station was deleted), THEN THE Scene_Renderer SHALL show no Train, `getTrain()` SHALL return `null`, and THE Store SHALL keep `startFacing` unchanged.
10. IF the user activates the "Flip direction" control or presses the F key while in Play_Mode or while a text input has focus, THEN THE Track_App SHALL keep `startFacing` and the Train's motion unchanged, and the "Flip direction" control SHALL be shown disabled while in Play_Mode.

### Requirement 18: Entering and Leaving Play Mode

**Priority:** Must. **Source:** FR-10 (AC-10.1, AC-10.2, AC-10.9, AC-10.10).

**User Story:** As a user, I want to switch between building and playing, so that I can test my railway and go back to editing.

#### Acceptance Criteria

1. THE Overlay SHALL provide a Build/Play toggle, carrying `data-testid="mode-toggle"`, that requests Play_Mode when activated in Build_Mode and requests Build_Mode when activated in Play_Mode.
2. IF Play_Mode is requested, through the `mode-toggle` control or through Test_Hook `setMode('play')`, while the Store's `pieces` array contains no Piece of type `station`, THEN THE Track_App SHALL keep `mode` as `'build'`, show a toast (`data-testid="toast"`) with the message "Place a station to start", log the `invalid` sound event in the Sound_Log, and return `{ ok: false, reason: 'no_station' }` from `setMode`.
3. WHEN Play_Mode is entered, THE Train_Controller SHALL set `driveMode` to `'auto'`, start the Train from the station with the locomotive facing the saved Start_Facing and leading (Forward), and log the `whistle` sound event, so that within 1 second `getTrain()` reports `moving: true` and `direction: 'forward'`.
4. WHILE in Play_Mode, THE Placement_Engine SHALL reject every place, move, rotate and delete Build_Action from any source (Palette drag or click, dragging a placed Piece, the R key, the Delete and Backspace keys, the `delete-piece` button, undo, redo and the Test_Hook) and leave the Store's `pieces` array unchanged.
5. WHEN the user returns to Build_Mode, through the `mode-toggle` control or through Test_Hook `setMode('build')`, THE Train_Controller SHALL stop the Train and stop the looping chug sound, and park the Train at the station with the saved Start_Facing, so that the next `getTrain()` call reports `pieceId` equal to the station's id, `progress` 0.5, `moving: false`, `speed: 0` and `direction: 'forward'`.
6. WHEN a mode switch succeeds, through the `mode-toggle` control or through Test_Hook `setMode`, THE Track_App SHALL set the Store's `mode` to the new value, set the `playfield` element's `data-mode` attribute to `"build"` or `"play"` to match, return `{ ok: true }` from `setMode`, and leave `pieces`, `setting`, `startFacing` and `isDirty` unchanged.
7. IF Test_Hook `placePiece`, `movePiece`, `rotatePiece` or `removePiece` is called while in Play_Mode, THEN THE Placement_Engine SHALL return `{ ok: false, reason: 'play_mode' }` and log the `invalid` sound event in the Sound_Log.

### Requirement 19: Train Consist and Track Following

**Priority:** Must. **Source:** FR-10 (AC-10.3, AC-10.4, AC-10.8), Section 6.

**User Story:** As a user, I want a believable little train that follows the track smoothly, so that playing feels like a real toy.

#### Acceptance Criteria

1. THE Train_Controller SHALL compose the Train of exactly one locomotive and exactly 2 carriages, coupled in the fixed order locomotive, first carriage, second carriage.
2. THE Scene_Renderer SHALL render the locomotive between 0.765 and 1.035 Tiles long (about 0.9 Tiles, ±15%) and each carriage between 0.68 and 0.92 Tiles long (about 0.8 Tiles, ±15%), measured along the vehicle's direction of travel.
3. WHILE a vehicle of the Train is on a Track_Piece, THE Train_Controller SHALL keep that vehicle's centre within 0.02 Tiles of the track centreline and its heading within 5° of the centreline tangent at its centre, including through curves and across Tile boundaries, with no jump in position between consecutive frames.
4. WHILE the Train moves, THE Train_Controller SHALL keep the carriages trailing at a fixed spacing, measured as the distance along the track centreline between the centres of adjacent vehicles, that varies by no more than 0.02 Tiles on straights and through curves, with no two vehicles overlapping.
5. WHILE the Train moves Forward, THE Train_Controller SHALL lead with the locomotive, so that the locomotive is the vehicle furthest along the direction of travel and the second carriage is last.
6. WHILE the Train moves in Reverse, THE Train_Controller SHALL lead with the carriages, so that the second carriage is the vehicle furthest along the direction of travel and the locomotive is last.
7. WHILE any part of the Train is under a tunnel shell, THE Scene_Renderer SHALL hide every part of the Train that is under the shell and more than 0.2 Tiles from both tunnel openings (the tunnel Tile's two Connector edges), from every camera position the Camera_Controller allows.
8. THE Train_Controller SHALL follow the curve centreline as a quarter circle of radius 0.5 Tiles centred on the curve Tile's south-east corner as rotated with the Piece, running between the midpoints of the curve's two Connector edges.
9. THE Train_Controller SHALL follow the centreline of `straight`, `tunnel` and `station` Pieces as the straight line through the Tile centre joining the midpoints of their two Connector edges, and the centreline of a `buffer` Piece as the straight line from the midpoint of its S Connector edge (as rotated with the Piece) to its stop block.
10. IF the track behind the leading end of the Train is too short to hold the locomotive and both carriages (for example a lone station), THEN THE Train_Controller SHALL place the trailing vehicles on a straight extension of the centreline beyond the Open_End, keeping the same spacing as in criterion 4.

### Requirement 20: Auto Driving

**Priority:** Must. **Source:** FR-10 (AC-10.5, AC-10.6).

**User Story:** As a user, I want the train to run by itself, so that I can watch my railway in action.

#### Acceptance Criteria

1. WHILE in Play_Mode, THE Overlay SHALL provide an Auto/Manual toggle (`drive-toggle`) that, each time the user activates it, switches `driveMode` in the Store between `'auto'` and `'manual'`, whether the Train is moving or stopped.
2. WHILE in Auto_Driving and the Train is cruising (moving, and neither easing to a stop at a Dead_End nor paused at one), THE Train_Controller SHALL move the Train at 1.5 Tiles per second, so that the Test_Hook `getTrain()` reports `moving: true` and `speed` 1.5.
3. WHEN the leading end of the Train in Auto_Driving approaches a Dead_End, THE Train_Controller SHALL lower the Train's speed from 1.5 Tiles per second to 0 without the speed rising at any point during the stop, so that the leading end (the locomotive front when moving Forward, the last carriage's rear when moving in Reverse) comes to rest at the Dead_End and never passes beyond it.
4. WHEN the Train in Auto_Driving has stopped at a Dead_End, THE Train_Controller SHALL hold the Train stationary for 1 second, with `getTrain()` reporting `moving: false` and `speed` 0, and then run the Train in the opposite direction (`direction` changes from `'forward'` to `'reverse'` or from `'reverse'` to `'forward'`) at 1.5 Tiles per second.
5. WHILE in Auto_Driving on a closed loop (a path on which every Track_Piece the Train can reach has both of its Connectors connected, so the path has no Dead_End), THE Train_Controller SHALL keep the Train moving at 1.5 Tiles per second in its current direction, without stopping or reversing, until the user switches to Manual_Driving or returns to Build_Mode.
6. WHILE in Build_Mode, THE Overlay SHALL show the Auto/Manual toggle as disabled and leave `driveMode` unchanged when the user activates it.
7. WHEN the user switches from Manual_Driving to Auto_Driving, THE Train_Controller SHALL run the Train in its current `direction` at 1.5 Tiles per second. If the Train is stopped at a Dead_End in that direction, THE Train_Controller SHALL instead apply the 1-second pause and reversal from criterion 4.
8. WHEN the user switches from Auto_Driving to Manual_Driving while neither W nor S is held, THE Train_Controller SHALL bring the Train to a stop within 0.5 seconds.

### Requirement 21: Manual Driving

**Priority:** Must. **Source:** FR-10 (AC-10.7).

**User Story:** As a user, I want to drive the train myself with the keyboard, so that I can play with it directly.

#### Acceptance Criteria

1. WHILE in Manual_Driving and the user holds W without holding S, THE Train_Controller SHALL move the Train Forward, with `getTrain().direction` reporting `'forward'`.
2. WHILE in Manual_Driving and the user holds S without holding W, THE Train_Controller SHALL move the Train in Reverse, with `getTrain().direction` reporting `'reverse'`.
3. WHILE in Manual_Driving and the user holds exactly one of W or S, THE Train_Controller SHALL accelerate the Train linearly at 2 Tiles per second² up to a top speed of 2 Tiles per second, so that a Train starting from a standstill reaches 2 Tiles per second within 1 second of the key being pressed, and SHALL never move the Train faster than 2 Tiles per second.
4. WHILE in Manual_Driving and the user holds neither W nor S, or holds both W and S at once, THE Train_Controller SHALL apply no thrust and bring the Train to a stop (`getTrain().speed` 0 and `moving: false`) within 0.5 seconds of the moment thrust ended: the last held key being released, the second key being pressed, or Manual_Driving being entered with no key held.
5. WHEN the leading end of the Train in Manual_Driving (the locomotive front when moving Forward, the last carriage's rear when moving in Reverse) reaches a Dead_End, THE Train_Controller SHALL stop the Train at that Dead_End without the leading end passing it, with `getTrain()` reporting `speed` 0 and `moving: false`.
6. WHILE the Train in Manual_Driving is stopped at a Dead_End, THE Train_Controller SHALL keep the Train stationary while the user holds the key for the direction of that Dead_End (W if the Dead_End was reached moving Forward, S if it was reached moving in Reverse), and SHALL move the Train away from the Dead_End as in criteria 1 to 3 while the user holds the other key.
7. WHEN the user holds only the key for the opposite direction while the Train in Manual_Driving is moving, THE Train_Controller SHALL bring the Train to speed 0 within 0.5 seconds and then accelerate the Train in the newly requested direction as in criterion 3, without the reported `direction` changing while `speed` is above 0.
8. IF the user presses W or S while a text input has focus, while in Auto_Driving, or while in Build_Mode, THEN THE Train_Controller SHALL ignore the key and leave the Train's motion unchanged.

### Requirement 22: Saving

**Priority:** Must. **Source:** FR-11 (AC-11.1 to AC-11.4).

**User Story:** As a user, I want to save my dioramas in the browser, so that they are still there next time.

#### Acceptance Criteria

1. WHEN the user activates the Save button (`save-button`), THE Persistence_Service SHALL write the current Diorama's name, Setting, Start_Facing and Pieces into the SaveFile (`version: 1`) stored in localStorage under the key `wooden-diorama:v1`.
2. WHEN a save succeeds, THE Overlay SHALL show a toast (`toast`) confirming the save.
3. WHEN a save succeeds, THE Store SHALL set `isDirty` to `false`.
4. WHEN the Track_App loads after a page reload, THE Main_Menu SHALL list every Diorama that was successfully saved before the reload.
5. FOR ALL valid Dioramas, saving, reloading the page and reopening the Diorama SHALL produce the same name, Setting and Start_Facing, and the same Pieces, each with identical `id`, `type`, `gridX`, `gridZ` and `rotation` (round-trip property).
6. WHEN the user activates the back-to-menu control (`back-to-menu`) while in Dirty_State, THE Overlay SHALL show a dialog offering Save (`confirm-ok`), Discard (`confirm-discard`) and Cancel, and THE Track_App SHALL keep the Playfield open until the user chooses one of them.
7. WHEN the user chooses Save in the unsaved-changes dialog and the save succeeds, THE Track_App SHALL show the Main_Menu with the saved Diorama listed.
8. WHEN the user chooses Discard in the unsaved-changes dialog, THE Track_App SHALL show the Main_Menu without writing to localStorage, so the Main_Menu lists the Diorama as it was last saved, or does not list it if it was never saved.
9. WHEN the user chooses Cancel in the unsaved-changes dialog, THE Track_App SHALL close the dialog and keep the Playfield open with all Pieces, the Setting and the Start_Facing unchanged and `isDirty` still `true`.
10. WHEN the user activates the back-to-menu control while not in Dirty_State, THE Track_App SHALL show the Main_Menu without showing the unsaved-changes dialog.
11. IF writing to localStorage fails during a save, including a save chosen in the unsaved-changes dialog, THEN THE Overlay SHALL show a toast stating that the save failed, THE Store SHALL keep `isDirty` set to `true`, THE Track_App SHALL keep the Playfield open with all changes intact, and the SaveFile previously stored under `wooden-diorama:v1` SHALL remain unchanged.
12. WHEN a Diorama that has never been saved is saved successfully for the first time, THE Persistence_Service SHALL add a new Diorama entry with a new unique `id` and with `createdAt` and `updatedAt` both set to the save time in ISO 8601 format, and THE Store SHALL set `dioramaId` to that `id`.
13. WHEN a Diorama that already has a stored entry is saved successfully, THE Persistence_Service SHALL replace that entry under the same `id`, keep its `createdAt`, set `updatedAt` to the save time in ISO 8601 format, and leave every other Diorama in the SaveFile unchanged.

### Requirement 23: Autosave

**Priority:** Should. **Source:** FR-11 (AC-11.5).

**User Story:** As a user, I want my work saved automatically, so that I do not lose changes if I forget to save.

#### Acceptance Criteria

1. WHILE in Build_Mode and in Dirty_State, WHEN 30 seconds (±1 second) have elapsed since the latest of these moments: the moment `isDirty` last changed from `false` to `true`, the previous autosave attempt, or the most recent return to Build_Mode from Play_Mode, THE Persistence_Service SHALL save the current Diorama's name, Setting, Start_Facing and Pieces in localStorage under the key `wooden-diorama:v1`, the same as a manual save.
2. WHEN an autosave succeeds, THE Store SHALL set `isDirty` to `false` and THE Overlay SHALL show a toast confirming the save, the same as for a manual save.
3. IF the current Diorama has never been saved, THEN THE Persistence_Service SHALL store it as a new Diorama entry on its first autosave and THE Store SHALL set `dioramaId` to that entry's id, so later autosaves and manual saves update that same entry and do not create duplicates.
4. IF writing to localStorage fails during an autosave, THEN THE Overlay SHALL show a toast stating that the save failed, THE Store SHALL keep `isDirty` set to `true` and every Piece unchanged, and THE Persistence_Service SHALL try again 30 seconds (±1 second) after the failed attempt.
5. WHILE in Play_Mode or not in Dirty_State, THE Persistence_Service SHALL make no autosave writes to localStorage.

### Requirement 24: Resilience to Corrupt Saved Data

**Priority:** Must. **Source:** FR-11 (AC-11.6).

**User Story:** As a user, I want the app to keep working even if saved data is damaged, so that one bad entry does not lock me out.

#### Acceptance Criteria

1. IF an entry in the `dioramas` array under `wooden-diorama:v1` fails validation, THEN THE Main_Menu SHALL leave that entry out of the list while still listing every valid entry newest first by `updatedAt`, AND THE Persistence_Service SHALL log one console warning (not a console error) for each skipped entry. An entry fails validation when any of these is true: it is not an object; `id` is not a non-empty string; `name` is not a string of 1 to 40 characters that is not blank; `setting` is not `'bedroom'` or `'kitchen'`; `startFacing` is not `0` or `180`; `pieces` is not an array; `createdAt` or `updatedAt` is not an ISO 8601 string; `thumbnail` is present but is not a string; or any Piece fails to have a string `id`, a `type` that is one of the 12 type ids, integer `gridX` and `gridZ` from 0 to 15, and a `rotation` of 0, 90, 180 or 270.
2. IF the value under `wooden-diorama:v1` cannot be parsed as a SaveFile (it is not valid JSON, or it is not an object with `version` equal to `1` and `dioramas` as an array), THEN THE Main_Menu SHALL show the empty state that prompts the user to create a Diorama, AND THE Persistence_Service SHALL log one console warning (not a console error).
3. IF the value under `wooden-diorama:v1` cannot be parsed as a SaveFile, THEN THE Persistence_Service SHALL copy the raw value, character for character, to the key `wooden-diorama:v1:corrupt-<ISO timestamp>` before writing any new value to `wooden-diorama:v1`. Track_App SHALL never overwrite or delete that backup key.
4. IF the value under `wooden-diorama:audio` is not valid JSON, or its mute setting is not a boolean, or its music or effects volume is not a number from 0 to 1, THEN THE Audio_Manager SHALL use the default audio settings (unmuted, music volume 0.5, effects volume 0.8) AND log one console warning (not a console error).
5. FOR ALL strings stored under `wooden-diorama:v1` and FOR ALL strings stored under `wooden-diorama:audio`, including the empty string and text that is not JSON, loading the Main_Menu SHALL complete without an uncaught exception and without a console error, and SHALL show either the list of valid entries or the empty state (error-condition property).
6. IF no value is stored under `wooden-diorama:v1` or `wooden-diorama:audio`, THEN THE Track_App SHALL treat the missing key as an empty SaveFile or as the default audio settings, respectively, and log no warning.
7. WHEN the Persistence_Service writes the SaveFile while the stored `dioramas` array contains entries that failed validation, THE Persistence_Service SHALL keep those entries unchanged in the written `dioramas` array.
8. IF the backup copy in criterion 3 cannot be written, THEN THE Persistence_Service SHALL leave the value under `wooden-diorama:v1` unchanged, THE Store SHALL keep `isDirty` set to `true`, and THE Overlay SHALL show a toast saying the save failed.

### Requirement 25: Build Sound Effects

**Priority:** Must. **Source:** FR-12 (AC-12.1, AC-12.2, AC-12.4, AC-12.8).

**User Story:** As a user, I want every build action to make its own satisfying sound, so that building feels tactile.

#### Acceptance Criteria

1. WHEN the user starts dragging an item from the Palette, or starts dragging a placed Piece on the board, in Build_Mode, THE Audio_Manager SHALL play the pickup sound and append `pickup` to the Sound_Log.
2. WHEN a Piece is placed successfully by a drop on a valid Tile, by a click on a valid Tile while a Palette tool is selected, or by a `placePiece` call that returns `ok: true`, THE Audio_Manager SHALL play the place sound and append `place` to the Sound_Log once.
3. WHEN a moved Piece is dropped on a valid Tile, including its current Tile, or a `movePiece` call returns `ok: true`, THE Audio_Manager SHALL play the move sound and append `move` to the Sound_Log once.
4. WHEN the selected placed Piece or the Ghost is rotated with the R key, or a `rotatePiece` call returns `ok: true`, THE Audio_Manager SHALL play the rotate sound and append `rotate` to the Sound_Log once.
5. WHEN a Piece is deleted with the Delete key, the Backspace key, the `delete-piece` button or a `removePiece` call that returns `ok: true`, THE Audio_Manager SHALL play the delete sound and append `delete` to the Sound_Log once.
6. WHEN a successful Build_Action creates one or more Connections that did not exist before the action, THE Audio_Manager SHALL play the snap sound once and append `snap` to the Sound_Log immediately after the event of that action (`place`, `move` or `rotate`).
7. IF a Build_Action is rejected, because the Piece is released off the grid or on an invalid Tile, or because a Test_Hook call returns `ok: false`, THEN THE Audio_Manager SHALL play the invalid sound, append `invalid` to the Sound_Log, and play and log neither the sound of the rejected action nor `snap`.
8. THE Audio_Manager SHALL use a place sound that is a different audio clip from the delete sound, so that no single clip is used for both events.
9. THE Audio_Manager SHALL use a sound of wood striking wood, such as a soft knock or click, for each of the place, snap and rotate sounds.
10. WHEN the user activates a button in the Main_Menu or the Overlay, THE Audio_Manager SHALL play the UI click sound and append `ui` to the Sound_Log.
11. WHEN an input event or Test_Hook call triggers a sound in this requirement, THE Audio_Manager SHALL start that sound within 100 ms of the event or call. The input events are pointer press, pointer release, key press and button activation.
12. WHILE audio is muted, or audio has not yet been unlocked by a user interaction, THE Audio_Manager SHALL produce no audible output for the sounds in this requirement and SHALL still append each triggered event name to the Sound_Log in the order the events occur.

### Requirement 26: Play Mode Sound Effects

**Priority:** Must. **Source:** FR-12 (AC-12.3).

**User Story:** As a user, I want the train to whistle, chug and bump, so that playing feels alive.

#### Acceptance Criteria

1. WHEN the Train departs from a standstill in Play_Mode (on entering Play_Mode, on departing after an Auto_Driving pause at a Dead_End, or on starting to move in Manual_Driving), THE Audio_Manager SHALL play the whistle sound within 100 ms and append `whistle` to the Sound_Log, at most once in any 3-second period.
2. WHEN the Train's speed rises above 0 in Play_Mode, THE Audio_Manager SHALL start a looping chug or clatter sound within 100 ms and append `chug` to the Sound_Log exactly once for that start, not once per frame or per loop repetition.
3. WHILE the chug sound plays, THE Audio_Manager SHALL set the chug volume to the effects volume multiplied by the Train's current speed divided by 2 Tiles per second, updating the volume at least 10 times per second, so that the chug volume equals the effects volume at 2 Tiles per second and 0.75 × the effects volume at the Auto_Driving speed of 1.5 Tiles per second.
4. WHEN the Train comes to rest at a Dead_End, THE Audio_Manager SHALL play a soft bump sound within 100 ms and append `bump` to the Sound_Log exactly once for that stop, including while a Manual_Driving key stays held toward the Dead_End.
5. WHEN the Train's speed reaches 0, or Track_App switches from Play_Mode to Build_Mode, THE Audio_Manager SHALL stop the chug sound within 100 ms.
6. IF the Train comes to rest at a point that is not a Dead_End (for example after both Manual_Driving keys are released mid-track), THEN THE Audio_Manager SHALL NOT play the bump sound and SHALL NOT append `bump` to the Sound_Log.

### Requirement 27: Background Music and Audio Settings

**Priority:** Must. **Source:** FR-12 (AC-12.5 to AC-12.7), Section 9.

**User Story:** As a user, I want cozy background music and control over volume, so that I can enjoy the mood or play quietly.

#### Acceptance Criteria

1. WHILE the Main_Menu or the Playfield (in Build_Mode or Play_Mode) is shown and audio is unlocked, THE Audio_Manager SHALL loop background music, restarting the music from its beginning each time it reaches its end.
2. THE Audio_Manager SHALL use music in a cozy, catchy chamber pop, indie folk, or acoustic-electronic hybrid style, similar in mood to life-simulation and park-builder game soundtracks.
3. THE Audio_Manager SHALL use only music that does not come from any commercial game.
4. WHEN the first user interaction with the page occurs (the first pointer press, click or key press anywhere on the page), THE Audio_Manager SHALL unlock audio playback.
5. WHILE audio is not unlocked, THE Audio_Manager SHALL keep all music and sound effects silent, and SHALL NOT play sounds triggered during that period after audio is unlocked.
6. THE Overlay SHALL provide a mute toggle (`mute-toggle`), a music volume slider (`music-volume`) and an effects volume slider (`sfx-volume`), each slider ranging from 0 (silent) to 1 (full volume).
7. WHEN the user changes the mute state or either volume, THE Persistence_Service SHALL store the mute state, the music volume and the effects volume under the key `wooden-diorama:audio`.
8. WHEN the Track_App loads, THE Audio_Manager SHALL apply the mute state and volumes stored under `wooden-diorama:audio`, or, IF no value is stored under that key, the defaults of unmuted, music volume 0.5 and effects volume 0.8.
9. FOR ALL valid audio settings (mute state true or false, each volume from 0 to 1), storing and then loading the settings SHALL produce the same mute state and volumes (round-trip property).
10. WHILE the mute toggle is on, THE Audio_Manager SHALL output no music and no sound effects, and WHEN the mute toggle is turned off, THE Audio_Manager SHALL resume output at the music and effects volumes set before muting.
11. WHEN the user moves the music volume slider or the effects volume slider, THE Audio_Manager SHALL apply the new volume within 100 ms to music or effects that are already playing as well as to sounds started afterwards.
12. IF the value stored under `wooden-diorama:audio` cannot be parsed or contains a mute state that is not true or false or a volume outside 0 to 1, THEN THE Audio_Manager SHALL apply the defaults of unmuted, music volume 0.5 and effects volume 0.8 for that setting, without crashing the Track_App.

### Requirement 28: Item Catalogue

**Priority:** Must. **Source:** Section 6.

**User Story:** As a user, I want a set of wooden-toy items at believable scale, so that my diorama looks like a real toy set.

#### Acceptance Criteria

1. THE Palette SHALL contain exactly these 12 items with these type ids, and no other items: Straight track `straight`, Curved track `curve`, Tunnel `tunnel`, Station `station`, Buffer stop `buffer`, Toy house `house`, Pine tree `pineTree`, Round tree `roundTree`, Hill `hill`, Toy car `car`, Cassette tape `cassette`, Building blocks `blocks`.
2. THE Track_App SHALL classify `straight`, `curve`, `tunnel`, `station` and `buffer` as Track_Pieces, and `house`, `pineTree`, `roundTree`, `hill`, `car`, `cassette` and `blocks` as Decorations.
3. THE Placement_Engine SHALL give every item a 1 × 1 Footprint consisting of its Anchor_Tile, except `hill`, which SHALL have a 2 × 2 Footprint consisting of its Anchor_Tile and the Tiles to the east, south and south-east of the Anchor_Tile.
4. THE Connection_Resolver SHALL use these Connectors at 0°: `straight` N and S; `curve` S and E; `tunnel` N and S; `station` N and S; `buffer` S; every Decoration none.
5. THE Scene_Renderer SHALL render the straight track as a wooden rail with two grooves that runs from the Tile's north edge to its south edge at Rotation 0°.
6. THE Scene_Renderer SHALL render the curved track at Rotation 0° as a quarter circle of radius 0.5 Tiles centred on the Tile's south-east corner, joining the midpoint of the Tile's south edge to the midpoint of its east edge.
7. THE Scene_Renderer SHALL render the tunnel as a straight track running from the Tile's north edge to its south edge at Rotation 0°, under an arched wooden or painted shell whose openings face north and south at Rotation 0°.
8. THE Scene_Renderer SHALL render the station as a straight track running from the Tile's north edge to its south edge at Rotation 0°, with a platform and a roof that both stay within the station's 1 × 1 Footprint.
9. THE Scene_Renderer SHALL render the buffer stop at Rotation 0° as a track running from the Tile's south edge to a stop block at the Tile's north side.
10. THE Scene_Renderer SHALL render the toy house as a painted wooden block house with a height of 0.85 to 1.15 Tiles above the ground surface.
11. THE Scene_Renderer SHALL render the pine tree as a wooden cone on a cylinder trunk with a total height of 1.02 to 1.38 Tiles above the ground surface.
12. THE Scene_Renderer SHALL render the round tree as a wooden ball on a stick with a total height of 0.85 to 1.15 Tiles above the ground surface.
13. THE Scene_Renderer SHALL render the hill as a felt or painted-wood mound covering its 2 × 2 Footprint with a peak height of 0.51 to 0.69 Tiles above the ground surface.
14. THE Scene_Renderer SHALL render the toy car as a wooden car with a length of 0.425 to 0.575 Tiles and a width of 0.255 to 0.345 Tiles.
15. THE Scene_Renderer SHALL render the cassette tape at true scale, 0.68 Tiles long, 0.43 Tiles wide and 0.08 Tiles high.
16. THE Scene_Renderer SHALL render the building blocks as 3 wooden blocks stacked on top of each other within the Piece's 1 × 1 Footprint, with each block showing a letter on at least one visible face.
17. WHEN a hill is rotated, THE Scene_Renderer SHALL render the hill turned 90° clockwise, viewed from above, about the centre of its 2 × 2 Footprint.
18. WHEN a hill is rotated, THE Placement_Engine SHALL keep the hill's `gridX`, `gridZ` and the 4 Tiles of its Footprint unchanged.
19. THE Scene_Renderer SHALL render every Piece with its 0° appearance turned clockwise, viewed from above, by the Piece's Rotation about its Footprint centre, so that each rendered track end lies on a Tile edge that holds one of the Piece's rotated Connectors.

### Requirement 29: Materials

**Priority:** Must. **Source:** Section 6 (Materials).

**User Story:** As a user, I want pieces to look like real painted wood and soft plastic, so that the diorama feels tactile.

#### Acceptance Criteria

1. THE Scene_Renderer SHALL render the wooden parts of every Piece and of the Train with a matte finish of roughness 0.6 or higher and with no mirror reflections, meaning that no other scene object and no surrounding prop appears reflected in the wooden surface.
2. THE Scene_Renderer SHALL render the painted parts of every Piece and of the Train with a matte finish of roughness 0.6 or higher.
3. THE Scene_Renderer SHALL render the plastic parts of every Piece, such as the toy car's wheels, with a slight sheen, measured as roughness from 0.3 to 0.6 inclusive.
4. THE Scene_Renderer SHALL render every outer edge of each Piece and of the Train as bevelled or rounded, with a bevel width or rounding radius of at least 0.02 Tiles, so that no outer edge renders as an unsoftened razor-sharp corner.
5. THE Scene_Renderer SHALL render the wooden parts of every Piece and of the Train with a visible wood grain, meaning a pattern of streaks or rings in a different tone from the base wood colour that can be told apart from a flat colour when viewed from the default camera pose.

### Requirement 30: Visual Style

**Priority:** Must. **Source:** Section 7.1, Section 1.

**User Story:** As a user, I want a soft, warm and clean look, so that the app feels cozy and calm.

#### Acceptance Criteria

1. THE Scene_Renderer SHALL render every Piece, the Train and every Setting prop as a simplified toy shape that uses the materials defined in Requirement 29, in a style that is neither photorealistic nor flat cartoon.
2. THE Track_App SHALL use a palette of soft, warm, low-saturation colours such as cream, honey wood, sage, dusty blue and terracotta.
3. THE Track_App SHALL keep every solid colour value in Overlay styles and every base colour of Scene_Renderer materials within HSL saturation of 60% or less and HSL lightness between 8% and 96%, excluding pure black, pure white and neon colours, except that the green and red Ghost tints and keyboard focus rings may reach HSL saturation of 70%.
4. THE Overlay SHALL render every panel, button, input, dialog and toast with rounded corners of radius 6 px or more.
5. THE Overlay SHALL separate adjacent controls by at least 8 px and pad the content of each panel and dialog by at least 12 px from the panel or dialog edge.
6. THE Overlay SHALL render all text in one typeface family and all icons from one icon set with a single consistent icon style.
7. THE Overlay SHALL render each panel either with a background opacity of 0.95 or less or with a drop shadow whose blur radius is 8 px or more.
8. WHILE in Build_Mode and no confirmation dialog is open, THE Overlay SHALL cover no more than 25% of the viewport area, measured as the combined area of all visible Overlay panels at a 1920 × 1080 viewport with the Palette expanded.
9. WHERE the "Low quality" toggle is disabled, THE Scene_Renderer SHALL light the scene with one main directional light, which is the only shadow-casting light and casts shadows with blurred edges instead of hard single-pixel edges, plus ambient fill light.
10. WHERE the "Low quality" toggle is disabled, THE Scene_Renderer SHALL render a contact shadow on the ground beneath every placed Piece.

### Requirement 31: Tactile Interaction

**Priority:** Must. **Source:** Section 7.2.

**User Story:** As a user, I want pieces to lift, swing, settle and bounce as I handle them, so that building feels physical without a physics engine.

#### Acceptance Criteria

1. WHEN the user starts dragging a Piece from the board, or an item from the Palette, with the left mouse button, THE Animation_System SHALL raise the dragged Piece (or, for a Palette item, its Ghost) so that its base is 0.3 Tiles above the ground within 150 ms of the drag starting, and SHALL render the dragged object's ground shadow larger and with a softer edge than the same object's shadow at rest, and THE Audio_Manager SHALL play the pickup sound.
2. WHILE the user drags a Piece or Ghost, THE Animation_System SHALL move the dragged object toward the centre of the Tile that the Grid_System snaps the pointer to, using a damped spring that reaches that Tile centre within 250 ms of the target Tile changing, and SHALL keep the object still at that Tile centre (no frame-to-frame position change) while the target Tile stays the same and the settle has completed.
3. WHILE the user drags a Piece or Ghost, THE Animation_System SHALL tilt the dragged object toward its current direction of horizontal movement by an angle between 0° and 8°, never exceeding 8°, and SHALL return the tilt to 0° with easing once the object stops moving.
4. WHEN a Piece is dropped on a valid Tile, THE Animation_System SHALL lower the Piece from its lifted height onto the Tile with a settle or bounce that completes in under 300 ms from release, after which the Piece rests at the Tile centre with 0° tilt, and THE Audio_Manager SHALL play the sound at the moment the Piece touches the Tile: the place sound for a Piece dropped from the Palette, or the move sound for a placed Piece dropped on a new Tile, followed by the snap sound if the drop creates a Connection.
5. IF a placed Piece is dropped on an invalid Tile or outside the grid, THEN THE Animation_System SHALL shake the Piece for 150 to 250 ms and then move the Piece with easing back to its previous Tile and Rotation, and THE Audio_Manager SHALL play the invalid sound, and the Store SHALL keep the Piece's previous `gridX`, `gridZ` and `rotation` unchanged.
6. IF an item dragged from the Palette is dropped on an invalid Tile or outside the grid, THEN THE Animation_System SHALL shake the Ghost for 150 to 250 ms and then remove the Ghost from the scene, and THE Audio_Manager SHALL play the invalid sound, and the Store's `pieces` array SHALL be unchanged.
7. WHEN a Piece is rotated, THE Animation_System SHALL turn the Piece 90° clockwise with an ease-out over 112 to 188 ms, ending exactly at the new Rotation, and THE Audio_Manager SHALL play the rotate sound.
8. WHEN a Piece is deleted, THE Animation_System SHALL shrink the Piece or lift the Piece away while fading the Piece to fully transparent over 150 to 250 ms, then remove the Piece from the scene, and THE Audio_Manager SHALL play the delete sound.
9. WHILE the pointer hovers over a placed Piece in Build_Mode and no drag is active, THE Animation_System SHALL raise the hovered Piece 0.05 Tiles above its resting height with easing and THE Track_App SHALL show a pointer cursor; when the pointer leaves the Piece, THE Animation_System SHALL lower the Piece back to its resting height with easing and THE Track_App SHALL restore the default cursor.
10. THE Animation_System SHALL animate every change to a Piece's position, height, tilt, Rotation, scale or opacity with easing or springs over at least 2 rendered frames, so that no Piece jumps from its start value to its end value within a single rendered frame, except as allowed by criterion 11.
11. WHEN undo or redo applies a change to a Piece, THE Animation_System SHALL apply the change either within a single rendered frame without animation or with the animations in criteria 4, 7 and 8, and either result satisfies criterion 10.

### Requirement 32: Performance on Weak Devices

**Priority:** Must. **Source:** Section 7.3.

**User Story:** As a user on a modest laptop, I want the app to run smoothly and load fast, so that I can enjoy it without a gaming PC.

#### Acceptance Criteria

1. WHILE 100 Pieces are placed and the "Low quality" toggle is off, THE Scene_Renderer SHALL render at least 30 frames per second in Build_Mode and in Play_Mode, measured as the average frame rate over a continuous 10-second sample in a production build in a 1920 × 1080 viewport on an integrated GPU such as Intel Iris Xe.
2. WHILE the Track_App is in Play_Mode with the Train moving and 100 Pieces placed, THE Scene_Renderer SHALL meet the 30 frames per second average defined in criterion 1.
3. THE Scene_Renderer SHALL render at a pixel ratio equal to the smaller of the device pixel ratio and 1.5, so that the render pixel ratio never exceeds 1.5 on any display.
4. THE Scene_Renderer SHALL have at most one shadow-casting light in the scene in either Setting and in either mode, with a shadow map whose width and height are each 2048 pixels or less.
5. THE Scene_Renderer SHALL draw all placed Pieces of the same type either as one instanced mesh or as meshes that share the same geometry and material objects, so that adding another Piece of an already-placed type creates no new geometry or material.
6. WHEN the production build of the Track_App is first loaded over a 25 Mbps connection with an empty browser cache, THE Track_App SHALL become playable within 5 seconds of navigation start, where playable means the Main_Menu is displayed and the `new-diorama` control opens the Playfield when activated.
7. THE Project_Repository SHALL keep the combined size of all files under `public/assets/` below 20 MB (20,000,000 bytes).

### Requirement 33: Low Quality Mode

**Priority:** Should. **Source:** Section 7.3.

**User Story:** As a user on a weak device, I want a low quality option, so that the app runs smoothly on my hardware.

#### Acceptance Criteria

1. WHERE the "Low quality" toggle is enabled, THE Scene_Renderer SHALL turn off shadows, rendering neither the directional light's shadow map nor the contact shadows of Pieces and the Train.
2. WHERE the "Low quality" toggle is enabled, THE Scene_Renderer SHALL lower the render resolution to a device pixel ratio of 1.0 or less.
3. WHEN the user switches the "Low quality" toggle in the Overlay, THE Scene_Renderer SHALL apply the new quality level within 1 second, without a page reload and without changing the Store's `pieces`, `mode`, `driveMode`, `setting`, `startFacing` or `isDirty` values, the camera pose or the Train's position; switching the toggle off SHALL restore shadows and the device pixel ratio cap of 1.5.
4. WHEN the user switches the "Low quality" toggle, THE Persistence_Service SHALL store the new value under the localStorage key `wooden-diorama:settings`, so that after a page reload the toggle shows the stored value and the Scene_Renderer applies it.
5. IF the value under `wooden-diorama:settings` is missing or unreadable when Track_App loads, THEN THE Track_App SHALL start with the "Low quality" toggle off, without crashing.

### Requirement 34: Assets and Credits

**Priority:** Must. **Source:** Section 8.

**User Story:** As a maintainer, I want every asset legally licensed, credited and within budget, so that the app is safe to distribute and loads fast.

#### Acceptance Criteria

1. THE Project_Repository SHALL contain only assets that are licensed CC0 or CC-BY, or that were created for the project.
2. THE Project_Repository SHALL give every asset file stored under `public/assets/` its own entry in `CREDITS.md` that states the file's path, title, author, source URL and licence.
3. THE Project_Repository SHALL credit every CC-BY asset in `CREDITS.md` by naming the asset's author, its source URL and CC-BY as its licence.
4. THE Project_Repository SHALL contain no music, sounds or models taken from commercial games, and no music, sounds or models taken from other copyrighted media that is not licensed CC0 or CC-BY.
5. THE Project_Repository SHALL store every asset file under `public/assets/`, with models in `models/`, textures in `textures/`, sound effects in `audio/sfx/` and music in `audio/music/`.
6. THE Project_Repository SHALL store every model as a glTF binary (`.glb`) file and every audio file as an `.mp3` or `.ogg` file.
7. THE Project_Repository SHALL keep each model file at 1 MB (1,000,000 bytes) or less, each texture at 1024 pixels or fewer in both width and height, and each music file at 5 MB (5,000,000 bytes) or less.
8. IF no model can be obtained for an item that is licensed CC0 or CC-BY, is a `.glb` file of 1 MB or less, and meets the Item Catalogue and Materials requirements, THEN THE Scene_Renderer SHALL render that item from Three.js primitives with procedural wood materials.
9. WHERE a fallback asset is used, THE Track_App SHALL meet the Item Catalogue, Materials, Visual Style, Tactile Interaction and Performance requirements with the fallback asset in place, using the same pass criteria as for file-based assets.
10. WHERE a fallback asset is used, THE Project_Repository SHALL include an entry in `CREDITS.md` for each fallback that names the item, sound event or music it replaces and the fallback method used: Three.js primitives with procedural wood materials, Web Audio API synthesis, or procedural music with `tone`.
11. IF no sound effect file can be obtained for a sound event that is licensed CC0 or CC-BY, is an `.mp3` or `.ogg` file, and matches the sound described in the Audio requirements, THEN THE Audio_Manager SHALL synthesise that sound effect with the Web Audio API.
12. IF no music file can be obtained that is licensed CC0 or CC-BY, is an `.mp3` or `.ogg` file of 5 MB or less, and matches the music style described in the Audio requirements, THEN THE Audio_Manager SHALL generate the background music procedurally with `tone`.

### Requirement 35: Game State Data Model

**Priority:** Must. **Source:** Section 9.

**User Story:** As a developer and tester, I want the state to use fixed names and types, so that code and automated tests agree on the data.

#### Acceptance Criteria

1. THE Store SHALL define `TrackType` as `'straight' | 'curve' | 'tunnel' | 'station' | 'buffer'`, `DecorationType` as `'house' | 'pineTree' | 'roundTree' | 'hill' | 'car' | 'cassette' | 'blocks'`, `PieceType` as `TrackType | DecorationType`, and `Rotation` as `0 | 90 | 180 | 270`.
2. THE Store SHALL represent each Piece as `{ id: string; type: PieceType; gridX: number; gridZ: number; rotation: Rotation }`, where `gridX` is an integer 0 to 15 from west to east, `gridZ` is an integer 0 to 15 from north to south, and no two Pieces in `pieces` share the same `id`.
3. THE Store SHALL hold, as the single Zustand store, a GameState with the fields `pieces: Piece[]`, `selectedTool: PieceType | null`, `selectedPieceId: string | null`, `mode: 'build' | 'play'`, `driveMode: 'auto' | 'manual'`, `setting: 'bedroom' | 'kitchen'`, `startFacing: 0 | 180`, `dioramaId: string | null`, `dioramaName: string` and `isDirty: boolean`, may hold additional fields, and SHALL keep `selectedPieceId` either `null` or equal to the `id` of a Piece currently in `pieces`.
4. WHEN a Build_Action succeeds (including an undo or redo of a Build_Action), or the Setting changes to a different value, or the Start_Facing changes, THE Store SHALL set `isDirty` to `true`, and selection changes and camera changes SHALL leave `isDirty` unchanged.
5. THE Store SHALL generate Piece ids and Diorama ids with `nanoid`, so that each generated Piece id is unique within its Diorama and each Diorama id is unique within the SaveFile.
6. WHEN the user creates a new Diorama, THE Store SHALL set `pieces` to an empty array, `selectedTool` to `null`, `selectedPieceId` to `null`, `mode` to `'build'`, `driveMode` to `'auto'`, `setting` to `'bedroom'`, `startFacing` to `0`, `dioramaId` to `null` until the Diorama's first save, `dioramaName` to the "Untitled diorama" name chosen by the Main Menu rule, and `isDirty` to `false`.
7. WHEN a save of the current Diorama succeeds (manual save or autosave), or a saved Diorama is opened from the Main_Menu, THE Store SHALL set `isDirty` to `false` and set `dioramaId` to the id of that saved Diorama.
8. IF a Build_Action is rejected by the Placement_Engine, THEN THE Store SHALL leave `pieces` and `isDirty` exactly as they were before the attempted action.

### Requirement 36: Saved Data Format

**Priority:** Must. **Source:** Section 9.

**User Story:** As a developer, I want a versioned, fixed storage format, so that saves stay readable and testable.

#### Acceptance Criteria

1. WHEN the Persistence_Service writes saved Dioramas, THE Persistence_Service SHALL store them in localStorage under the key `wooden-diorama:v1` as a single JSON-serialised SaveFile `{ version: 1; dioramas: Diorama[] }`, with `version` always equal to `1`.
2. THE Persistence_Service SHALL store each Diorama as `{ id: string; name: string; setting: 'bedroom' | 'kitchen'; startFacing: 0 | 180; pieces: Piece[]; createdAt: string; updatedAt: string; thumbnail?: string }`, where `name` is 1 to 40 characters, each Piece is stored as `{ id: string; type: PieceType; gridX: number; gridZ: number; rotation: Rotation }` with `gridX` and `gridZ` integers from 0 to 15 and `rotation` one of 0, 90, 180 or 270, Piece ids are unique within the Diorama, and `thumbnail`, when present, is a data URL.
3. WHEN a Diorama is first saved, THE Persistence_Service SHALL assign it an `id` that no other Diorama in the SaveFile uses, and SHALL set `createdAt` and `updatedAt` to the same ISO 8601 date-time string in UTC, within 1 second of the save action.
4. WHEN an existing Diorama is saved or renamed, THE Persistence_Service SHALL set `updatedAt` to an ISO 8601 date-time string in UTC within 1 second of the action, not earlier than `createdAt`, and SHALL keep `id` and `createdAt` unchanged.
5. WHEN an existing Diorama is saved, THE Persistence_Service SHALL replace the entry with the same `id` in place, so the SaveFile holds exactly one entry per `id`, and SHALL leave every other Diorama in the SaveFile unchanged.
6. WHEN the audio settings are written, THE Persistence_Service SHALL store them under the key `wooden-diorama:audio`, separate from `wooden-diorama:v1`, as the mute state (true or false) and the music and effects volumes (each a number from 0 to 1).
7. IF writing to localStorage fails, THEN THE Persistence_Service SHALL leave the previously stored value under the affected key unchanged, THE Store SHALL keep `isDirty` set to `true`, and THE Overlay SHALL show a toast indicating that the save failed.
8. FOR ALL valid SaveFiles, serialising the SaveFile to JSON and parsing the JSON back SHALL produce an equivalent SaveFile: the same `version`, the same Dioramas in the same order with identical field values, and each Diorama's Pieces in the same order with identical field values (round-trip property).

### Requirement 37: Test IDs

**Priority:** Must. **Source:** Section 10.1.

**User Story:** As a test author, I want stable test ids on every key element, so that automated tests can find them reliably.

#### Acceptance Criteria

1. WHILE the Main_Menu is shown, THE Main_Menu SHALL carry `data-testid="main-menu"` on the main menu screen element, `data-testid="new-diorama"` on the clickable New diorama button and `data-testid="diorama-list"` on the saved diorama list.
2. WHILE the Main_Menu is shown, THE Main_Menu SHALL carry `data-testid="diorama-item"` on each saved entry, with exactly one such element per listed Diorama, and a `data-diorama-id` attribute on that element whose value equals the `id` of that Diorama in the SaveFile.
3. WHILE the Main_Menu is shown, THE Main_Menu SHALL carry `data-testid="diorama-open"`, `data-testid="diorama-rename"` and `data-testid="diorama-delete"` on the clickable open, rename and delete controls inside each `diorama-item` element, one of each per entry.
4. WHILE a rename is in progress, THE Main_Menu SHALL carry `data-testid="rename-input"` on the text input element that receives the typed name.
5. WHILE a confirmation dialog is open, THE Overlay SHALL carry `data-testid="confirm-ok"` on that dialog's confirm button, which is the "Delete" button in the delete dialog and the "Save" button in the unsaved-changes dialog.
6. WHILE the unsaved-changes dialog is open, THE Overlay SHALL carry `data-testid="confirm-discard"` on its Discard button.
7. WHILE the Playfield is shown, THE Playfield SHALL carry `data-testid="playfield"` on the Playfield screen element and a `data-mode` attribute whose value always equals the Store's `mode`: `build` in Build_Mode and `play` in Play_Mode.
8. THE Palette SHALL carry `data-testid="palette-<type id>"` on each of its 12 items, using the type id with its exact case: `palette-straight`, `palette-curve`, `palette-tunnel`, `palette-station`, `palette-buffer`, `palette-house`, `palette-pineTree`, `palette-roundTree`, `palette-hill`, `palette-car`, `palette-cassette` and `palette-blocks`, and SHALL keep each test id while the item is disabled (for example the station item while a station exists).
9. WHILE the Playfield is shown, THE Overlay SHALL carry `data-testid="mode-toggle"` on the Build/Play toggle, `data-testid="drive-toggle"` on the Auto/Manual toggle, `data-testid="setting-select"` on the Setting selector and `data-testid="flip-direction"` on the flip start direction control, and SHALL keep each test id while its control is disabled.
10. WHILE the Playfield is shown, THE Overlay SHALL carry `data-testid="save-button"` on the Save button, `data-testid="back-to-menu"` on the back-to-menu control, `data-testid="delete-piece"` on the delete selected Piece button and `data-testid="reset-view"` on the Reset view button, and SHALL keep each test id while its control is disabled.
11. THE Overlay SHALL carry `data-testid="mute-toggle"` on the mute toggle, `data-testid="music-volume"` on the music volume slider and `data-testid="sfx-volume"` on the effects volume slider.
12. WHEN a toast or status message is shown, THE Overlay SHALL carry `data-testid="toast"` on that message's element, and that element's text content SHALL contain the message, with one `toast` element for each message shown at the same time.
13. THE Track_App SHALL render at most one element at a time for each of these `data-testid` values: `main-menu`, `new-diorama`, `diorama-list`, `rename-input`, `confirm-ok`, `confirm-discard`, `playfield`, each `palette-<type id>`, `mode-toggle`, `drive-toggle`, `setting-select`, `flip-direction`, `save-button`, `back-to-menu`, `delete-piece`, `reset-view`, `mute-toggle`, `music-volume` and `sfx-volume`.
14. WHILE no saved Dioramas exist, THE Main_Menu SHALL render zero elements with `data-testid="diorama-item"`.
15. IF a Play_Mode entry is rejected because no station exists, THEN THE Playfield SHALL keep its `data-mode` attribute set to `build`.

### Requirement 38: Test Hook Exposure

**Priority:** Must. **Source:** Section 10.2.

**User Story:** As a test author, I want a window hook only in test or development contexts, so that tests can drive the app without exposing internals to normal users.

#### Acceptance Criteria

1. WHERE the page URL contains `?test=1` when the page loads, THE Track_App SHALL expose the Test_Hook as `window.__DIORAMA__`, both in development mode and in a production build.
2. WHERE the Track_App runs in development mode, THE Track_App SHALL expose the Test_Hook as `window.__DIORAMA__`, whether or not the URL contains `?test=1`.
3. WHERE the Track_App runs as a production build and the URL does not contain `?test=1`, THE Track_App SHALL leave `window.__DIORAMA__` undefined on every screen for the whole lifetime of the page, so that `typeof window.__DIORAMA__` evaluates to `'undefined'`.
4. WHERE the Test_Hook is exposed, WHEN the Main_Menu is first displayed after the page loads, THE Track_App SHALL already have `window.__DIORAMA__` defined with all 10 methods of the `DioramaTestHook` interface (`getState`, `placePiece`, `movePiece`, `rotatePiece`, `removePiece`, `getConnections`, `setMode`, `setDriveMode`, `getTrain` and `getSoundLog`) callable as functions.
5. WHERE the Test_Hook is exposed, THE Track_App SHALL keep `window.__DIORAMA__` defined while the user moves between the Main_Menu and the Playfield in any order and any number of times, until the page is reloaded or closed.

### Requirement 39: Test Hook Operations

**Priority:** Must. **Source:** Section 10.2.

**User Story:** As a test author, I want hook methods that behave exactly like the UI, so that automated tests verify real behaviour.

#### Acceptance Criteria

1. THE Test_Hook SHALL implement the `DioramaTestHook` interface with the methods `getState`, `placePiece`, `movePiece`, `rotatePiece`, `removePiece`, `getConnections`, `setMode`, `setDriveMode`, `getTrain` and `getSoundLog`, using the signatures in Section 10.2 of `requirement.md`, with each method returning its result synchronously (not as a Promise).
2. WHEN `getState()` is called, THE Test_Hook SHALL return the current GameState containing every field defined in Section 9 of `requirement.md`, reflecting the effects of every Test_Hook call that returned before `getState()` was called.
3. WHEN `placePiece(type, gridX, gridZ, rotation?)` succeeds, THE Test_Hook SHALL add exactly one Piece to `pieces` with the given `type`, `gridX` and `gridZ` and an id that matches no other Piece, set `isDirty` to `true`, and return `{ ok: true, id }` with the new Piece id.
4. WHEN `movePiece(id, gridX, gridZ)` succeeds, THE Test_Hook SHALL set the Piece's Anchor_Tile to (gridX, gridZ), keep the Piece's Rotation and id, leave all other Pieces unchanged, and return `{ ok: true }`; a move to the Piece's current Anchor_Tile SHALL succeed and leave `pieces` unchanged.
5. WHEN `rotatePiece(id)` succeeds, THE Test_Hook SHALL set the Piece's Rotation to (current Rotation + 90°) mod 360°, keep its Anchor_Tile, set `isDirty` to `true`, and return `{ ok: true }`.
6. WHEN `removePiece(id)` succeeds, THE Test_Hook SHALL remove exactly the Piece with that id from `pieces`, leave all other Pieces unchanged, set `isDirty` to `true`, and return `{ ok: true }`.
7. IF a Test_Hook Build_Action breaks a placement rule applied by the UI, THEN THE Test_Hook SHALL return `{ ok: false, reason }` with `reason` set to the first matching code in the order `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`, where coordinates that are not integers from 0 to 15 or a Footprint extending beyond the grid give `out_of_bounds`, and SHALL leave `pieces` and `isDirty` unchanged.
8. IF `movePiece`, `rotatePiece` or `removePiece` is called with an id that matches no Piece, or `placePiece` is called with a `type` that is not one of the 12 type ids or a `rotation` other than 0, 90, 180 or 270, THEN THE Test_Hook SHALL return `{ ok: false, reason: 'not_found' }` and leave `pieces` unchanged.
9. IF `setMode('play')` is called while no station exists, THEN THE Test_Hook SHALL return `{ ok: false, reason: 'no_station' }`, keep `mode` as `build`, append `invalid` to the Sound_Log, and show a toast with the text "Place a station to start".
10. WHEN `setMode(mode)` succeeds, THE Test_Hook SHALL switch to the given mode with the same effects as the Build/Play toggle (entering Play_Mode sets `driveMode` to `'auto'` and starts the Train; entering Build_Mode stops the Train and parks it at the station with the saved Start_Facing) and return `{ ok: true }`.
11. WHEN `setDriveMode(mode)` is called, THE Test_Hook SHALL set `driveMode` to the given value.
12. WHEN `getConnections()` is called, THE Test_Hook SHALL return every pair of connected Track_Piece ids exactly once, with the two ids in each pair sorted lexicographically and the pairs sorted lexicographically, and SHALL return an empty array when no Connection exists.
13. WHEN `getTrain()` is called while a station exists, THE Test_Hook SHALL return `{ pieceId, progress, moving, direction, speed }`, where `pieceId` is the id of the Track_Piece the locomotive is on, `progress` is a number from 0 to 1 inclusive along that Track_Piece, `moving` is a boolean, `direction` is `'forward'` or `'reverse'`, and `speed` is a non-negative number in Tiles per second.
14. WHEN `getTrain()` is called while no station exists, THE Test_Hook SHALL return `null`.
15. WHEN `getSoundLog()` is called, THE Test_Hook SHALL return every sound event name recorded in the Sound_Log, oldest first, including events triggered while audio is muted or not yet unlocked, using only the names `pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `whistle`, `chug` and `bump`.
16. WHEN a Test_Hook Build_Action returns, THE Test_Hook SHALL have appended the same sound events as the equivalent UI action except `pickup`: `place`, `move`, `rotate` or `delete` on success, followed by `snap` if the action created a Connection, or `invalid` on failure.
17. FOR ALL Build_Action inputs, calling the Test_Hook action and performing the equivalent UI action SHALL produce the same `ok` result, the same `reason` and the same resulting `pieces` array (model-based property).
18. WHEN `placePiece` is called with a `rotation` argument, THE Test_Hook SHALL use that Rotation as is; WHEN `placePiece` is called without a `rotation` argument, THE Test_Hook SHALL start from Rotation 0° and apply the auto-adjust rule of AC-7.3, checking 90°, 180° and 270° in that order and keeping 0° if no Rotation connects.
19. IF `placePiece`, `movePiece`, `rotatePiece` or `removePiece` is called while `mode` is `play`, THEN THE Test_Hook SHALL return `{ ok: false, reason: 'play_mode' }` and leave `pieces` unchanged.
20. WHILE `mode` is `build`, WHEN `getTrain()` is called and a station exists, THE Test_Hook SHALL return `pieceId` equal to the station's id, `progress` 0.5, `moving` `false`, `direction` `'forward'` and `speed` 0.

### Requirement 40: Browser Support, Build and Accessibility

**Priority:** Must. **Source:** Section 11.

**User Story:** As a user and maintainer, I want the app to work in all major browsers, build cleanly and be keyboard accessible, so that everyone can use and ship it.

#### Acceptance Criteria

1. THE Track_App SHALL meet every Must acceptance criterion in this document in each of the latest stable desktop releases of Chrome, Edge, Firefox and Safari available at the time of verification.
2. WHEN `npm install` is run from a clean clone (no `node_modules` folder and no build output) with the Node.js version in `.nvmrc` (v22.17.0), THE Project_Repository SHALL install all dependencies and exit with code 0.
3. WHEN `npm run build` is run after `npm install` from a clean clone with the Node.js version in `.nvmrc` (v22.17.0), THE Project_Repository SHALL type-check all TypeScript source files, report zero TypeScript errors, produce a production build and exit with code 0.
4. WHILE the user performs the flows specified in this document (opening the Main_Menu, creating, opening, renaming and deleting Dioramas, placing, moving, rotating and deleting Pieces including rejected attempts, undo and redo, switching Settings, entering and leaving Play_Mode including the rejected entry without a station, driving the Train in Auto_Driving and Manual_Driving, saving, autosaving, reloading the page, loading corrupt saved data, and changing mute and volume settings), THE Track_App SHALL log zero error-level messages to the browser console, where warning-level messages such as the corrupt-data warning do not count as errors.
5. WHEN an Overlay control in the Main_Menu, the Playfield or a dialog receives focus through the keyboard (Tab or Shift+Tab), THE Overlay SHALL show a focus indicator (outline or ring) on that control that is at least 2 CSS pixels wide, is not clipped by its container, and is removed when focus leaves the control.
6. THE Overlay SHALL give every interactive control (buttons, toggles, sliders, the Setting selector, text inputs, Palette items and dialog buttons), including icon-only controls, a non-empty accessible name that states the control's function, for example "Save" for `save-button` and "Music volume" for `music-volume`.
7. THE Project_Repository SHALL include a `README.md` that states the required Node.js version from `.nvmrc`, gives the commands `npm install`, `npm run dev` and `npm run build` with what each one does, and contains a known-limitations section that lists each known limitation or states that none are known.
8. WHEN `npm run dev` is run after `npm install` from a clean clone with the Node.js version in `.nvmrc` (v22.17.0), THE Project_Repository SHALL start a development server that serves the Track_App at a local URL, and opening that URL SHALL display the Main_Menu.
9. THE `README.md` in the Project_Repository SHALL list every control: left click and left-drag for selecting, placing and moving Pieces, right-drag to orbit, middle-drag to pan, scroll wheel to zoom, R to rotate, Delete or Backspace to delete, Escape to cancel a drag or deselect the tool, F to flip the start direction, W and S for Manual_Driving, Ctrl+Z (Cmd+Z on macOS) to undo and Ctrl+Shift+Z (Cmd+Shift+Z on macOS) to redo.

### Requirement 41: Scope Boundaries

**Priority:** Must. **Source:** Section 12.

**User Story:** As a stakeholder, I want the scope held to what was agreed, so that the project finishes on time.

#### Acceptance Criteria

1. THE Track_App SHALL provide exactly one Train per Diorama, made of one locomotive and 2 carriages, with no Palette item or other control that adds, removes or duplicates a Train, so that the Test_Hook `getTrain()` always returns either a single Train object or `null`.
2. THE Palette SHALL list exactly the 12 items in the Item Catalogue, one `palette-<type id>` element per type id, and THE Placement_Engine SHALL reject a `placePiece` call whose `type` is not one of those 12 type ids with `ok: false` and reason `not_found`, leaving `pieces` unchanged.
3. THE Track_App SHALL offer exactly the 2 Settings in the Settings requirement, Bedroom floor (`bedroom`) and Kitchen table (`kitchen`), as the only options in the `setting-select` control.
4. THE Placement_Engine SHALL place every Piece with its Anchor_Tile at integer Tile_Coordinates from 0 to 15 and a Rotation of 0°, 90°, 180° or 270°, with no free-form (off-grid) or free-angle placement.
5. IF a Build_Action requests a non-integer or out-of-range Tile_Coordinate, THEN THE Placement_Engine SHALL reject it with `ok: false` and reason `out_of_bounds` and leave `pieces` unchanged.
6. THE Connection_Resolver SHALL support only the Connectors listed in the Item Catalogue, rotated with the Piece, on the north, east, south and west Tile edges, so that a Track_Piece with 2 Connectors appears in at most 2 pairs returned by `getConnections()`, a buffer stop appears in at most 1 pair, and no junctions, switches, crossings, bridges, slopes or elevation exist (all Track_Pieces rest at the same ground height).
7. THE Track_App SHALL make every user function available through desktop mouse input (left button, right button, middle button and scroll wheel) and keyboard input in the latest desktop versions of Chrome, Edge, Firefox and Safari, with no touch-specific or mobile-specific controls.
8. THE Persistence_Service SHALL store all Dioramas and settings only in the browser's localStorage, under the keys `wooden-diorama:v1`, `wooden-diorama:audio` and `wooden-diorama:settings`, and THE Track_App SHALL send no Diorama or settings data over the network and SHALL show no account sign-in, cloud sync or sharing controls.

### Requirement 42: Definition of Done

**Priority:** Must. **Source:** Section 13.

**User Story:** As a stakeholder, I want a clear finish line, so that everyone agrees when the app is complete.

#### Acceptance Criteria

1. THE Track_App SHALL meet every acceptance criterion of every requirement in this document whose **Priority** line reads Must, which is every requirement except the Should and Could Requirements 6, 13, 15, 23 and 33.
2. THE Track_App SHALL implement the Test Contract exactly as written in Section 10 of `requirement.md`, so that every `data-testid` listed in Requirement 37 is present, the `window.__DIORAMA__` exposure rules in Requirement 38 hold, and every Test_Hook operation name and signature in Requirement 39 matches verbatim. Each returned `reason` is one of `occupied`, `out_of_bounds`, `on_track`, `station_limit`, `no_station`, `play_mode` or `not_found`, and each Sound_Log entry is one of `pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `whistle`, `chug` or `bump`.
3. THE Project_Repository SHALL contain a `CREDITS.md` that lists every asset stored under `public/assets/` with its file path, title, author, source URL and licence, as defined in Requirement 34.
4. WHEN `npm install`, then `npm run dev`, then `npm run build` are run from a clean clone (a fresh clone of the repository with no `node_modules` folder and no build output present) using the Node.js version in `.nvmrc` (v22.17.0), THE Project_Repository SHALL complete `npm install` and `npm run build` successfully, start the development server with `npm run dev` without errors, and report no TypeScript errors from `npm run build`.
5. WHERE a fallback is used in place of a sourced asset (a model built from Three.js primitives, a sound effect synthesised with the Web Audio API, or music generated with `tone`), THE Project_Repository SHALL note each such fallback in `CREDITS.md`.
6. WHEN the Track_App served by `npm run dev` from a clean clone is opened in the latest desktop version of Chrome, Edge, Firefox or Safari, THE Track_App SHALL display the Main_Menu (`data-testid="main-menu"`) and log no console errors.

## Out of Scope

From Section 12 of `requirement.md`:

- Track junctions, switches, crossings, bridges, slopes or elevation.
- More than one train.
- Physics engines and free-form (off-grid) placement.
- Touch and mobile support.
- Accounts, cloud sync, sharing or any backend.
- Any placeable items beyond the 12 in the Item Catalogue, or Settings beyond the 2 in the Settings requirement.

## Assumptions and Decisions

`requirement.md` does not settle the points below. These are the choices made for this spec; the design phase may refine the details but must keep the observable behaviour.

### Placement and validation

1. **Reason code precedence.** When a Build_Action breaks more than one rule, the Placement_Engine reports the first matching reason in this order: `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied`. A Decoration whose Footprint overlaps both a Track_Piece and a Decoration reports `on_track`. A Track_Piece placed on a Decoration reports `occupied`.
2. **Invalid hook arguments.** Non-integer or out-of-range coordinates return `out_of_bounds`. Because `requirement.md` defines no other reason code, an unknown `type` in `placePiece` and a `rotation` value other than 0, 90, 180 or 270 both return `not_found`.
3. **Auto-adjust scope.** The auto-adjust rule (AC-7.3) applies to new placements only: UI placements (drag or click) and `placePiece` without `rotation`. Moves keep the Piece's Rotation, both in the UI and in `movePiece`, so the UI and the Test_Hook behave the same. Auto-adjust checks Rotations current + 90°, + 180°, + 270° in that order.
4. **Click with a tool selected.** While a Palette tool is selected, a left click on any Tile attempts placement (an occupied Tile gives the invalid feedback). The tool stays selected after a placement so the user can place repeatedly. Selecting placed Pieces requires no tool to be selected (Escape clears the tool).
5. **Dragging from the Palette** sets `selectedTool` to the dragged item for the duration of the drag and plays `pickup`.
6. **Rotate never fails on footprint grounds.** All Track_Pieces are 1 × 1 and the hill's Footprint does not change with Rotation, so `rotatePiece` fails only with `play_mode` or `not_found`.
7. **Move onto the same Tile** is a successful no-op that plays the `move` sound and records no history entry.
8. **Rename** is offered in the Main_Menu (via `diorama-rename` and `rename-input`). The name is trimmed before validation; Enter or blur confirms, Escape cancels. Duplicate names are allowed on rename; the uniqueness rule applies only to new "Untitled diorama" names. The Playfield shows the current name.

### Sounds and the Sound_Log

9. **Sound_Log recording.** Every sound event is appended to the Sound_Log when triggered, whether or not audio is muted or unlocked, so automated tests are deterministic. `chug` is logged once each time the looping chug starts, not every frame.
10. **Hook sounds.** Test_Hook actions log the same events as the UI action minus the gesture-only ones: `placePiece` logs `place` (plus `snap` if a Connection is created) or `invalid`; `movePiece` logs `move` (plus `snap`) or `invalid`; `rotatePiece` logs `rotate` (plus `snap`) or `invalid`; `removePiece` logs `delete` or `invalid`. The hook does not log `pickup`, because no grab happens.
11. **Sound order.** When a Build_Action creates a Connection, the action sound is logged first, then `snap`.
12. **Whistle.** The whistle plays each time the Train departs from a standstill (entering Play_Mode, departing after an Auto_Driving pause, or starting in Manual_Driving), at most once every 3 seconds.
13. **Rejected Play_Mode entry** (no station) plays `invalid` and shows a toast with the text "Place a station to start".

### Train behaviour

14. **Progress direction.** `progress` runs from 0 at the Track_Piece's first Connector to 1 at its second, using the Connector order in the Item Catalogue (rotated with the Piece). For the buffer stop, `progress` runs from 0 at its S Connector to 1 at the stop block. A Train parked at the station has `progress` 0.5.
15. **Direction and speed.** `getTrain().direction` reports `'forward'` when the locomotive leads and `'reverse'` when the carriages lead. `speed` is the non-negative magnitude in Tiles per second. While parked in Build_Mode the Train reports `moving: false`, `speed: 0`, `direction: 'forward'`.
16. **Dead_End detection** applies to the leading end of the Train: the locomotive front when moving Forward, the last carriage's rear when moving in Reverse. When the track behind the Train is too short to hold all three vehicles (for example a lone station), trailing vehicles are placed on a straight extension beyond the Open_End.
17. **Manual input.** Holding both W and S at once applies no thrust (the Train coasts to a stop). Manual acceleration is linear at 2 Tiles per second², and braking reaches 0 within 0.5 seconds.
18. **Drive mode outside Play_Mode.** The Auto/Manual toggle is disabled in Build_Mode. Entering Play_Mode always sets `driveMode` to `'auto'`.
19. **Flip direction** (button and F key) is disabled in Play_Mode. The F, R, W, S, Delete, Backspace, Escape and undo/redo shortcuts are ignored while a text input has focus.
20. **Setting selector** stays available in Play_Mode, because changing the Setting does not move Pieces.

### Persistence

21. **New Dioramas are not stored** until the first save (manual or autosave). The "Untitled diorama" uniqueness check uses saved Dioramas only.
22. **Dirty_State triggers.** Successful Build_Actions (including undo and redo), Setting changes and Start_Facing changes set `isDirty` to `true`. Selection and camera changes do not.
23. **Unsaved-changes dialog buttons.** `confirm-ok` is "Save", `confirm-discard` is "Discard", and a third button is "Cancel". In the delete dialog, `confirm-ok` is "Delete".
24. **Corrupt SaveFile backup key.** An unparseable value under `wooden-diorama:v1` is copied to `wooden-diorama:v1:corrupt-<ISO timestamp>` before a new SaveFile is written, so no data is lost.
25. **Last-edited date** is shown in the user's locale date and time format.
26. **Default audio settings** are unmuted, music volume 0.5 and effects volume 0.8, stored as values from 0 to 1.
27. **Low quality setting** is stored under the extra key `wooden-diorama:settings`, default off.

### Visual and timing tolerances

28. **"About" values.** Durations given as "about" accept ±25% (for example 150 to 250 ms for "about 200 ms"). Sizes given as "about" accept ±15%.
29. **Colour limits.** "Low saturation" and "avoid pure black, pure white and neon" are measured as HSL saturation 60% or less and HSL lightness between 8% and 96%. Small highlight accents (the green and red Ghost tints, focus rings) may reach 70% saturation so they stay clearly visible.
30. **Grid visibility.** Build_Mode grid line opacity is 0.35 or less; Play_Mode fades the grid to 0.1 or less within 300 ms.
31. **Default camera.** Target at the scene origin, distance 18 units, 50° from vertical, looking from the south-east. "Reset view" animates back to this pose.
32. **Overlay coverage** of 25% is measured at a 1920 × 1080 viewport with the Palette expanded.
33. **Plastic sheen** is measured as roughness between 0.3 and 0.6.
34. **getConnections ordering.** Each pair appears once, with the two ids in each pair sorted lexicographically and the pairs sorted lexicographically, so test output is stable.

### Stack and grid

35. **shadcn/ui helper packages.** `class-variance-authority`, `clsx`, `tailwind-merge`, the Radix packages under `@radix-ui/*`, and `lucide-react` (shadcn/ui's default icon set) count as part of the "Radix UI primitives via shadcn/ui" stack item. They are not additional runtime dependencies under Section 3 of `requirement.md`.
36. **Grid mapping.** A pointer exactly on a shared Tile edge maps to the Tile to its east or south. A pointer outside −8 ≤ x < 8, −8 ≤ z < 8 maps to no Tile.

### Main menu, thumbnails and persistence (additional)

37. **Thumbnails (Could).** Thumbnails are at most 320 × 240 px. Autosave refreshes the thumbnail. If capture fails, the Diorama is saved without `thumbnail` and the old thumbnail is not kept. A thumbnail that cannot be displayed shows the placeholder. Rename keeps the thumbnail.
38. **Persistence edge cases.** A missing localStorage key is not corrupt data and logs no warning. Entries that fail validation are kept unchanged when the SaveFile is rewritten. If the corrupt-data backup (item 24) cannot be written, the save is aborted and the original value is left in place. If a rename or delete write fails, a toast is shown and the previous on-screen state is kept.

### Camera and editing

39. **Camera.** "Reset view" animates to the default pose (item 31) within 1 second. "From the south-east" means equal positive x and z offsets from the target. The browser context menu is suppressed on the canvas.
40. **Undo and redo.** History is cleared when a Diorama is opened or created. Test_Hook Build_Actions are recorded in history like UI actions. Undo and redo log no sound events and may apply instantly.
41. **Open_End markers.** Markers are at most 0.25 Tiles wide and sit at the midpoint of the Connector's Tile edge. A Connector facing the grid boundary counts as an Open_End.

### Sounds (additional)

42. **Drop sounds.** A valid drop of a Palette item plays `place`; a valid drop of a placed Piece plays `move`. The phrase "the place sound plays on contact" in Section 7.2 of `requirement.md` is read as the action sound of the drop.
43. **Chug volume.** Chug volume = effects volume × speed / 2 Tiles per second, updated at least 10 times per second.

### Train and Play_Mode (additional)

44. **Manual reversal.** Holding only the opposite key while moving brakes the Train to 0 within 0.5 seconds, then accelerates it in the new direction. `direction` never flips while speed is above 0.
45. **Drive toggle.** Switching Manual→Auto resumes 1.5 Tiles per second in the current direction, or applies the 1-second pause and reversal if the Train is stopped at a Dead_End in that direction. Switching Auto→Manual with no key held stops the Train within 0.5 seconds.
46. **Setting in Play_Mode.** The Setting selector stays enabled in Play_Mode (item 20), and changing the Setting does not interrupt the Train.

### Test_Hook (additional)

47. **getConnections ordering.** `getConnections()` returns each pair with its two ids sorted lexicographically, and the pairs sorted lexicographically (same as item 34).

### Visual, performance and assets (additional)

48. **Materials.** The minimum bevel width or rounding radius is 0.02 Tiles. The colour limits in item 29 apply to base material colours and solid style colours, not to individual texture pixels.
49. **Overlay style values.** Corner radius is 6 px or more; spacing between controls is 8 px or more; panel padding is 12 px or more. "Translucent or softly shadowed" means a background opacity of 0.95 or less, or a drop-shadow blur of 8 px or more. The 25% coverage limit (item 32) excludes open confirmation dialogs.
50. **Performance measurement.** 30 fps means the average over a continuous 10-second sample, in a production build, with Low quality off. "Playable" means the Main_Menu is displayed and `new-diorama` opens the Playfield, measured from navigation start with an empty cache.
51. **Sizes.** MB is decimal (1,000,000 bytes) for the 1 MB model, 5 MB music and 20 MB total budgets. The 20 MB total covers the files under `public/assets/`.
52. **Copyrighted media.** "Other copyrighted media" in Section 8 of `requirement.md` means media not licensed CC0 or CC-BY.
