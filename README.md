# Mobile Walker

A mobile-first 3D web game foundation built with TypeScript, Vite, Three.js, and
Miniplex. It includes a small playable walking scene that demonstrates a
frame-rate-independent ECS simulation and interpolated Three.js presentation.

Play the published game at <https://durrri.github.io/mobile-walker/>.

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
- `npm test` runs the Vitest unit test suite once.
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
- `src/world/` owns pure seeded chunk generation and the presentation-only
  chunk streamer/mesh factory.
- `src/game/` composes the demo entities and presentation systems.

Simulation runs at a fixed 60 Hz. Browser events update raw input asynchronously;
the first fixed system captures and normalizes one snapshot, preventing render
refresh rate from changing movement speed. Systems are registered in this order:

1. **Fixed:** input snapshot.
2. **Fixed:** player movement (also saves the previous transform).
3. **Render:** stream the player's local chunk neighborhood.
4. **Render:** transform history interpolation.
5. **Render:** third-person camera presentation, using the interpolated target.

Simulation transforms, velocity, controls, bounds, and camera settings are plain
data. Three.js objects are attached only as a presentation bridge and are never
read by movement or collision systems. Pure `normalizeInput`, `integrateMovement`,
and `interpolateTransform` functions provide unit-testable math boundaries.

## Deterministic world generation

`generateChunk(seed, coordinate)` is a pure data boundary: the normalized seed
and integer `(x, z)` coordinate completely determine its plain-object result.
Random-looking values are addressed by global integer lattice keys, rather than
drawn from mutable state, so generation order, entity iteration order, the clock,
and `Math.random()` cannot influence a chunk. Mathematical floor division keeps
world-to-chunk conversion correct on the negative side of the origin.

A single river flows west-to-east exclusively through chunk row `z === 0`, which
contains the initial chunk `(0, 0)`. Each endpoint is hashed from its global
boundary column, so a row-zero chunk's east endpoint and its eastern neighbor's
west endpoint are the exact same position, width, and elevation. The shared
river spine drives water rendering, terrain carving, collision sampling, and
forest clearance; chunks in other rows have uninterrupted terrain and
vegetation, with no river or river-debug geometry. Terrain edge heights use
global lattice coordinates in every row. The streamer keeps a 3-by-3
neighborhood around the player, generates plain chunk data first, and passes it
to a Three.js mesh factory. Chunk geometries are disposed when they leave the
radius, while terrain and river materials are shared for the streamer's
lifetime.

## Controls

- **Desktop:** move with <kbd>WASD</kbd> or the arrow keys and jump with
  <kbd>Space</kbd>.
- **Touch / pointer:** press anywhere on the scene and drag in the direction you
  want to walk. Release to stop. Drag distance controls the input strength until
  it reaches full speed. Tap, lift, then press again to jump; keep the second
  press held and drag to move while jumping.
- **Camera gestures:** pinch with two fingers to zoom, and drag two fingers
  vertically to tilt between the standard view and a directly overhead view.
