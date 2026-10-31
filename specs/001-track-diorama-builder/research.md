# Research: Track

Decisions for the plan. Library facts come from Context7 (shadcn 4.21, drei, React Three Fiber,
howler) and `npm view` on 2026-10-31. Choices not covered by `requirement.md` are recorded here as
`CLAUDE.md` requires.

## R1. Versions

**Decision**: Use the current releases below, with `react` and `react-dom` held to `~19.3.1`.

| Package | Version | Note |
| --- | --- | --- |
| react, react-dom | ~19.3.1 | `@react-three/fiber` 9.8 requires `<19.4` |
| three, @types/three | 0.187.x | Keep these two matched |
| @react-three/fiber | ^9.8.2 | |
| @react-three/drei | ^10.7.9 | Peer `@react-three/fiber ^9` |
| zustand | ^5.0.16 | |
| howler, @types/howler | ^2.2.4 | Types are dev only |
| nanoid | ^6.0.2 | |
| @radix-ui/react-* | current | Only the primitives in R3 |
| vite, @vitejs/plugin-react | ^8.3.5, ^6.1.2 | Dev |
| tailwindcss, @tailwindcss/vite | ^4.3.3 | Dev: compiled away at build time |
| typescript | ^7.0.2 | Dev |
| vitest, @playwright/test | ^5.0.5, ^1.64.1 | Dev |

**Rationale**: Peer ranges were checked and all fit Node v22.17.0 from `.nvmrc`. The upper bound on
React is the only trap: an unpinned install would break once React 19.4 ships.

**Alternatives**: TypeScript 5.x is the fallback only if a tool in this list fails on 7.x. The first
setup task proves this with a real install and build.

## R2. shadcn/ui inside the dependency allowlist

**Decision**: Keep shadcn/ui's code and conventions but none of its helper packages. Components are
adapted by hand from the shadcn source into `src/components/ui/`. `components.json` is kept, set to the
Radix base. The CLI is not used to add components, as it would install the packages below.

- `cn` in `src/lib/utils.ts` is a small join of truthy class names, replacing `clsx` and
  `tailwind-merge`. Components are written without conflicting class overrides, so merging is not
  needed.
- Variants are plain typed lookup objects, replacing `class-variance-authority`.
- Icons are one local set of inline SVG components in `src/components/icons.tsx`, replacing
  `lucide-react`.
- Animations use Tailwind transitions, replacing `tw-animate-css`.

**Rationale**: shadcn's standard setup needs `clsx`, `tailwind-merge`, `class-variance-authority` and
`lucide-react` at runtime. None are on the Section 3 allowlist, which says "allowed only". This keeps
both rules, so no constitution exception is needed. A unit test reads `package.json` and fails on any
runtime dependency outside the allowlist.

**Alternatives**: Adding the four packages as a justified exception was rejected, because the
constraint can be met at low cost.

## R3. Which controls use Radix, and which stay native

**Decision**:

| Control | Built on | Why |
| --- | --- | --- |
| Confirm dialogs | `@radix-ui/react-alert-dialog` | Focus trap and Escape handling |
| Rename dialog | `@radix-ui/react-dialog` | Same |
| Station tooltip | `@radix-ui/react-tooltip` | Accessible tooltip |
| Mute, mode, driving, quality toggles | `@radix-ui/react-toggle` | Pressed state |
| Button | shadcn Button with `@radix-ui/react-slot` | Standard |
| `setting-select` | shadcn `native-select` | See below |
| `music-volume`, `sfx-volume` | Styled `<input type="range">`, 0 to 100 | See below |
| Toast | Small component with `role="status"` | shadcn's own toast moved to `sonner`, which is not allowed |

**Rationale**: The test contract needs these controls to be driven by automated tools. A native select
answers a tool's "select option" action, and also keyboard and mouse. A native range answers "fill",
arrow keys and mouse. Radix versions work only through their custom widgets. `native-select` is a
shadcn component, so the stack rule still holds.

**Alternatives**: Radix Select and Slider were rejected for the reason above.

## R4. Camera

**Decision**: Use drei `CameraControls` with left `NONE`, middle `TRUCK`, right `ROTATE` and wheel
`DOLLY`. Set polar limits of 20° to 80°, distance limits of 4 to 30, and `setBoundary` with a box over
the grid at ground height to clamp the target. "Reset view" calls `reset(true)` for a smooth return.
The canvas suppresses the context menu.

The default view has its target at the origin, a polar angle of 50° and a distance of 23. A test asserts
that the whole grid is visible at 1920 × 1080.

**Rationale**: Docs confirm `mouseButtons` and its action constants, and that limit props are forwarded
to the instance. `setBoundary` gives the target limit directly. `OrbitControls` has no built-in target
clamp.

## R5. Pointer input and picking

**Decision**: All board input goes through one controller listening for pointer events on `window`.

- Pointer to tile is pure maths: cast a ray from the camera, intersect the plane y = 0 and take
  `round(x + 7.5)`, `round(z + 7.5)`. A result outside 0 to 15 means off the grid.
