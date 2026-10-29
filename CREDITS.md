# Credits

## Assets (§8)

Track ships **no third-party asset files**. Every model, texture, sound effect and the music is generated at runtime by the app's own code, using the fallback route described in §8 of `requirement.md`. This was the builder's choice (decision D1 in `docs/superpowers/specs/2026-10-29-track-decisions.md`). It avoids licensing risk and keeps the download far below the 20 MB budget.

The asset folders `public/assets/models/`, `public/assets/textures/`, `public/assets/audio/sfx/` and `public/assets/audio/music/` exist but are intentionally empty.

| Asset | Source file | Kind | Author | Licence |
| --- | --- | --- | --- | --- |
| All 12 palette items, the locomotive and carriages | `src/scene/geometry/*.ts` | Procedural Three.js primitives (rounded boxes, extrusions, lathes), merged per material | Track project | Project code (fallback, §8) |
| Setting props (bed leg, toy crate, books, ball, fruit bowl, mug, spoon, salt pot) | `src/scene/Environment.tsx` | Procedural Three.js primitives | Track project | Project code (fallback, §8) |
| Wood grain, floorboards, tabletop, rug, tablecloth, lettered blocks | `src/scene/materials.ts`, `src/scene/Environment.tsx` | Canvas-generated textures (≤ 1024 × 1024) | Track project | Project code (fallback, §8) |
| Sound effects: pickup, place, move, rotate, delete, snap, invalid, ui, whistle, chug, bump | `src/audio/sfx.ts` | Web Audio API synthesis (modal wood-knock partials, filtered noise) | Track project | Project code (fallback, §8) |
| Background music: an original cozy acoustic-electronic loop in F major | `src/audio/music.ts` | Procedural, generated with `tone` | Track project | Project code (fallback, §8) |
| Palette icons, favicon, menu illustration | `src/ui/PaletteIcons.tsx`, `public/favicon.svg`, `src/ui/MainMenu.tsx` | Hand-written SVG | Track project | Project code |

No music, sounds or models come from commercial games or other copyrighted media.

## Font

This is not a §8 asset. It loads from Google Fonts at runtime and is credited here for completeness.

| Font | Source | Author | Licence |
| --- | --- | --- | --- |
| Nunito | https://fonts.google.com/specimen/Nunito | Vernon Adams, Cyreal, Jacques Le Bailly | SIL Open Font License 1.1 |

## Libraries

The runtime libraries are React, Three.js, @react-three/fiber, @react-three/drei, Zustand, Radix UI via shadcn/ui, lucide-react, nanoid and Tone.js. They are used under their respective MIT licences.
