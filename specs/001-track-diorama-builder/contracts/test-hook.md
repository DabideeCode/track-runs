# Contract: Test Hook

`requirement.md` Section 10.2 defines `window.__DIORAMA__`, its types and its code lists, and is
normative. This file adds the behaviour that section leaves open.

## Exposure

Exposed when `import.meta.env.DEV` is true, or when the URL's `test` parameter equals `1`. The hook module
ships in the bundle but is not attached otherwise.

## Actions

Every action calls the same store command as the UI, so rules, undo history and sounds match it. Each
command runs synchronously, so its result and `getState()` are correct as soon as it returns.

| Call | On success | Sounds logged | On failure |
| --- | --- | --- | --- |
| `placePiece` | Adds one piece, returns its `id` | `place`, then `snap` if a connection formed | `invalid` |
| `movePiece` | Moves it, applying auto-adjust | `move`, then `snap` if a connection formed | `invalid` |
| `rotatePiece` | Turns it 90° clockwise | `rotate`, then `snap` if a connection formed | `invalid` |
| `removePiece` | Removes it | `delete` | `invalid` |
| `setMode('play')` | Starts the train | `whistle`, then `chug` once it moves | `no_station` and the toast, no sound |
| `setMode('build')` | Parks the train | None | Never fails |
| `setMode` to the current mode | No change, `ok: true` | None | Never fails |
| `setDriveMode` | Sets the driving style | None | Returns nothing |

`pickup` and `ui` come only from real pointer actions, so hook calls never log them.

`placePiece` with `rotation` omitted starts at 0° and applies auto-adjust. With `rotation` given, it is
used as is.

Validation order and reason priority are in `data-model.md`. An unknown `type` returns `not_found`.

## Reads

- `getState()` returns the Section 9 `GameState` fields. Extra fields may be present.
- `getConnections()` returns each connected pair once, with no duplicates in reverse order.
- `getTrain()` follows `data-model.md`. It returns `null` with no station.
- `getSoundLog()` returns a copy of all events since page load, recorded even if muted or before the
  first interaction. The looping `chug` is logged once each time it starts, not on each repeat.
