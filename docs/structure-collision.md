# World structure collision

Bridges and POIs produce the same presentation-neutral `StructureCollisionDefinition`. A record owns oriented solid boxes, circular posts, fence/railing segments, layered walkable surfaces and their overhead undersides, deterministic bounds, IDs, and an authoritative owner chunk. The active repository query merges both producers, bounds the chunk search around swept player movement, and deduplicates by structure ID. Future structures must use this record rather than add another movement solver.

POI dimensions live in `POI_DIMENSIONS`. POI rendering and `createPoiStructure` consume those shared values; collision never traverses Three.js objects or derives runtime mesh bounds. Closed house/cabin masses and filled foundations are boxes. Cabin stilts, tower legs, fence posts, and dock posts remain separate circles, preserving visible gaps. Fence rails and bridge railings are segments. Reachable porches and docks are thin layered surfaces with an underside, while inaccessible watchtower tops are not support surfaces.

Horizontal contacts reject only the inward normal component and apply `STRUCTURE_TANGENTIAL_RETENTION` (0.98) to the valid tangent before continuing bounded iterative resolution. Tree trunks retain their distinct 0.95 value, but share the deterministic swept-circle and penetration-correction utility with structure posts. Support selection uses feet height, vertical velocity, step tolerance, and prior surface identity; it does not choose the highest surface unconditionally. This keeps players beneath raised floors and docks while retaining stable support above them.

## Adding a collidable world object

1. Define its visible structural components as plain generated data and centralize their dimensions.
2. Build rendering and collision records from those shared dimensions and transforms.
3. Assign deterministic component/structure IDs, owner chunk, and query bounds.
4. Mark only intended reachable surfaces as walkable and mark applicable undersides as overhead surfaces.
5. Register the general definition with active chunk data and reuse `queryStructureCollisions`, `resolveStructureMovement`, and `selectStructureSupport`.
6. Test exact component geometry, gaps, rotation, traversal, support/ceiling context, lifecycle, and deterministic regeneration.
