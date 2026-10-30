# Credits

Every asset in `public/assets/` is listed here. Only CC0 and CC-BY assets are used.

## Assets

| File path | Title | Author | Source URL | Licence |
| --- | --- | --- | --- | --- |
| public/assets/textures/wood-floor.jpg | Wood Floor | Dimitrios Savva | https://polyhaven.com/a/wood_floor | CC0 |
| public/assets/textures/table-top.jpg | Plywood | Rob Tuytel | https://polyhaven.com/a/plywood | CC0 |
| public/assets/audio/music/carefree.mp3 | Carefree | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3 | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ |

"Carefree" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/. Change made: re-encoded to 128 kbps MP3 to fit the 5 MB music budget.

## Fallbacks

- **3D models**: every catalogue item and the train are built in code from Three.js primitives with procedural wood materials, so there are no `.glb` files. No available CC0 set matched the exact Section 6 sizes, the grid-aligned connectors and one shared wooden-toy look. Mixing sets would have broken that look.
- **Sound effects**: all 11 effects are synthesised with the Web Audio API in `src/audio/synth.ts`. Suitable wood-on-wood files could not be obtained: Kenney's Impact Sounds pack (CC0) offers no direct download link, OpenGameArt refuses automated access, and Freesound needs an account.
- **Wood grain on pieces and the rug**: drawn in code in `src/scene/woodTexture.ts`, so one neutral grain can be tinted per part.
- **Music**: a sourced file is used. A generated `tone` track in `src/audio/musicFallback.ts` takes over only if that file fails to load.
