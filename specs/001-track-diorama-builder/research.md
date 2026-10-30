# Research: Track, a Wooden Train Diorama Builder

Phase 0 output. Technical Context has no unresolved items. Versions and peer dependencies were checked against the npm registry on 2026-10-30, and library behaviour against the current docs through Context7.

## R1. Versions

**Decision**: Pin these versions. `npm install --dry-run` resolved the full set with no peer conflicts on Node v22.17.0.

| Package | Version | Note |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | `@react-three/fiber` 9.8.2 requires `>=19 <19.4` |
| `three` | 0.186.1 | Not 0.187.0, see below |
| `@types/three` (dev) | 0.186.0 | Latest available types |
| `@react-three/fiber` | 9.8.2 | |
| `@react-three/drei` | 10.7.9 | Peers: React 19, fiber 9 |
| `zustand` | 5.0.16 | |
| `@react-spring/three` | 10.1.2 | Allowed list |
| `howler` | 2.2.4 | Allowed list |
| `nanoid` | 6.0.2 | Allowed list |
| `tone` | 15.1.22 | Allowed list, fallback only |
| `radix-ui` | 1.8.1 | Radix primitives |
| `vite` (dev) | 8.3.5 | Node `^20.19 or >=22.12` |
| `@vitejs/plugin-react` (dev) | 6.1.2 | Requires Vite 8 |
| `typescript` (dev) | 7.0.2 | |
| `tailwindcss`, `@tailwindcss/vite` (dev) | 4.3.3 | |
| `vitest` (dev) | 5.0.5 | |
| `@playwright/test` (dev) | 1.64.1 | |

**Rationale**: `three` 0.187.0 was published on 2026-10-30 and has no matching `@types/three`, while 0.186.1 pairs with `@types/three` 0.186.0. Exact pins plus a committed `package-lock.json` make a clean clone repeatable, which Section 11 needs.

**Alternatives considered**: Using `three` 0.187.0 was rejected because it is untested with fiber and drei and has no types. If TypeScript 7 fails on third-party types during implementation, step down to the latest 6.x or 5.x release. Any TypeScript version satisfies Section 3.

## R2. shadcn/ui against the runtime dependency list

**Decision**: Use `radix-ui` as the primitives package, and copy shadcn/ui component source by hand into `src/ui/components/`, adapted so that nothing outside the allowed list is needed:

- `cn` becomes a small local helper that joins class names.
- `class-variance-authority` variants become plain lookup objects.
- `lucide-react` icons become a local inline SVG set in `src/ui/icons.tsx`, which also gives the consistent icon style Section 7.1 asks for.
- `tw-animate-css` is replaced with Tailwind transitions.

The `shadcn` CLI is not installed, because its `add` command writes those packages into `package.json`.

**Rationale**: The shadcn registry declares `class-variance-authority`, `cn`, `lucide-react` and `radix-ui` as runtime dependencies. Section 3 allows additional runtime dependencies "only from this list". Radix is named in the stack row, so it is allowed. The others are not, and they are thin conveniences that are easy to replace.

**Alternatives considered**: Installing the helpers as "part of shadcn/ui" was rejected because it reads the allowed list loosely, and a dependency audit would flag them.

## R3. One action path for UI and test hook

**Decision**: The store exposes `placePiece`, `movePiece`, `rotatePiece`, `removePiece`, `setMode` and related actions, each returning the Section 10 result shape. UI handlers and `testHook.ts` both call them. Each action validates through `domain/rules.ts`, commits, records history, then fires sounds.

**Rationale**: AC-8.5 and Section 10.2 require identical validation and sounds. A single path makes that true by construction.

**Alternatives considered**: A separate hook implementation was rejected because it would drift.

## R4. Train simulation

**Decision**: `domain/route.ts` walks connections out from the station in both directions and produces a list of segments, each with a piece id, a length and a point-at-distance function. It also reports whether the route is closed. `domain/trainSim.ts` is a pure `step(state, dt, input)` over the locomotive's distance `s` along that route. A fixed 1/120 s step runs inside a `requestAnimationFrame` loop started on entering Play, with elapsed time capped at 0.5 s per frame. `TrainView` reads the resulting pose in `useFrame`. Details are in [data-model.md](./data-model.md).

**Rationale**: AC-10.3 needs all vehicles on the centreline, and distance along a path gives that with fixed spacing. A fixed step keeps speeds correct at low frame rates, including under software rendering in test browsers. Per-frame pose stays out of the store because it is not Section 9 state, and the fiber docs warn against routing per-frame updates through React state.

**Alternatives considered**: Curve objects from the 3D library were rejected because the domain layer must stay renderer-free. Advancing the train in `useFrame` alone was rejected because speed would depend on the render loop.

