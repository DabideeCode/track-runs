# Credits

Every asset shipped in `public/assets/`. All are CC0 or CC-BY, and all have been modified as described. None comes from a commercial game.

## Music

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/audio/music/life-of-riley.mp3` | Life of Riley | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400054 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

"Life of Riley" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License. Changes: loudness normalised and re-encoded at 128 kbps.

## Sound effects

The recordings below were pitch-shifted, filtered, trimmed and normalised to make each effect. Sources are the CC0 "50 RPG sound effects" and "51 UI sound effects" packs by Kenney.

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/audio/sfx/place.mp3` | chop | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/move.mp3` | bookPlace2 | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/snap.mp3` | bookPlace3 | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/rotate.mp3` | bookClose | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/pickup.mp3` | handleSmallLeather | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/delete.mp3` | cloth1 | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/invalid.mp3` | doorClose_4, doubled | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/bump.mp3` | doorClose_1 | Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/chug.mp3`, `public/assets/audio/sfx/chug.ogg` | Rail clatter loop, sequenced from chop and bookPlace1 over filtered noise | Kenney (recordings) | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `public/assets/audio/sfx/ui.mp3` | click3 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 |
| `public/assets/audio/sfx/whistle.mp3` | WWS SteamWhistle | Work With Sounds / Konrad Gutkowski | https://commons.wikimedia.org/wiki/File:WWS_SteamWhistle.ogg | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Changes to the whistle: a 1.5 second excerpt, band-limited and faded.

## Textures

All from ambientCG (CC0). All were processed: the 1K colour maps were desaturated or rebuilt from their luminance, so vertex colours control the paint, and the rug field and border bands were painted over the carpet pile.

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `public/assets/textures/wood-grain.jpg` | Wood 092 | ambientCG | https://ambientcg.com/view?id=Wood092 | CC0 |
| `public/assets/textures/paint-grain.jpg` | Wood 092 (derived) | ambientCG | https://ambientcg.com/view?id=Wood092 | CC0 |
| `public/assets/textures/floorboards.jpg` | Wood Floor 040 | ambientCG | https://ambientcg.com/view?id=WoodFloor040 | CC0 |
| `public/assets/textures/tabletop.jpg` | Wood Floor 051 | ambientCG | https://ambientcg.com/view?id=WoodFloor051 | CC0 |
| `public/assets/textures/rug.jpg` | Carpet 016 | ambientCG | https://ambientcg.com/view?id=Carpet016 | CC0 |

## Models: fallback used

`public/assets/models/` is intentionally empty. Section 6 fixes exact sizes and track geometry (for example a radius 0.5 curve centred on a tile corner) and Section 7 asks for one consistent wooden look, and no CC0 or CC-BY model set matched both. All pieces, the train and the room props are therefore built from Three.js primitives in `src/scene/`, as Section 8's fallback allows, using the wood and paint textures above.

## Other

- Procedural in code, no asset file: the contact shadow texture (`src/scene/materials.ts`) and the palette previews, which are rendered from the real models at startup (`src/scene/previews.ts`).
- The main menu illustration and `public/favicon.svg` were drawn for this project.
- The interface uses the system font rather than a web font, because common free fonts use the OFL, which Section 8 does not list.
- The `tone` fallback is not used, because real music was sourced.
