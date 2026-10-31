# Contract: Local Storage

`requirement.md` Section 9 is normative for the `wooden-diorama:v1` and `wooden-diorama:audio` keys and
for the `SaveFile` and `Diorama` shapes.

## Keys

| Key | Holds |
| --- | --- |
| `wooden-diorama:v1` | The save file |
| `wooden-diorama:audio` | `AudioSettings`, as in `data-model.md` |
| `wooden-diorama:v1:corrupt` | A raw copy of an unreadable save file. Written by this app only |

## Reading

| Input | Result |
| --- | --- |
| Key missing | Empty list, no warning |
| Not valid JSON, not an object, or `version` is not 1 | Empty list and one warning |
| `dioramas` is not an array | Empty list and one warning |
| One entry invalid | Entry skipped and one warning naming its position; other entries load |
| Storage access throws | Empty list and one warning |

An entry is valid when every Section 9 field has the right type and value, its dates parse, its name meets
the name rule, and its pieces obey the placement rules: on the grid, no overlaps, no decoration on a track
and at most one station. Any failure rejects the whole entry.

All of these use `console.warn`, never `console.error`.

## Writing

1. Read and parse the current key again.
2. If the whole file is unreadable and `:corrupt` is empty, copy it to `:corrupt`.
3. Replace the entry with a matching id, or append a new one.
4. Keep raw entries that failed validation, in place.
5. Write the file back.

If writing throws, for example on full storage, show a toast saying the save failed and keep `isDirty`
true. If a thumbnail caused the overflow, retry once without it.

## Autosave

A timer runs while in Build mode and fires every 30 seconds. It saves only if `isDirty` is true and no drag
is active, and it shows the normal save toast. It stops in Play mode and on the menu.
