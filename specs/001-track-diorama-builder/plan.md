# Implementation Plan: Track, a Wooden Train Diorama Builder

**Branch**: `run/speckit-r1` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-track-diorama-builder/spec.md`

## Summary

Track is a client-only single-page app where users build a 3D wooden train diorama on a 16 × 16 grid, then drive a train around it. All behaviour is defined by `requirement.md` v1.1 and the decisions in the spec.

The technical approach follows `requirement.md` Section 3. A pure TypeScript domain layer holds the rules, connections, routing and train simulation. A single Zustand store exposes one set of actions, used by both the UI and the test hook, so validation and sounds cannot drift apart. React Three Fiber renders the scene, with instanced procedural models. HTML overlay components sit above the canvas. Persistence uses localStorage, and there is no backend.

## Technical Context

**Language/Version**: TypeScript 7.0.2 on Node.js v22.17.0 (`.nvmrc`), npm 10.9.2

**Primary Dependencies**: React 19.3.1, Vite 8.3.5, Tailwind CSS 4.3.3, `radix-ui` 1.8.1 (with shadcn/ui components copied into the repo), `three` 0.186.1, `@react-three/fiber` 9.8.2, `@react-three/drei` 10.7.9, Zustand 5.0.16, plus the allowed `@react-spring/three` 10.1.2, `howler` 2.2.4, `nanoid` 6.0.2 and `tone` 15.1.22. See [research.md](./research.md) R1 and R2.

**Storage**: Browser localStorage, keys `wooden-diorama:v1` and `wooden-diorama:audio`

**Testing**: Vitest 5 for the pure domain layer, Playwright 1.64 for the contract and end-to-end tests. Both are dev dependencies. See R14.

**Target Platform**: Latest desktop Chrome, Edge, Firefox and Safari, at 1280 × 720 and above

**Project Type**: Client-only single-page web application

**Performance Goals**: At least 30 fps with 100 pieces at 1920 × 1080 on Intel Iris Xe, in Build and Play. Playable within 5 s on 25 Mbps. Sounds start within 100 ms.

**Constraints**: Pixel ratio at most 1.5, one shadow-casting light with a shadow map of at most 2048², total assets under 20 MB, overlay panels at most 25% of the viewport in Build mode, no console errors, no physics engine, no backend

**Scale/Scope**: 2 screens, 12 catalogue items, 2 settings, 1 train, and 256 tiles, so at most 256 pieces

### Performance budget

| Item | Budget | How it is met |
| --- | --- | --- |
| Draw calls with 100 pieces | Under 60 per pass | One instanced mesh per item type and material pair (R5) |
| Shadow map | 1024² | Fitted to the 16 × 16 board; the limit allows up to 2048² (R6) |
| Initial JavaScript, compressed | Under 700 KB | Canvas code is lazy-loaded and `tone` loads only if the fallback runs (R11) |
| Blocking assets before play | Under 3 MB | Music streams and does not block play (R10) |
| Total assets | Under 20 MB | Checked by a script in the build check (R12) |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The table shows the result both before research and after design. Both passed, so there are no unresolved violations.

| Principle | Gate | Pre-research | Post-design |
| --- | --- | --- | --- |
| I. Mandated Technology Stack | Language, build, styling, 3D, utilities and state are as listed | Pass | Pass |
| I. Mandated Technology Stack | Runtime dependencies come only from the stack and the allowed list | **At risk**: shadcn needs extra packages | Pass: extras removed (R2) |
| I. Mandated Technology Stack | No physics engine, no backend | Pass | Pass |
| II. Architecture Boundaries | Canvas fills the viewport, and the canvas holds only the scene | Pass | Pass |
| II. Architecture Boundaries | Single store holds the Section 9 game state | Pass | Pass: per-frame pose is not game state (R4) |
| II. Architecture Boundaries | Pointer maps to integer tiles on the ground plane, and placement uses them | Pass | Pass (R7) |
| II. Architecture Boundaries | All UI controls are HTML overlays outside the canvas | Pass | Pass |
| III. Visual Style and Tactile Interaction | Style, palette, overlay limit, lighting, contact shadows | Pass | Pass (R5, R6, R13) |
| III. Visual Style and Tactile Interaction | All Section 7.2 moments, eased motion, no teleporting | Pass | Pass (R8) |
| IV. Performance on Weak Devices | Frame rate, pixel ratio, shadows, shared meshes, load time, asset total | Pass | Pass by design, measured in [quickstart.md](./quickstart.md) |
| V. Non-Functional Baseline | Four browsers | Pass | Pass with a recorded limit: real Safari needs a Mac (R14) |
| V. Non-Functional Baseline | Clean-clone install, dev, build and no type errors | Pass | Pass (R1) |
| V. Non-Functional Baseline | No console errors | Pass | Pass (R15) |
| V. Non-Functional Baseline | Keyboard focus, accessible names, README | Pass | Pass |
| Source of Truth | `requirement.md` unchanged, decisions recorded | Pass | Pass: spec D-01 to D-25 and research R1 to R15 |
| Project Working Rules | npm, `.nvmrc`, project folder only, no remote changes | Pass | Pass: test browsers install inside the project (R14) |

## Project Structure

### Documentation (this feature)

```text
specs/001-track-diorama-builder/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Entities, rules and state transitions
├── quickstart.md        # Run and validation guide
├── contracts/
│   ├── test-hook.md     # Hook behaviour that Section 10 leaves open
│   └── ui-controls.md   # Controls, availability and keyboard map
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
index.html
package.json
vite.config.ts
tsconfig.json
playwright.config.ts
components.json              # shadcn settings, with no CLI dependency installed
CREDITS.md
README.md
scripts/
└── check-assets.mjs         # Asset budget and CREDITS.md coverage check
public/
├── favicon.svg
└── assets/
    ├── models/              # Used only if a .glb is sourced (R9)
    ├── textures/
    └── audio/
        ├── sfx/
        └── music/
