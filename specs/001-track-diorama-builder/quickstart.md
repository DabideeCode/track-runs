# Quickstart: Validating Track

How to prove the feature works end to end. Behaviour details are in `contracts/` and `data-model.md`.

## Prerequisites

- Node.js at the version in `.nvmrc`, and npm.
- A browser with WebGL.
- For end-to-end tests, browsers installed inside the project:
  `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium firefox webkit`

## Commands

| Command | Expected result |
| --- | --- |
| `npm install` | Completes from a clean clone with no peer dependency errors |
| `npm run dev` | Serves the app and opens on the main menu |
| `npm run build` | Succeeds and reports no TypeScript errors |
| `npm run preview` | Serves the production build |
| `npm test` | All unit tests pass |
| `npm run test:e2e` | All end-to-end tests pass in all three browsers |

## Scenario 1: Hook gating

1. Run the production preview and open `/`. `window.__DIORAMA__` is undefined.
2. Open `/?test=1`. The hook is defined.
3. Run `npm run dev` and open `/`. The hook is defined.

## Scenario 2: Rules through the hook

With `/?test=1`, in the browser console, starting from a new diorama:

| Call | Expected |
| --- | --- |
| `placePiece('straight', 0, 0, 0)` | `ok: true` |
| `placePiece('house', 0, 0)` | `reason: 'on_track'` |
| `placePiece('straight', 0, 0, 0)` | `reason: 'occupied'` |
| `placePiece('hill', 15, 5)` | `reason: 'out_of_bounds'` |
| `placePiece('station', 5, 5, 0)`, then again at `6, 5` | `ok: true`, then `reason: 'station_limit'` |
| `setMode('play')`, then `placePiece('house', 1, 1)` | `ok: true`, then `reason: 'play_mode'` |

`getSoundLog()` then lists `place` and `invalid` entries in order.

## Scenario 3: Build by hand

Run User Story 1 and 2 acceptance scenarios in the spec with the mouse: drag from the palette, click to
place, drop on invalid tiles, press R and Escape, move, delete, undo and redo. Check the timings in
`requirement.md` Section 7.2 by eye and with a performance trace.

## Scenario 4: Train

1. Build a closed loop that includes the station. In Play, the train runs at 1.5 tiles per second and never
   stops for 60 seconds.
2. Build a line of 6 tracks ending in a buffer. In Play, the train eases to a stop, pauses 1 second and
   reverses, and `getTrain().direction` changes.
3. Place a lone station. In Play, the train shuttles and the app stays responsive.
4. Switch to Manual. W and S reach 2 tiles per second within 1 second and stop within 0.5 seconds of release.
5. Return to Build. The train parks at the station with its start facing.

## Scenario 5: Persistence

1. Save a diorama using both settings and all 12 items in turn, then reload. It reopens identically.
2. In the console, corrupt one entry in `wooden-diorama:v1` and reload. The menu skips it, logs a warning,
   and the others work.
3. Set the whole key to `{bad` and reload. The menu opens empty with no crash.
4. Leave a changed diorama via the back button, and try Save, Discard and Cancel.

## Scenario 6: Audio

Before any click, nothing plays. After one, music starts. Mute and both sliders work and persist across a
reload. Place and delete sound clearly different.

## Scenario 7: Performance

With a script placing 100 pieces, record a trace at 1920 × 1080 in Build and Play. Expect at least 30 fps.
Throttle the network to 25 Mbps with an empty cache. The user can start building within 5 seconds. Check
that total `public/assets` is under 20 MB, and that the entry chunk has no Three.js code.

Record the actual GPU used. If it is not an integrated GPU such as Intel Iris Xe, say so in `README.md`.

## Scenario 8: Delivery checks

- No console errors through scenarios 3 to 6, in each browser.
- Tab through the overlay. Every control shows a focus ring and has an accessible name.
- `npm test` fails if a runtime dependency outside the allowlist is added.
- `CREDITS.md` lists every asset and fallback, and `README.md` covers running, controls and limitations.
