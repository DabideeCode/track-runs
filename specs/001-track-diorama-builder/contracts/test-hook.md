# Contract: Test Hook

`requirement.md` Section 10.2 defines the exact TypeScript interface of `window.__DIORAMA__`, and it is not repeated here. This contract records how each function behaves where Section 10 leaves room, so that implementation and tests agree.

## Availability

| Environment | URL | Hook present |
| --- | --- | --- |
| Development | Any | Yes |
| Production build | Contains `?test=1` | Yes |
| Production build | No `?test=1` | No |

The hook exists from app start, including on the main menu (spec D-23).

When the hook is enabled, a second helper, `window.__TRACK_PROJECT__(x, y, z)`, projects a world position to screen coordinates. It is an addition for this project's own pointer tests and is not part of Section 10.

## Functions

All actions apply Section 8 rules in the order given in [data-model.md](../data-model.md).

| Function | On success | Sounds on success | Failure reasons |
| --- | --- | --- | --- |
| `placePiece` | Adds one piece and returns its `id` | `place`, then `snap` if a connection formed | `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`, `occupied` |
| `movePiece` | Moves the piece, auto-adjusting a track as a UI drop does (spec D-04) | `move`, then `snap` if a connection formed | `play_mode`, `not_found`, `out_of_bounds`, `on_track`, `occupied` |
| `rotatePiece` | Rotates 90° clockwise, always valid for an existing piece | `rotate`, then `snap` if a connection formed | `play_mode`, `not_found` |
| `removePiece` | Removes the piece | `delete` | `play_mode`, `not_found` |
| `setMode('play')` | Enters Play, Auto driving | `whistle`, then `chug` when moving | `no_station` |
| `setMode('build')` | Returns to Build, train parked | None | None |
| `setDriveMode` | Sets drive mode. Entering Play resets it to Auto | None | Returns nothing |

Calling `setMode` with the current mode returns `{ ok: true }` and does nothing.

## Failure sounds (spec D-07)

| Reason | Logs `invalid` |
| --- | --- |
| `out_of_bounds`, `station_limit`, `on_track`, `occupied` | Yes |
| `play_mode`, `not_found`, `no_station` | No |

`setMode('play')` with no station also shows the toast "Place a station to start".

## Rotation in `placePiece`

| `rotation` argument | Result |
| --- | --- |
| Omitted | Starts at 0, then auto-adjust applies |
| Given | Used as is, with no auto-adjust |

## Getters

| Function | Behaviour |
| --- | --- |
| `getState` | Returns the Section 9 fields as a snapshot. Changing it does not affect the app |
| `getConnections` | Each connected pair once, in `pieces` order |
| `getTrain` | `null` with no station. Otherwise see the hook values in [data-model.md](../data-model.md). In Build mode it returns the parked train at `progress` 0.5, `moving` false, `direction` forward and `speed` 0 |
| `getSoundLog` | All events since page load, in order, including those fired while audio is locked or muted (spec D-08) |

## Timing

Function results and state change synchronously. Animation follows afterwards and does not delay state (spec D-13). `getTrain` speed and position advance on animation frames, so tests must wait or poll after `setMode('play')`.

## Test ids

Section 10.1 is the complete list. Two ids have a meaning that depends on context:

- `confirm-ok` is Delete in the delete dialog and Save in the unsaved-changes dialog (spec D-17).
- `confirm-discard` appears only in the unsaved-changes dialog.
