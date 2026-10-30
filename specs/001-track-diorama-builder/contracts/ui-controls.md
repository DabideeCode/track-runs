# Contract: UI Controls

Test ids come from `requirement.md` Section 10.1. This contract fixes each control's element type, availability and keyboard behaviour.

## Playfield controls

| Control | Test id | Element | Build mode | Play mode |
| --- | --- | --- | --- | --- |
| Screen | `playfield` | Container with `data-mode="build"` or `data-mode="play"` | Present | Present |
| Palette items | `palette-<type id>` | Button | Enabled, station disabled while one exists | Disabled |
| Build/Play | `mode-toggle` | Button with `aria-pressed` | Enabled | Enabled |
| Auto/Manual | `drive-toggle` | Button with `aria-pressed` | Disabled | Enabled |
| Setting | `setting-select` | Native `<select>`, values `bedroom` and `kitchen` | Enabled | Enabled |
| Flip direction | `flip-direction` | Button | Enabled, with or without a station | Disabled |
| Save | `save-button` | Button | Enabled | Enabled |
| Back to menu | `back-to-menu` | Button | Enabled | Enabled |
| Delete piece | `delete-piece` | Button | Enabled when a piece is selected | Disabled |
| Reset view | `reset-view` | Button | Enabled | Enabled |
| Mute | `mute-toggle` | Button with `aria-pressed` | Enabled | Enabled |
| Music volume | `music-volume` | Native range input, 0 to 100 | Enabled | Enabled |
| Effects volume | `sfx-volume` | Native range input, 0 to 100 | Enabled | Enabled |
| Low quality | None | Button with `aria-pressed` | Enabled | Enabled |

Controls stay in the page when disabled, so their test ids always exist. The station palette item uses `aria-disabled` so its tooltip still works on hover and keyboard focus. Clicking it does nothing.

Mute and the two sliders also appear on the main menu (spec D-21). Only one of each is ever on screen.

## Main menu controls

| Control | Test id | Element |
| --- | --- | --- |
| Screen | `main-menu` | Container |
| New diorama | `new-diorama` | Button |
| List | `diorama-list` | List, with one `diorama-item` per entry carrying `data-diorama-id` |
| Open, rename, delete | `diorama-open`, `diorama-rename`, `diorama-delete` | Buttons |
| Rename input | `rename-input` | Text input, Enter confirms, Escape cancels |

`diorama-list` is present even when empty. In that state, the empty-state prompt appears alongside it.

## Dialogs

| Dialog | Actions | Test ids |
| --- | --- | --- |
| Delete diorama | Delete, Cancel | `confirm-ok` |
| Unsaved changes | Save, Discard, Cancel | `confirm-ok`, `confirm-discard` |

Dialogs trap focus, close on Escape as Cancel, and have an accessible title and description.

## Toast

One toast shows at a time, in the `toast` element, and dismisses itself after about 3 seconds.

| Event | Text |
| --- | --- |
| Save | "Saved" |
| Autosave | "Autosaved" |
| Save failed | "Could not save. Storage may be full." |
| Play without a station | "Place a station to start" |

## Keyboard

Shortcuts are ignored while typing in a text field or while a dialog is open (spec D-20).

| Key | Mode | Action |
| --- | --- | --- |
| R | Build | Rotate the selected piece, drag ghost or hover ghost |
| Delete, Backspace | Build | Delete the selected piece |
| Escape | Build | Cancel the drag, otherwise clear the tool, otherwise clear the selection |
| F | Build | Flip direction |
| Ctrl+Z, Cmd+Z | Build | Undo |
| Ctrl+Shift+Z, Cmd+Shift+Z | Build | Redo |
| W | Play, Manual | Hold to move forward |
| S | Play, Manual | Hold to move in reverse |

## Pointer

| Input | Result |
| --- | --- |
| Left click on a free tile with a tool | Place |
| Left click on a piece | Select it and clear any tool (spec D-01) |
| Left click on an empty tile with no tool | Clear the selection |
| Left drag from the palette | Ghost, then place on release |
| Left drag on a piece | Move |
| Right drag | Orbit |
| Middle drag | Pan |
| Wheel | Zoom |

The browser context menu is suppressed on the canvas. Wheel input over overlay panels does not zoom the scene.

## Focus and names

- Every control has a visible focus ring and an accessible name. Icon-only buttons have an `aria-label`.
- Toggles expose their state through `aria-pressed`, and their label states the current mode.
- Overlay panels stay within 25% of the viewport in Build mode, at both 1920 × 1080 and 1280 × 720.
