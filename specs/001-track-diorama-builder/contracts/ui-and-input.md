# Contract: UI and Input

`requirement.md` Section 10.1 is the normative list of test ids. This file adds how each control behaves.

## Controls by screen and mode

"Disabled" means rendered and visibly disabled. Every test id stays in the DOM on its screen.

| Control (test id) | Menu | Build | Play | Notes |
| --- | --- | --- | --- | --- |
| `palette-<type id>` | No | Enabled | Disabled | `palette-station` is also disabled while a station exists; its tooltip sits on a wrapper so it still shows |
| `mode-toggle` | No | Enabled | Enabled | Native button with `aria-pressed` |
| `drive-toggle` | No | Disabled | Enabled | |
| `setting-select` | No | Enabled | Enabled | Native select with values `bedroom` and `kitchen`, labelled "Bedroom floor" and "Kitchen table" |
| `flip-direction` | No | Enabled | Disabled | |
| `save-button` | No | Enabled | Enabled | |
| `back-to-menu` | No | Enabled | Enabled | |
| `delete-piece` | No | When a piece is selected | Disabled | |
| `reset-view` | No | Enabled | Enabled | |
| `mute-toggle` | Yes | Enabled | Enabled | |
| `music-volume`, `sfx-volume` | Yes | Enabled | Enabled | Range inputs from 0 to 100, stored as 0 to 1 |
| `toast` | Yes | Yes | Yes | Present only while a message shows, for 3 seconds |

An extra `low-quality-toggle` control (Should) sits with the view controls and stays available in both modes.

Screen elements: `main-menu` wraps the menu, with `new-diorama`, then `diorama-list` holding one
`diorama-item` per entry (carrying `data-diorama-id`), each with `diorama-open`, `diorama-rename` and
`diorama-delete`. `diorama-list` renders only when there is at least one entry. `playfield` wraps the
playfield and carries `data-mode`.

## Dialogs

| Dialog | Trigger | Controls | Escape |
| --- | --- | --- | --- |
| Delete | `diorama-delete` | `confirm-ok` deletes, Cancel | Cancel |
| Rename | `diorama-rename` | `rename-input`, `confirm-ok`, Cancel; Enter also confirms | Cancel |
| Unsaved changes | `back-to-menu` while dirty | `confirm-ok` saves then leaves, `confirm-discard`, Cancel | Cancel |

A refused rename keeps the dialog open, shows an inline message and leaves the old name unchanged.
`rename-input` has no length cap, so over-long names reach validation rather than being cut.

## Keyboard

Ignored while a text field has focus or a dialog is open. Letters match in either case.

| Key | Build | Play |
| --- | --- | --- |
| R | Rotate the ghost or selected piece | Nothing |
| F | Flip start direction | Nothing |
| Delete, Backspace | Delete the selected piece | Nothing |
| Escape | Cancel the drag, else deselect the tool, else clear the selection | Nothing |
| Ctrl or Cmd+Z | Undo | Nothing |
| Ctrl or Cmd+Shift+Z | Redo | Nothing |
| W, S | Nothing | Drive forward or in reverse, in Manual only |

The driving keys are handled on `window`, so they work after a button click leaves focus on that button.

## Mouse on the board (Build mode)

| Input | Tool selected | No tool selected |
| --- | --- | --- |
| Hover | Ghost and tile highlight | Tile highlight; the piece under the pointer rises |
| Left click, free tile | Place | Clear the selection |
| Left click, on a piece | Invalid placement | Select it |
| Left drag from a piece | Starts a move | Starts a move |

Left drag from a palette item starts a placement. A plain click on a palette item toggles its selection.
Right drag orbits, middle drag pans and the wheel zooms, in both modes.

## Overlay limits

- Panels use `pointer-events: auto` inside a `pointer-events: none` root, so the canvas receives the rest.
- Total panel area is at most 25% of the viewport in Build mode at 1920 × 1080 and at 1280 × 720, measured
  by summing panel rectangles in an end-to-end test.
- Every control has an accessible name and a visible focus ring.
- No text or surface uses pure black, pure white or neon. The shadcn default theme tokens are replaced with
  the Section 7.1 palette.
- The tab title is "Track", and the menu heading is an `h1` reading "Track".