- Picking a piece is pure maths too: ray against an axis-aligned box per piece, built from its footprint
  and height. The nearest hit wins.
- A press becomes a drag after 4 px of movement, or a click if released sooner. Right and middle buttons
  belong to the camera, and hover is suppressed during their drags.
- Palette drags use pointer events, not HTML drag and drop.

**Rationale**: `window` listeners let a palette drag continue from HTML over the canvas, and this meets
architecture constraint 3 directly. Boxes let a click on a tall tree select that tree rather than the
tile behind it, without scene raycasts. All of this can be unit tested without a browser.

**Alternatives**: Scene raycasts on instanced meshes were rejected as slower and harder to test.

## R6. Rendering pieces at 100+ on integrated graphics

**Decision**: Two tiers sharing one set of geometries and materials.

- **Resting pieces** render through one `InstancedMesh` per piece type and material part.
- **Active pieces** (ghost, dragged, selected, hovered, or animating a drop, rotate, shake or delete)
  render as individual groups and are left out of their batch. A piece returns to its batch when its
  animation ends.

Other settings: `frameloop="always"`, `dpr={[1, 1.5]}`, one directional light, and a shadow map of
1024 by default with a hard ceiling of 2048. Per-frame motion mutates objects in `useFrame` and never
sets React state, following the R3F pitfalls guide.

**Rationale**: Section 7.3 requires instancing or shared geometry, and Section 7.2 requires per-piece
motion. The tiers give both, with a bounded number of draw calls. `frameloop="demand"` was rejected: it
saves power that nothing requires and invites stale-frame bugs.

## R7. Contact shadows

**Decision**: A soft radial shadow quad under each piece, instanced in one draw call, with the
directional light's shadow map on top. Grabbing scales the quad up and lowers its opacity. Low quality
turns off both.

**Rationale**: drei `ContactShadows` re-renders the scene and blurs it, and the docs call it expensive.
Limiting it with `frames` would stop it tracking moving pieces. A quad has a constant cost and directly
provides the "shadow softens and spreads" behaviour in Section 7.2.

## R8. Selection outline and letters

**Decision**: Use drei `Outlines` on the active tier, in a warm honey colour rather than its black
default. Lettered blocks use a small canvas texture.

**Rationale**: The docs confirm `Outlines` works on meshes, and only the selected piece needs it. drei
`Text` was rejected because it pulls in a text engine that downloads a font at run time.

## R9. Animation

**Decision**: A small pure module, `src/scene/pieceMotion.ts`, stepped in `useFrame`. This replaced the
original choice of `@react-spring/three` during implementation: see "Changes during implementation". Drag
follow uses a critically damped spring that settles within 250 ms, with tilt taken from its velocity and
capped at 8°. Rotate is a 150 ms ease-out,
delete a 200 ms shrink and fade, and shake a 200 ms keyframe sequence. The train uses its own
simulation (R10). Undo and redo apply instantly.

**Rationale**: Each Section 7.2 timing can be unit tested exactly, at normal and low frame rates. The
spring is solved exactly, so it cannot overshoot at a low frame rate. It also removes a dependency.

## R10. Train simulation

**Decision**: A pure module with no React or Three.js, advanced from `useFrame`. `setMode('play')`
initialises it synchronously, so `getTrain()` reports `moving: true` straight away. Time steps are
clamped to 0.25 s. State sits outside the store because it changes every frame and is not part of
Section 9's `GameState`. Route and motion rules are in `data-model.md`.

**Rationale**: The 0.25 s clamp stops a hidden tab causing a jump, yet keeps real-time speed accurate
down to 4 fps, which matters on slow software rendering in automated browsers. Pure code allows exact
tests of speeds, pauses and limits.

## R11. Load time

**Decision**: The main menu is in the entry chunk with no 3D code. The playfield is a lazy chunk,
prefetched straight after the menu paints. Budget: 4 MB of startup downloads (code plus textures),
which takes about 1.3 seconds at 25 Mbps. Music streams after the first interaction, and effects load in
the background.

**Rationale**: This is how the spec's "load time and asset budget" assumption is met: 20 MB at 25 Mbps
would take 6.4 seconds.

**Note**: Import only named drei helpers. Its dependency list includes heavy packages, such as a media
pipeline, that must stay out of the bundle. Bundle size is checked in the quickstart.

## R12. Audio

**Decision**: One audio module owns everything.

- **Effects**: Howler in Web Audio mode, preloaded, with short clips trimmed of leading silence to meet
  the 100 ms limit.
- **Music**: Howler with `html5: true`, as the docs advise for large files, so it streams.
- **Autoplay**: nothing is passed to Howler until the first `pointerdown` or `keydown`. Calling it
  earlier would queue sounds and release them in a burst. Events are still logged (spec Edge Cases).
- **Chug**: a looping clip whose volume is updated from train speed.
- **Fallback**: sounds with no sourced file are synthesised on Howler's shared `AudioContext`. A sourced music file
  exists, so `tone` was not needed and is not a dependency.
