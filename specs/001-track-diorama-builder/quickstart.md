# Quickstart: Run and Validate Track

This guide proves the feature works end to end. It references the [test hook contract](./contracts/test-hook.md), the [UI contract](./contracts/ui-controls.md) and the [data model](./data-model.md) rather than repeating them.

## Prerequisites

- Node.js at the version in `.nvmrc`, with npm
- A desktop browser with WebGL
- For the full performance check, a machine with an Intel Iris Xe class GPU
- For the full Safari check, a Mac

## Setup and run

```bash
nvm use
npm install
npm run dev        # Development server
npm run build      # Type check and production build, must show no errors
npm run preview    # Serve the production build
```

## Automated checks

```bash
npm run test:unit      # Domain and persistence tests
npm run check:assets   # Asset budgets and CREDITS.md coverage
```

Install the end-to-end browsers once. `PLAYWRIGHT_BROWSERS_PATH=0` keeps them inside the project. The commands below use bash syntax, so run them in Git Bash on Windows.

```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium firefox webkit
PLAYWRIGHT_BROWSERS_PATH=0 npm run test:e2e
```

Expected outcome: all suites pass, and no test sees a console error or uncaught exception.

## Validation scenarios

Open `npm run preview` with `?test=1` for the scenarios that use the hook.

### 1. Clean clone

From a fresh clone, run `npm install`, `npm run dev` and `npm run build`.

**Expected**: all three succeed, and the build reports no TypeScript errors.

### 2. Build and rules (User Story 1)

1. Choose New diorama and place all 12 items from the palette.
2. Drag a decoration onto a track, and drag a hill to column 15.
3. Try to add a second station.
4. Lay a straight next to an open end at a rotation that does not connect.

**Expected**: the ghost shows green or red correctly, failed drops shake and play the invalid sound, the station item is disabled with a tooltip, and the straight rotates to connect, with place and snap both in the sound log.

### 3. Track connectivity by hook

Place a station at (8, 8) and a straight at (8, 7), both with rotation 0, then call `getConnections()`.

**Expected**: one pair, the two track ids. Calling `placePiece('house', 8, 7)` returns `{ ok: false, reason: 'on_track' }`.

### 4. Train on a line (User Story 2)

Lay a station, two straights and a buffer stop in a line. Enter Play.

**Expected**: the whistle plays, the train leaves at 1.5 tiles per second, eases to a stop at the buffer, the bump plays, it waits 1 second, then runs with `direction` reverse.

### 5. Train on a closed loop

Lay four curves with straights so that the loop includes the station. Enter Play.

**Expected**: the train circles indefinitely. All three vehicles stay on the centreline, including through curves.

### 6. Manual driving

In Play, switch to Manual, then hold W for 1 second, release, and hold S at a dead end.

**Expected**: `speed` reaches 2 within 1 second of holding W, reaches 0 within 0.5 seconds of release, and the train refuses to pass the dead end.

### 7. Persistence (User Story 3)

1. Save a diorama with a non-default setting and start facing, then reload.
2. Open it and compare it with the saved state.
3. Corrupt one entry in `wooden-diorama:v1`, then reload.

**Expected**: the diorama is identical. The corrupt entry is skipped with a console warning, the others still appear, and there are no console errors.

### 8. Tactile timing and audio (User Story 5)

Do each moment in `requirement.md` Section 7.2, and use the DevTools performance recording to check timings. Reload, confirm silence until the first click, then change mute and volumes and reload again.

**Expected**: timings are within Section 7.2, every sound starts within 100 ms, and audio settings persist.

### 9. Performance

Load a diorama with 100 pieces at 1920 × 1080 in a production build, and record 30 seconds each of Build and Play in the DevTools performance panel. Load the app once with network throttled to 25 Mbps.

**Expected**: at least 30 fps in both modes, playable within 5 seconds, and `npm run check:assets` reports under 20 MB.

**Note**: results count toward the target only on an Iris Xe class GPU. On other hardware, report the GPU used and treat the result as indicative.

### 10. Hook gating

Open the production build with and without `?test=1`.

**Expected**: `window.__DIORAMA__` exists with the flag and is undefined without it.

### 11. Cross-browser

Run the end-to-end suite in Chromium and Firefox, and in Chrome and Edge through their installed channels. Run it in WebKit as the nearest available check for Safari.

**Expected**: all pass. Record a real Safari pass separately, from a Mac.

## Definition of done

Requirement Section 13 applies: every Must criterion is met, Section 10 is implemented exactly, `CREDITS.md` is complete, and the app builds and runs from a clean clone.
