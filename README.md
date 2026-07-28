# Mobile Walker

A mobile-first 3D web game foundation built with TypeScript, Vite, Three.js, and
Miniplex. The current project intentionally contains only the rendering and ECS
infrastructure—gameplay, procedural generation, and physics come later.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks the project and creates a production build.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run preview` serves the production build locally.

## Architecture

- `src/core/` owns application lifecycle and the fixed-timestep game loop.
- `src/ecs/` owns entity types, the Miniplex world, and ordered systems.
- `src/rendering/` owns Three.js scene setup and viewport management.
- `src/game/`, `src/player/`, and `src/world/` are boundaries reserved for
  future features; they do not contain gameplay yet.

Simulation runs at a fixed 60 Hz. Rendering remains synchronized with the
browser's refresh rate and receives an interpolation factor for future visual
smoothing.
