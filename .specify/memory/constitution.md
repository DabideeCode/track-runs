<!--
Sync Impact Report
- Version change: unversioned template → 1.0.0
- Modified principles (all template placeholders replaced, none renamed from a prior version):
  - [PRINCIPLE_1_NAME] → I. Mandated Technology Stack (requirement.md Section 3)
  - [PRINCIPLE_2_NAME] → II. Scene and Overlay Architecture (requirement.md Section 3)
  - [PRINCIPLE_3_NAME] → III. Stylised Realistic Look and Tactile Feel (requirement.md 7.1, 7.2)
  - [PRINCIPLE_4_NAME] → IV. Performance on Weak Devices (requirement.md 7.3)
  - [PRINCIPLE_5_NAME] → V. Non-Functional Baseline (requirement.md Section 11)
- Added sections:
  - Source of Truth and Project Boundaries (CLAUDE.md)
  - Development Environment (CLAUDE.md)
  - Governance
- Removed sections: none
- Templates: not modified. Dependent templates read this file at runtime.
- Follow-up TODOs: none. No placeholders deferred.
-->

# Track Constitution

## Core Principles

### I. Mandated Technology Stack

Track MUST be built with exactly this stack:

| Area | Required |
| --- | --- |
| Language | TypeScript |
| Build | React with Vite |
| Styling | Tailwind CSS, with Radix UI primitives via shadcn/ui |
| 3D engine | Three.js via @react-three/fiber |
| 3D utilities | @react-three/drei |
| State | Zustand |

- Additional runtime dependencies MUST come only from this list: `@react-spring/three`
  (animation), `howler` (audio playback), `nanoid` (ids) and `tone` (only for the procedural
  music fallback in requirement.md Section 8).
- A physics engine MUST NOT be used.
- A backend MUST NOT be used.

### II. Scene and Overlay Architecture

- In the playfield, a 3D canvas MUST fill the viewport.
- A single Zustand store MUST hold the game state described in requirement.md Section 9.
- A grid system MUST map the pointer position on the ground plane to the nearest integer tile
  coordinates, and placement MUST use those coordinates.
- All UI controls (menus, palette, buttons, dialogs, toasts) MUST be HTML overlay components
  styled with Tailwind, outside the WebGL canvas. The canvas MUST render only the 3D scene.

### III. Stylised Realistic Look and Tactile Feel

Visual style:

- The look MUST be stylised realistic: simplified toy shapes with materials that feel real. It
  MUST NOT be photorealistic or flat cartoon.
- Colours MUST be soft, warm and low-saturation, such as cream, honey wood, sage, dusty blue and
  terracotta. Pure black, pure white and neon MUST NOT be used.
- The interface MUST use rounded corners, generous spacing, one clear typeface and a consistent
  icon style.
- Overlay panels MUST be translucent or softly shadowed and MUST cover no more than 25% of the
  viewport in Build mode.
- Lighting MUST be one main directional light with soft shadows plus ambient fill. Pieces MUST
  cast contact shadows on the ground.

Tactile interaction: weight and physics MUST be conveyed through animation, not a physics
engine. Each moment MUST behave as follows:

| Moment | Required behaviour |
| --- | --- |
| Grab (from the palette or the board) | The piece lifts 0.3 tiles above the ground within 150 ms, and its shadow softens and spreads |
| Drag | The piece follows the snapped target tile with a damped spring (settling within 250 ms, no visible jitter) and tilts up to 8° toward its direction of movement |
| Valid drop | The piece lowers onto the tile with a small settle or bounce (under 300 ms in total), then rests; the place sound plays on contact |
| Invalid drop | The piece shakes briefly (about 200 ms), then returns to where it came from, or disappears if it came from the palette; the invalid sound plays |
| Rotate | The piece turns 90° with an ease-out over about 150 ms; the rotate sound plays |
| Delete | The piece shrinks or lifts away and fades over about 200 ms; the delete sound plays |
| Hover | The hovered piece rises 0.05 tiles and the cursor becomes a pointer |

All motion MUST use easing or springs. Nothing may teleport, except that undo and redo MAY apply
instantly.

Rationale: requirement.md Section 1 uses feel words such as "cozy" and "tactile", and Section 7
gives them these measurable definitions.

### IV. Performance on Weak Devices

- The app MUST hold at least 30 fps in both Build and Play modes with 100 placed pieces, at
  1920 × 1080, on an integrated GPU such as Intel Iris Xe.
- Device pixel ratio MUST be capped at 1.5.
- There MUST be at most one shadow-casting light, with a shadow map no larger than 2048 × 2048.
- Repeated meshes (for example many straight tracks) MUST be instanced or share geometry and
  materials.
- The app MUST be playable within 5 seconds of first load on a 25 Mbps connection.
- Total assets MUST stay under 20 MB.
- A "Low quality" toggle that turns off shadows and lowers render resolution SHOULD be provided.
  This is the only Should-priority item in this constitution: it is expected unless it would put
  a Must at risk.

### V. Non-Functional Baseline

- The app MUST run in the latest desktop versions of Chrome, Edge, Firefox and Safari.
- `npm install`, `npm run dev` and `npm run build` MUST all succeed from a clean clone, and
  `npm run build` MUST report no TypeScript errors.
- There MUST be no console errors during normal use.
- Overlay controls MUST show a visible keyboard focus state and MUST have accessible names.
- `README.md` MUST explain how to run the app, list the controls and note any known limitations.

## Source of Truth and Project Boundaries

- `requirement.md` at the project root is the single source of truth for Track. It MUST NOT be
  edited, moved or deleted.
- If `requirement.md` does not cover a decision, a reasonable choice MUST be made and recorded
  with the other planning documents.
- All work MUST stay inside this project folder.
- Nothing may be pushed to a git remote, and no git remote may be added or changed.

## Development Environment

- npm MUST be used as the package manager.
- The Node.js version MUST be the one in `.nvmrc`.
- These connected MCP servers MAY be used when they help: `context7` (up-to-date documentation
  for libraries and frameworks), `mobbin` (real-world UI and UX design references) and
  `chrome-devtools` (open the running app in Chrome, take screenshots, read the console and
  record performance traces).

## Governance

- This constitution restates constraints from `requirement.md` and rules from `CLAUDE.md` and
  adds none of its own. If it conflicts with `requirement.md`, `requirement.md` prevails and this
  constitution MUST be amended to match.
- Amendments MUST be made by editing this file through `/speckit-constitution`, and every
  amendment MUST update the version and the Last Amended date.
- Versions follow semantic versioning. MAJOR: a principle is removed or redefined in a backward
  incompatible way. MINOR: a principle or section is added, or guidance is materially expanded.
  PATCH: clarifications, wording and typo fixes.
- Every feature plan MUST pass its Constitution Check against this file. Any violation MUST be
  justified in the plan's Complexity Tracking section.

**Version**: 1.0.0 | **Ratified**: 2026-10-31 | **Last Amended**: 2026-10-31