- **Formats**: `.mp3` for every sound, for broad browser support. Effects were sourced as `.ogg`, then
  converted, because WebKit could not play `.ogg`. Any effect that fails to decode still falls back to
  synthesis at run time.
- **Leading silence**: trimmed during conversion. Sounds start 26 to 28 ms into the decoded file, or 59 ms
  for the slow-rising squeak, which is inside the 100 ms limit.

**Rationale**: Docs confirm `html5`, `loop`, `onplayerror` and that audio stays locked until a user
gesture.

## R13. Asset sourcing

**Decision**:

| Asset | Source | Status on 2026-10-31 |
| --- | --- | --- |
| 3D models | Section 8 fallback: built from primitives with textured materials | See below |
| Textures | ambientCG (CC0): wood, floorboards, tabletop, fabric, at 1024 or smaller | Used |
| Effects | OpenGameArt pack "100 CC0 metal and wood SFX", plus synthesis for the whistle and chug | Used |
| Music | OpenGameArt "Cozy Puzzle Title" by MintoDog, CC0, 2.4 MB, loopable | Used |

**Rationale for models**: A search found no confirmed CC0 wooden toy set in `.glb`. The closest leads
are paid, royalty-free rather than CC0, or unclear on licence. Kenney's CC0 Train Kit is the strongest
lead, but kenney.nl returned 403 here and no source confirms it has wooden grain. Items also need exact
sizes and connector positions that match Section 6. That is the case Section 8's fallback covers, and
`CREDITS.md` will record it. `public/assets/models/` stays empty, and `src/scene/geometry/` exposes each
item as parts, so a real model could replace one later.

Each downloaded file's licence is checked on its own page before use. Poly Haven, Freesound, Poly Pizza
and Incompetech did not respond from this environment, so they are not relied on. Pixabay's own licence
is neither CC0 nor CC-BY, so it is excluded.

## R14. Typeface

**Decision**: A system stack: `ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`.

**Rationale**: Font packages are not on the allowlist, most good web fonts use the OFL rather than CC0
or CC-BY, and an external font service would add a load-time dependency. Each platform still shows one
clear typeface.

## R15. Saving

**Decision**: Hand-written validators in `src/persistence/` (schema libraries are not allowed). Every
write re-reads storage first and merges by id, keeping entries it could not read. See `contracts/storage.md`.

**Rationale**: Re-reading keeps other tabs' saves, and keeping unread entries meets the spec's edge case.
Warnings use `console.warn`, so Section 11's "no console errors" still holds.

## R16. Testing

**Decision**: Vitest for pure logic, and Playwright for the contract and flows, in Chromium, Firefox and
WebKit. Playwright browsers install inside `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`), as `CLAUDE.md`
keeps work inside the project folder. Performance and visual checks use `chrome-devtools`.

**Limits**: Playwright WebKit is close to Safari but is not Safari, and no Mac is available here. This
machine has Intel Arc integrated graphics, the same class as the Iris Xe in the requirement and likely
faster, so an Iris Xe itself is unmeasured. Any check that could not run on the named target goes in
`README.md` under known limitations.

## R17. Design references

**Decision**: Use `mobbin` during overlay implementation, not in planning. It helps with visual detail,
but layout is already bounded by the 25% limit in `contracts/ui-and-input.md`.

**Outcome**: Not used. The overlay was judged against Section 7.1 directly from screenshots of the running
app.

## Changes during implementation

Decisions that changed once real code and real measurements existed.

| Decision | Planned | Built | Why |
| --- | --- | --- | --- |
| R9 piece motion | `@react-spring/three` | Pure `pieceMotion.ts` | Timings can be unit tested, and tilt needs spring velocity. One less dependency |
| R4 default distance | 21 | 23 | At 21 the near grid corners would reach the palette at 1280 wide. A test now covers this |
| R12 effect format | `.mp3` | `.mp3`, converted from the sourced `.ogg` | A first version kept `.ogg`, but WebKit reported no `.ogg` support, so all sourced effects would have been lost there |
| R12 music fallback | `tone`, loaded lazily | Not needed, `tone` removed | A suitable CC0 track was found |
| R13 extra texture | Not planned | `wood-grain-light.jpg` | Yellow grain turned painted colours olive, so paint uses a neutral grain |
| R13 regrading | Resize only | Floorboards, tabletop and fabric regraded | The raw textures fought the Section 7.1 palette, and the track vanished against them |
| R6 shadow type | Soft (`PCFSoftShadowMap`) | `PCFShadowMap` | Three.js 0.187 removed the soft type |
| Low quality | Pixel ratio 1 | Pixel ratio 0.75, and the light stops casting | Ratio 1 changes nothing on a standard display. Disabling the light recompiles materials correctly |
| Thumbnails | Draw the canvas | Small offscreen render | Avoids reading back the full canvas |
| Test workers | 2 | 1 | Software rendering is CPU heavy, so parallel runs starve each other |
