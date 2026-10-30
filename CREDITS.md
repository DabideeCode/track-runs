# Credits

Every asset file under `public/assets/` is listed in the Assets table with its path, title, author, source URL and licence. Assets that are made in code instead of loaded from a file are listed under Fallbacks.

The empty `.gitkeep` files in `public/assets/models/`, `public/assets/textures/`, `public/assets/audio/sfx/` and `public/assets/audio/music/` only keep the folders in git. They are not assets, so they have no row.

## Assets

| Path | Title | Author | Source URL | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/audio/sfx/pickup.ogg` | impactSoft_medium_001 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/place.ogg` | impactWood_medium_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/move.ogg` | footstep_wood_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/rotate.ogg` | impactWood_light_002 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/delete.ogg` | impactPlank_medium_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/snap.ogg` | impactWood_light_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/invalid.ogg` | impactSoft_heavy_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/bump.ogg` | impactWood_heavy_000 (Impact Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| `public/assets/audio/sfx/ui-click.ogg` | click_001 (Interface Sounds 1.0) | Kenney (www.kenney.nl) | https://kenney.nl/assets/interface-sounds | CC0 1.0 |

The files are unmodified copies from the packs, renamed after the sound event they play (`ui-click.ogg` plays the `ui` event). The CC0 licence is stated in each pack's `License.txt` (https://creativecommons.org/publicdomain/zero/1.0/).

### CC-BY assets

No CC-BY assets are used. Any CC-BY file added later gets a row in the Assets table naming its author, its source URL and CC-BY (with version) as its licence.

## Fallbacks

These items, sound events and music have no sourced file. Each is made in code by the method shown.

| Replaces | Fallback method | Code |
| --- | --- | --- |
| Item: Straight track | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Curved track | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Tunnel | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Station | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Buffer stop | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Toy house | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Pine tree | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Round tree | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Hill | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Toy car | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Cassette tape | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Item: Building blocks | Three.js primitives with procedural wood materials | `src/scene/models/geometry.ts` |
| Train: locomotive | Three.js primitives with procedural wood materials | `src/scene/models/trainGeometry.ts` |
| Train: two carriages | Three.js primitives with procedural wood materials | `src/scene/models/trainGeometry.ts` |
| Bedroom setting: floorboards, felt rug and props (bed leg, toy crate, slipper, book stack) | Three.js primitives with procedural wood materials | `src/scene/settings/settingGeometry.ts` |
| Kitchen setting: tabletop and props (fruit bowl, mug, salt shaker, napkin) | Three.js primitives with procedural wood materials | `src/scene/settings/settingGeometry.ts` |
| Textures: wood grain, floorboards, felt, tabletop and the A, B and C block letters | Procedural textures: seeded greyscale pixel data generated in TypeScript at runtime and wrapped in a Three.js `DataTexture` (no image file and no canvas) | `src/scene/models/proceduralTextures.ts`, `src/scene/models/materials.ts` |
| Texture: soft contact shadow under pieces | Procedural texture: radial gradient pixel data in a Three.js `DataTexture` | `src/scene/pieces/instancing.ts` |
| Sound event `whistle` | Web Audio API synthesis | `src/audio/synth.ts` |
| Sound event `chug` | Web Audio API synthesis | `src/audio/synth.ts` |
| Background music | Procedural music with `tone` | `src/audio/music.ts` |

Each file-based sound event in the Assets table (`pickup`, `place`, `move`, `rotate`, `delete`, `snap`, `invalid`, `ui`, `bump`) also has a Web Audio API synthesis fallback in `src/audio/synth.ts`, which plays if its file cannot be loaded or decoded.
