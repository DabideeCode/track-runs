# Implementation Plan: Track, a Wooden Train Diorama Builder

**Branch**: `run/speckit-r2` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-track-diorama-builder/spec.md`

## Summary

Track is a single-page app for building a 3D wooden train diorama on a 16 × 16 grid and playing with a
train on it. It uses the `requirement.md` Section 3 stack: TypeScript, React with Vite, Tailwind with
Radix through shadcn/ui, Three.js through React Three Fiber and drei, and one Zustand store.

The core approach is a pure domain layer for rules, connections, routes and the train, with no React or
Three.js in it. Store commands wrap that layer and are the only way to change the diorama, so the UI and
the test hook cannot drift apart. Pieces render in instanced batches, and leave a batch only while
animating.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js from `.nvmrc` (v22.17.0)

**Primary Dependencies**: React 19.3, Vite 8, Tailwind CSS 4, shadcn/ui source on Radix primitives,
Three.js 0.187, @react-three/fiber 9, @react-three/drei 10, Zustand 5, @react-spring/three 10, howler 2,
nanoid 6, tone 15 (lazy fallback only). Versions and reasons are in `research.md` R1.

**Storage**: Browser localStorage only, under the keys in `contracts/storage.md`

**Testing**: Vitest for domain logic, Playwright for contract and flows in Chromium, Firefox and WebKit,
`chrome-devtools` for performance traces and visual checks

**Target Platform**: Latest desktop Chrome, Edge, Firefox and Safari

**Project Type**: Client-only single-page web app

**Performance Goals**: At least 30 fps with 100 pieces at 1920 × 1080 on an integrated GPU; playable
within 5 seconds at 25 Mbps; each sound within 100 ms

**Constraints**: Device pixel ratio up to 1.5; one shadow light; shadow map up to 2048; assets under
20 MB; overlay up to 25% of the viewport; runtime dependencies from the Section 3 allowlist only

**Scale/Scope**: 12 item types, 2 settings, 16 × 16 grid, around 100 pieces per diorama, one user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Result before research | Result after design |
| --- | --- | --- |
| I. Stack and allowlist; no physics engine; no backend | Pass, with one risk: shadcn's usual packages | Pass: R2 removes the packages, and a unit test enforces the allowlist |
| II. Canvas fills viewport; single store; pointer maps to tile; UI outside canvas | Pass | Pass: R5, `data-model.md`. Train runtime is outside the store but is not Section 9 state (R10) |
| III. Look and tactile feel | Pass | Pass: R6 to R9, with `contracts/ui-and-input.md` covering palette and overlay limits |
| IV. Performance limits | Pass, with one risk: 20 MB against 5 seconds | Pass: R11 sets a 4 MB startup budget, and R6 and R7 keep draw calls bounded |
| V. Non-functional baseline | Pass | Pass, with verification limits noted in R16 |
| Source of truth and boundaries | Pass | Pass: decisions recorded in `spec.md` and `research.md`; Playwright browsers install inside the project |
| Environment: npm, `.nvmrc`, MCP tools | Pass | Pass |

No gate fails, and no violation needs justifying.

## Project Structure

### Documentation (this feature)

```text
specs/001-track-diorama-builder/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── test-hook.md
│   ├── ui-and-input.md
│   └── storage.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
index.html
components.json
vite.config.ts
playwright.config.ts
public/assets/
├── models/              # Empty: models are the Section 8 fallback (R13)
├── textures/
└── audio/{sfx,music}/
src/
├── main.tsx, App.tsx, index.css
├── domain/              # Pure logic, no React or Three.js
│   ├── catalogue.ts, types.ts, grid.ts
│   ├── connectors.ts, rules.ts, autoAdjust.ts
│   ├── route.ts, trackPaths.ts, trainSim.ts
│   └── naming.ts
├── store/               # The single Zustand store and its commands
├── persistence/         # Save file and audio settings, validators
├── train/               # Train runtime, stepped by the scene
├── audio/               # Engine, sound log, synthesised and fallback audio
├── interaction/         # Pointer controller, picking, keyboard
├── scene/               # Lazy-loaded 3D
│   ├── PlayfieldCanvas.tsx, CameraRig.tsx, Lighting.tsx
│   ├── Grid.tsx, Settings/, PieceBatches.tsx, ActivePiece.tsx
│   ├── Ghost.tsx, OpenEndMarkers.tsx, ContactShadowQuads.tsx, Train.tsx
│   └── geometry/        # Item parts and shared materials
├── components/
│   ├── ui/              # shadcn source, adapted (R2)
│   └── icons.tsx
├── features/
│   ├── menu/            # Main menu, entries, empty state
│   ├── overlay/         # Palette, toolbars, audio controls
│   └── dialogs/
├── testing/testHook.ts
└── lib/utils.ts
tests/
├── unit/
└── e2e/
CREDITS.md
README.md
```

**Structure Decision**: One client-only project at the repository root. Dependencies point one way:
`domain` depends on nothing, `store` uses `domain`, `persistence` and `audio`, and `scene`, `features` and
`testing` use `store`. Only `scene` and `interaction` import Three.js, which keeps it out of the entry
chunk.

## Key Design Rules

1. **One path for every change.** Store commands validate, apply, record undo history, mark the diorama
   unsaved and emit sounds. UI handlers and the hook only call commands.
2. **No per-frame React state.** Train and animation positions are mutated in `useFrame`.
3. **Synchronous hook results.** Commands finish before returning, including starting the train.
4. **Keep Three.js out of the menu.** The playfield is a lazy chunk, prefetched after the menu paints.

## Risks

| Risk | Mitigation |
| --- | --- |
| Fall-back wooden models look flat or generic | Shared wood textures from ambientCG, bevelled geometry and a visual review against SC-013 |
| Software rendering in automated browsers is slow | Time-step clamp keeps speeds accurate down to 4 fps (R10) |
| `react` update breaks the renderer | Held to `~19.3.1` (R1) |
| Bundle pulls heavy drei dependencies | Named imports only, and a bundle check in the quickstart |
| No Iris Xe or Mac available to test on | Report the hardware actually used, and note gaps in `README.md` (R16) |

## Complexity Tracking

No constitution violations to justify.
