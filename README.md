# Mobile Walker

A mobile-first 3D web game foundation built with TypeScript, Vite, Three.js, and
Miniplex. It includes a small playable walking scene that demonstrates a
frame-rate-independent ECS simulation and interpolated Three.js presentation.

## Getting started

```bash
npm ci
npm run dev
```

Use `npm install` when intentionally adding or updating dependencies, and
commit the resulting `package-lock.json` changes.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks the project and creates a production build.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run preview` serves the production build locally.

## CI

Every pull request runs `npm ci`, `npm run typecheck`, and `npm run build`
through GitHub Actions.

## Architecture

- `src/core/` owns application lifecycle and the fixed-timestep game loop.
- `src/ecs/` owns entity types, the Miniplex world, and ordered systems.
- `src/rendering/` owns Three.js scene setup and viewport management.
- `src/player/` collects browser input and owns testable movement math and
  player simulation systems.
- `src/game/` composes the demo entities and presentation systems.

Simulation runs at a fixed 60 Hz. Browser events update raw input asynchronously;
the first fixed system captures and normalizes one snapshot, preventing render
refresh rate from changing movement speed. Systems are registered in this order:

1. **Fixed:** input snapshot.
2. **Fixed:** player movement (also saves the previous transform).
3. **Fixed:** ground-bounds collision.
4. **Render:** transform history interpolation.
5. **Render:** third-person camera presentation, using the interpolated target.

Simulation transforms, velocity, controls, bounds, and camera settings are plain
data. Three.js objects are attached only as a presentation bridge and are never
read by movement or collision systems. Pure `normalizeInput`, `integrateMovement`,
and `interpolateTransform` functions provide unit-testable math boundaries.

## Controls

- **Desktop:** move with <kbd>WASD</kbd> or the arrow keys.
- **Touch / pointer:** press anywhere on the scene and drag in the direction you
  want to walk. Release to stop. Drag distance controls the input strength until
  it reaches full speed.
