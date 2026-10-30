<!--
Sync Impact Report
- Version change: unversioned template → 1.0.0
- Modified principles: none (initial adoption). Added:
  - I. Mandated Technology Stack
  - II. Architecture Boundaries
  - III. Visual Style and Tactile Interaction
  - IV. Performance on Weak Devices
  - V. Non-Functional Baseline
- Added sections: Source of Truth, Project Working Rules, Governance
- Removed sections: none
- Sources: requirement.md v1.1 Sections 3, 7 and 11; CLAUDE.md. No other principles added.
- Dependent templates: not modified by this command. plan-template.md derives its
  Constitution Check gates from this file at runtime.
- Follow-up TODOs: none. No placeholders deferred.
-->
# Track Constitution

## Core Principles

### I. Mandated Technology Stack

- Language MUST be TypeScript.
- Build MUST be React with Vite.
- Styling MUST be Tailwind CSS, with Radix UI primitives via shadcn/ui.
- The 3D engine MUST be Three.js via @react-three/fiber, with @react-three/drei for 3D utilities.
- State MUST be Zustand.
- Additional runtime dependencies MUST come only from this list: `@react-spring/three`
  (animation), `howler` (audio playback), `nanoid` (ids) and `tone` (only for the procedural
  music fallback in requirement.md Section 8).
- The app MUST NOT use a physics engine or a backend.

**Source**: requirement.md Section 3.

### II. Architecture Boundaries

- In the playfield, a 3D canvas MUST fill the viewport.
- A single Zustand store MUST hold the game state described in requirement.md Section 9.
- A grid system MUST map the pointer position on the ground plane to the nearest integer tile
  coordinates, and placement MUST use those coordinates.
- All UI controls (menus, palette, buttons, dialogs, toasts) MUST be HTML overlay components
  styled with Tailwind, outside the WebGL canvas. The canvas MUST render only the 3D scene.

**Source**: requirement.md Section 3.

### III. Visual Style and Tactile Interaction

Visual style:

- The look MUST be stylised realistic: simplified toy shapes with materials that feel real. It
  MUST NOT be photorealistic or flat cartoon.
- The palette MUST use soft, warm, low-saturation colours such as cream, honey wood, sage, dusty
  blue and terracotta. Pure black, pure white and neon MUST NOT be used.
- The interface MUST use rounded corners, generous spacing, one clear typeface and a consistent
  icon style.
- Overlay panels MUST be translucent or softly shadowed and MUST cover no more than 25% of the
  viewport in Build mode.
- Lighting MUST be one main directional light with soft shadows plus ambient fill. Pieces MUST
  cast contact shadows on the ground.

Tactile interaction. Weight and physics MUST be conveyed through animation, not a physics engine.
Each moment MUST behave as follows:

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

**Source**: requirement.md Sections 7.1 and 7.2.

### IV. Performance on Weak Devices

- The app MUST hold at least 30 fps in both Build and Play modes with 100 placed pieces, at
  1920 × 1080, on an integrated GPU such as Intel Iris Xe.
- Device pixel ratio MUST be capped at 1.5.
- The scene MUST have at most one shadow-casting light, with a shadow map no larger than
  2048 × 2048.
- Repeated meshes (for example many straight tracks) MUST be instanced or share geometry and
  materials.
- The app MUST be playable within 5 seconds of first load on a 25 Mbps connection.
- Total assets MUST stay under 20 MB.
- A "Low quality" toggle SHOULD turn off shadows and lower render resolution. SHOULD means
  expected, unless it would put a Must at risk.

**Source**: requirement.md Section 7.3 and, for the meaning of SHOULD, Section 2.

### V. Non-Functional Baseline

- The app MUST run in the latest desktop versions of Chrome, Edge, Firefox and Safari.
- `npm install`, `npm run dev` and `npm run build` MUST all succeed from a clean clone.
- `npm run build` MUST report no TypeScript errors.
- Normal use MUST produce no console errors.
- Overlay controls MUST show a visible keyboard focus state and MUST have accessible names.
- `README.md` MUST explain how to run the app, list the controls and note any known limitations.

**Source**: requirement.md Section 11.

## Source of Truth

- `requirement.md` at the project root is the single source of truth for what Track is. It MUST
  NOT be edited, moved or deleted.
- If `requirement.md` does not cover a decision, a reasonable choice MUST be made and recorded
  with the other planning documents.

**Source**: CLAUDE.md.

## Project Working Rules

- The project MUST use npm and the Node.js version in `.nvmrc`.
- All work MUST stay inside this project folder.
- No git remote may be pushed to, added or changed.
- The connected MCP servers `context7`, `mobbin` and `chrome-devtools` MAY be used when they help.

**Source**: CLAUDE.md.

## Governance

- **Precedence**: This constitution restates `requirement.md` and CLAUDE.md and does not override
  them. If it conflicts with `requirement.md`, `requirement.md` prevails and this constitution
  MUST be amended to match.
- **Amendments**: An amendment MUST state what changed and why, MUST update the version line below
  and MUST stay within the sources named above.
- **Versioning**: Versions follow semantic versioning. MAJOR is a backward incompatible removal or
  redefinition of a principle or governance rule. MINOR is a new principle or section, or
  materially expanded guidance. PATCH is a clarification, wording or typo fix with no semantic
  change.
- **Compliance review**: Every implementation plan MUST pass the Constitution Check against this
  document before design work begins and again after it. A MUST violation MUST be resolved by
  changing the plan or the implementation.

**Version**: 1.0.0 | **Ratified**: 2026-10-30 | **Last Amended**: 2026-10-30
