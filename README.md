# Track

A cozy wooden train diorama builder. Lay out track and toy decorations on a bedroom floor or a kitchen table, then play with a small wooden train on what you built.

## Run it

Use the Node.js version in `.nvmrc` (22.17.0).

```bash
npm install
npm run dev       # development server
npm run build     # type-check and production build
npm run preview   # serve the production build
```

Tests:

```bash
npm test          # unit tests for rules, track paths, the train and saving
npm run test:e2e  # browser tests; run `npm run build` first. Uses your installed Chrome
```

## Controls

### Building

| Action | Control |
| --- | --- |
| Place a piece | Drag it from the palette, or click it in the palette and click a tile |
| Stop placing | Esc, or click the palette item again |
| Select a piece | Left click |
| Move a piece | Left drag |
| Rotate 90° clockwise | R (selected piece, or the piece you are holding) |
| Delete | Delete, Backspace, or the bin button |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (Cmd on macOS) |
| Cancel a drag | Esc |
| Flip the train's start direction | F, or the Flip direction button |

### Camera

| Action | Control |
| --- | --- |
| Orbit | Right drag |
| Pan | Middle drag |
| Zoom | Scroll wheel |
| Reset | The Reset view button |

### Playing

Press **Play** (a station is needed). The train starts by itself in Auto. Use the Auto/Manual button to change style.

| Action | Control |
| --- | --- |
| Forward, locomotive leading | Hold W (Manual) |
| Reverse, carriages leading | Hold S (Manual) |

### Other

Dioramas are stored in this browser, so use **Save** to keep your work. Unsaved changes are also autosaved every 30 seconds in Build mode. The sound panel has a mute button and separate music and effects volumes. The feather button turns on Low quality, which switches off shadows and lowers the render resolution.

## Test hook

Add `?test=1` to the URL to expose `window.__DIORAMA__` in a production build. It is always present in development. See Section 10 of `requirement.md`.

## Known limitations

- **Short track.** The train is about 2.7 tiles long and the locomotive always starts on the station. With less than about 2.25 tiles of track behind the station, the parked carriages therefore rest past the open end, off the rails, until the train has run forward. It then stays fully on the rails, reversing until its tail reaches the track end. With fewer than about 2.7 tiles of track in total the whole train cannot fit, so the carriages stay past the end.
- **Parked train overlap.** Those parked carriages are not checked against the placement rules, so they can visually overlap a decoration just beyond a track end, or reach past the grid edge.
- **Browser coverage.** The automated suite passes in Chrome, Firefox and Playwright's WebKit on Windows. Set `PW_BROWSER=firefox` or `PW_BROWSER=webkit` to run it there. Edge shares Chrome's engine and was not run separately. Safari itself was not available: WebKit is the closest stand-in, and that build has no Web Audio, so Safari's audio path is the least tested.
- **Sounds were chosen by measurement.** They were selected and shaped using duration, level and frequency measurements, not by ear, so their balance may benefit from a listening pass.
- **Save size.** Browser storage is limited to a few megabytes. If it fills, a message says so, and a save without a thumbnail is tried first.
- **Input.** Mouse and keyboard only, as touch is out of scope.

## Credits

Every asset and its licence is listed in [CREDITS.md](CREDITS.md).
