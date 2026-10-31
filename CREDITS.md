# Credits

Every asset in Track, with its licence. All sourced assets are CC0, so no attribution is required. They are
listed for traceability.

## Textures

Colour maps only. Resized, recompressed and regraded for the Section 8 budget and the Section 7.1 palette.

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/textures/wood-honey.jpg` | Wood 048 | ambientCG | https://ambientcg.com/a/Wood048 | CC0 1.0 |
| `public/assets/textures/wood-grain-light.jpg` | Derived from Wood 048 (light grey grain) | ambientCG | https://ambientcg.com/a/Wood048 | CC0 1.0 |
| `public/assets/textures/wood-tabletop.jpg` | Wood 058 | ambientCG | https://ambientcg.com/a/Wood058 | CC0 1.0 |
| `public/assets/textures/floorboards.jpg` | Wood Floor 040 | ambientCG | https://ambientcg.com/a/WoodFloor040 | CC0 1.0 |
| `public/assets/textures/fabric.jpg` | Fabric 030 | ambientCG | https://ambientcg.com/a/Fabric030 | CC0 1.0 |

## Sound effects

All from the pack "100 CC0 metal and wood SFX" by rubberduck, https://opengameart.org/content/100-cc0-metal-and-wood-sfx, CC0 1.0.
Converted from `.ogg` to `.mp3`, mixed to mono, trimmed of leading silence and renamed by use.

| File | Original file in the pack | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/audio/sfx/pickup.mp3` | `wood_misc_05.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/place.mp3` | `wood_hammer_02.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/move.mp3` | `wood_close_01.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/rotate.mp3` | `wood_hit_06.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/delete.mp3` | `wood_cracking_04.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/snap.mp3` | `wood_hit_01.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/invalid.mp3` | `wood_squeak_02.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/bump.mp3` | `wood_hit_09.ogg` | rubberduck | as above | CC0 1.0 |
| `public/assets/audio/sfx/ui.mp3` | `wood_hit_02.ogg` | rubberduck | as above | CC0 1.0 |

## Music

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/audio/music/cozy-puzzle-title.mp3` | Cozy Puzzle Title | MintoDog | https://opengameart.org/content/cozy-puzzle-title | CC0 1.0 |

## Fallbacks used (Section 8)

- **3D models:** no suitable CC0 wooden toy set in `.glb` could be confirmed, and items need exact sizes and
  connector positions. All 12 items, the train and the setting props are built in code from Three.js
  primitives (`src/scene/geometry/`, `src/scene/Settings/`) with the textures above. `public/assets/models/`
  is intentionally empty.
- **Whistle and chug:** the sound pack has neither, so both are synthesised with the Web Audio API
  (`src/audio/synthSfx.ts`).
- **Any effect that fails to load** also falls back to a synthesised sound at run time.
- **Music:** a sourced file is used, so the `tone` fallback was not needed and `tone` is not a dependency.