src/
├── main.tsx
├── App.tsx                  # Screen switch: menu or playfield
├── index.css                # Tailwind entry and palette tokens
├── domain/                  # Pure TypeScript: no React, Three or browser APIs
│   ├── types.ts             # Section 9 types
│   ├── catalog.ts           # The 12 items: kind, footprint, connectors, pick height
│   ├── grid.ts              # Tile and world conversion
│   ├── rules.ts             # Placement validation and reason priority
│   ├── connections.ts       # Connections and open ends
│   ├── autoAdjust.ts        # AC-7.3
│   ├── route.ts             # Centreline path from the station
│   ├── trainSim.ts          # Auto and Manual driving as a stepped function
│   └── names.ts             # Default names and rename validation
├── store/
│   ├── gameStore.ts         # The single store: Section 9 state, UI state, actions
│   └── history.ts           # Undo and redo stacks
├── persistence/
│   ├── saveFile.ts          # Read, validate, write, keep skipped entries
│   └── audioSettings.ts
├── audio/
│   ├── audioEngine.ts       # play(event), sound log, unlock, volumes
│   ├── synth.ts             # Web Audio fallback for sound effects
│   └── musicFallback.ts     # Lazy tone fallback
├── interaction/
│   ├── pointerRay.ts        # Pointer to ground point, tile and picked piece
│   ├── dragController.ts    # Palette and board drag state machine
│   └── keyboard.ts          # Global shortcuts
├── scene/                   # Lazy-loaded, renders only the 3D scene
│   ├── PlayfieldCanvas.tsx
│   ├── CameraRig.tsx
│   ├── Lighting.tsx
│   ├── Ground.tsx           # Surfaces and edge props for both settings
│   ├── GridOverlay.tsx
│   ├── TileHighlight.tsx
│   ├── PieceField.tsx       # Instanced providers by item type and material
│   ├── PieceNode.tsx        # One piece's spring-driven group
│   ├── pieceGeometry.ts     # Procedural geometry per item
│   ├── materials.ts         # Shared wood, paint and plastic materials
│   ├── woodTexture.ts       # Procedural grain fallback
│   ├── ContactShadows.tsx   # Instanced soft shadow blobs
│   ├── DragGhost.tsx
│   ├── SelectionOutline.tsx
│   ├── ExitEffects.tsx      # Delete and failed-drop animation
│   ├── OpenEndMarkers.tsx
│   └── TrainView.tsx
├── ui/
│   ├── MainMenu.tsx
│   ├── DioramaEntry.tsx
│   ├── Playfield.tsx        # data-testid="playfield", canvas plus overlays
│   ├── Palette.tsx
│   ├── TopBar.tsx
│   ├── AudioPanel.tsx
│   ├── UnsavedDialog.tsx
│   ├── ConfirmDialog.tsx
│   ├── Toaster.tsx
│   ├── icons.tsx            # Hand-drawn inline SVG icon set
│   └── components/          # shadcn/ui components adapted to the allowed list
└── testing/
    └── testHook.ts          # window.__DIORAMA__
tests/
├── unit/                    # Vitest, domain and persistence
└── e2e/                     # Playwright, test contract and journeys
```

**Structure Decision**: One client-only project at the repository root. `src/domain/` has no framework imports, so the rules and train behaviour can be tested directly. `src/scene/` is the only folder that touches the 3D renderer, and `src/ui/` is the only one that renders overlay HTML, which keeps Architecture Boundaries easy to check.

## Key Design Decisions

Full reasoning is in [research.md](./research.md).

1. **One action path (R3)**: UI handlers and the test hook call the same store actions, which validate through `domain/rules.ts`, commit, then fire sounds through `audioEngine`.
2. **Instanced pieces inside animated groups (R5)**: Each piece is a spring-driven group whose parts are instances, so a piece animates as a unit while draw calls stay low.
3. **Maths-based picking (R7)**: Pointer rays are intersected with the ground plane and with simple per-piece boxes. Palette drags start in HTML, and tall pieces can still be clicked on what the user sees.
4. **Stepped train simulation (R4)**: The train is a pure step function over distance along a route. It runs on a fixed time step, independent of render rate, so low frame rates do not change its speed.
5. **Procedural models, sourced textures and sounds where possible (R9, R10)**: Exact catalogue dimensions favour building models in code. The Section 8 fallback is recorded in `CREDITS.md`.

## Complexity Tracking

No constitution violations need justifying.