## R5. Rendering pieces

**Decision**: Build each item type's geometry in code and merge it per material, for example painted and wood for the house. Each type and material pair gets one drei `Instances` provider from `createInstances`, because drei pairs an `Instance` with its nearest provider and nested providers need dedicated pairs. Each `PieceNode` is a spring-driven group containing its `Instance` parts. drei documents that an `Instance` inherits a parent group's transform.

**Rationale**: Section 7.3 requires shared or instanced repeated meshes, and this gives low draw calls while keeping per-piece animation simple. Instance counts are bounded by the 256 tiles.

**Alternatives considered**: Plain shared-geometry meshes meet the requirement, but would cost several hundred draw calls per pass at 100 pieces on a weak GPU. Hand-managed instance matrices were rejected because they duplicate what drei provides.

**Selection outline**: The selected piece gets plain meshes with drei `Outlines` built from the same geometry, because only one piece is selected at a time.

## R6. Lighting and shadows

**Decision**: One directional light with a 1024² map fitted to the board, plus ambient fill. Set the fiber canvas to `shadows="percentage"`, which selects `PCFShadowMap`. Use `dpr={[1, 1.5]}`. Contact shadows are one instanced soft blob per piece, with scale and strength driven by lift, so the shadow visibly softens and spreads on grab. Keep `frameloop="always"`.

**Rationale**: three r186 deprecates `PCFSoftShadowMap` in favour of `PCFShadowMap`, and a bare `shadows` prop on the fiber canvas selects the deprecated soft type. Blobs are far cheaper than a second scene render every frame and directly deliver the Section 7.2 grab behaviour. Play mode is the worst case and renders every frame anyway, so on-demand rendering would not help the 30 fps target.

**Alternatives considered**: drei `ContactShadows` re-renders the scene for each update, or stays frozen if limited to one frame. A 2048² map costs more with little benefit on a board this size.

## R7. Pointer, grid and picking

**Decision**: Pointer handling uses window-level pointer events plus maths. `pointerRay.ts` converts screen position to a camera ray, then intersects it with the ground plane to get the tile, and with one bounding box per piece (from catalogue height) to get the hovered piece. Drags are a state machine with a 4 px threshold. There is no HTML drag and drop.

**Rationale**: Section 3 requires ground-plane mapping to integer tiles. Palette drags begin in HTML, so 3D-object events cannot see them. Boxes let a user click the top of a 1.2-tile tree, which would otherwise hit the ground behind it. With at most 256 boxes, this is cheap.

**Alternatives considered**: Raycasting real meshes was rejected because it is slower with instances and needs per-instance bookkeeping.

## R8. Motion

**Decision**: Use `@react-spring/three` for piece lift, drag follow, drop settle, rotate and hover. Rotation springs run on a continuous angle so that 270° to 0° turns forward. Store state changes at once, as spec D-13 requires, and animation follows it. A drop starts from the 0.3 lifted height and reaches the ground in about 80 ms, then settles. That lets the place sound meet both "on contact" in Section 7.2 and the 100 ms limit in AC-12.8.

**Rationale**: Spring settling meets the 250 ms and 300 ms limits with no per-frame React work. Deleted pieces leave the store immediately, so `ExitEffects` plays their animation from a short-lived list.

## R9. Models

**Decision**: Build all 12 items and the train in code from primitives, with rounded and bevelled geometry and procedural or sourced wood textures. Use the Section 8 fallback and record it in `CREDITS.md`, stating the reason.

**Rationale**: The fallback applies when a suitable asset cannot be obtained. Section 6 fixes exact sizes (such as a 0.68 × 0.43 × 0.08 cassette and a 0.5-radius curve), connector positions must match the grid exactly, and a shared wood look is required across all items. No single CC0 set was found that fits, and mixing sets would break the look. Geometry made in code also has no download cost.

**Alternatives considered**: CC0 low-poly packs were rejected because their styling and dimensions do not match. Resizing them would not give the wooden-toy material look.

## R10. Audio

**Decision**: `audioEngine.play(event)` always appends to the sound log, then plays only if audio is unlocked and not muted. Sources are tried in this order:

1. Sourced CC0 or CC-BY `.mp3` files in `public/assets/audio/`.
2. For sound effects with no suitable file, Web Audio synthesis (`audio/synth.ts`).
3. For music with no suitable file, a generated `tone` track from a lazy import.

Sound effects load through Howler at startup. Music uses `html5: true`, so it streams and does not block play. Volume on the chug loop follows speed. MP3 is the single format.

**Rationale**: AC-12.6 delays real audio, but test sound logs must work before any interaction (spec D-08). Howler's `html5` mode is documented for large files, which avoids waiting for a full decode. MP3 avoids codec differences across the four browsers.

**Candidates to verify in implementation** (licence and download must be confirmed before use):

- Sound effects: Kenney Interface Sounds (listed as CC0 on OpenGameArt) and Kenney Impact Sounds (described as CC0 by third-party pages, wood content unconfirmed).
- Music: Yannz41 Indie Meditations and Fablefly Music loops (both described as CC BY 4.0), which need page-level confirmation and a usable download. Dylann Taylor's CC0 packs are chiptune, so they do not fit the style.
- Do not use Pixabay or similar sites whose licences are neither CC0 nor CC-BY.

If a track cannot be confirmed and downloaded, the `tone` fallback is the expected result and is allowed by Section 8.

## R11. Loading

**Decision**: Render the main menu first. Lazy-load `src/scene/` and start fetching it as soon as the menu is idle, so opening a diorama is immediate. Load `tone` only when the music fallback runs. Set Vite `base` to `./`. Confirm in the production bundle that drei imports tree-shake away unused heavy dependencies.

**Rationale**: This meets the 5 second target on 25 Mbps and keeps the initial bundle small.

## R12. Textures and asset checks

**Decision**: Source floor, tabletop, rug and wood grain textures at 1024² or smaller from CC0 libraries, as JPEG. Poly Haven, ambientCG, ShareTextures and OpenGameArt's CC0 packs are candidates. Confirm each licence on the asset page. If none fits, use `scene/woodTexture.ts`. `scripts/check-assets.mjs` enforces the size budgets and fails if any file under `public/assets/` is missing from `CREDITS.md`.

**Rationale**: Sections 7.3 and 8 set hard numbers, so a script is more reliable than review.

## R13. Controls

**Decision**: Use native `<select>` for `setting-select` and native `<input type="range">` for `music-volume` and `sfx-volume`, styled with Tailwind. Use Radix through adapted shadcn components for Dialog, Tooltip and Toast. Toggles are buttons with `aria-pressed`.

**Rationale**: Native elements are the most reliable for automated tests and keyboard use, for example setting a range value directly. Section 10 only requires the test ids. Section 3 sets the styling toolkit, and does not require every control to be a Radix primitive. Radix is used where it adds real behaviour: focus trapping, tooltips on disabled items and toast announcements.

**Layout**: The palette is a left column of about 200 px, the top bar is about 64 px tall, and the audio panel is about 220 × 96 px in a corner. They total about 21% of a 1280 × 720 viewport and less at 1920 × 1080. The sliders stay rendered at all times, so their test ids always exist.

**Alternatives considered**: Radix Select and Slider render custom elements that some test helpers cannot drive.

## R14. Testing and browser coverage

**Decision**: Vitest covers `src/domain/` and `src/persistence/`. Playwright covers Section 10 and the main journeys. Playwright browsers install with `PLAYWRIGHT_BROWSERS_PATH=0`, which puts them inside `node_modules`, so work stays in the project folder. Chromium runs with software WebGL flags.

**Limits**:

- Real Safari cannot run on this Windows machine. Playwright WebKit is the nearest check, so a Safari pass needs a final run on a Mac.
- The 30 fps target needs an Iris Xe class machine. Results from other hardware are indicative only, and the report must say what was measured.

**Rationale**: These dev dependencies are outside the runtime list, and `.gitignore` already expects Playwright output.

## R15. Avoiding console errors

**Decision**: Treat these as known sources and test for them:

- A missing favicon gives a 404, so ship `public/favicon.svg`.
- Radix Dialog needs a title and description, so every dialog has both.
- Corrupt saved data logs with `console.warn`, never `console.error`.
- Audio and texture failures are caught and fall back quietly.
- A failed canvas context shows a friendly message instead of throwing.
- Playwright fails any test that sees a console error or an uncaught exception.

**Rationale**: Section 11 requires no console errors, and each of these is a common way to break that.

## Sources

- [Kenney Interface Sounds on OpenGameArt](https://opengameart.org/content/interface-sounds)
- [Overview of Kenney's CC0 audio packs](https://gtstu.com/?p=5011)
- [Yannz41 Indie Meditations free pack](https://yannz41.itch.io/indie-meditations-free-music-pack/devlog/931120/new-free-pack-minimalistic-cozy)
- [Fablefly Music, Lily-Paddling Down the Stream](https://fablefly-music.itch.io/lily-paddling-down-the-stream)
- [Dylann Taylor, Buzzy Bits](https://dylanntaylor.itch.io/buzzy-bits)
- [ShareTextures CC0 parquet example](https://www.sharetextures.com/textures/floor/woodparquet_82)
- [OpenGameArt wood flooring material](https://opengameart.org/content/wood-flooring-material)
