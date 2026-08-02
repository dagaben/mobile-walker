# World structure collision

Bridges and POIs produce the same presentation-neutral `StructureCollisionDefinition`. A record owns oriented solid boxes, circular posts, fence/railing segments, layered walkable surfaces and their overhead undersides, deterministic bounds, IDs, and an authoritative owner chunk. The active repository query merges both producers, bounds the chunk search around swept player movement, and deduplicates by structure ID. Future structures must use this record rather than add another movement solver.

POI dimensions live in `POI_DIMENSIONS`. POI rendering and `createPoiStructure` consume those shared values; collision never traverses Three.js objects or derives runtime mesh bounds. Bridge rendering likewise consumes the generated bridge collision component dimensions. Closed house/cabin masses and filled foundations are boxes. Cabin stilts, tower legs, fence posts, and dock posts remain separate circles, preserving visible gaps. Fence rails and bridge railings are segments.

Decks, approaches, raised floors, porches, docks, and platforms are finite **solid slabs**, not support planes. A single slab record supplies its oriented side volume, walkable top profile, and underside ceiling. Its underside is always the sampled visible top minus the visible thickness. Horizontal blocking is applied only when the player's vertical interval overlaps that finite interval, so a body wholly above or below is not blocked and an underpass remains usable when it has enough clearance. `solid` and `walkable` are independent explicit policies: generated rigid components are solid by default, while a visual-only component must deliberately opt out. `validateStructureDefinition` is a generation/test-time parity guard that rejects duplicate IDs, invalid geometry, and a walkable slab without solid volume; it is never run in the movement hot path.

Horizontal contacts reject only the inward normal component and apply `STRUCTURE_TANGENTIAL_RETENTION` (0.98) to the valid tangent before continuing bounded iterative resolution. Tree trunks retain their distinct 0.95 value, but share the deterministic swept-circle and penetration-correction utility with structure posts. Support selection uses feet height, vertical velocity, step tolerance, and prior surface identity; it does not choose the highest surface unconditionally. This keeps players beneath raised floors and docks while retaining stable support above them.

## Adding a collidable world object

1. Define the structural component in presentation-neutral data and centralize its dimensions and transform.
2. Mark it solid and/or walkable, or explicitly decorative/non-collidable; collidable does not imply walkable.
3. Render from that component and generate collision from the same component.
4. Assign deterministic component/structure IDs and include it in owner-chunk spatial bounds.
5. Register the general definition with active chunk data and reuse `queryStructureCollisions`, `resolveStructureMovement`, and `selectStructureSupport`; do not add a source-specific solver.
6. Add geometry-parity tests for position, orientation, dimensions, top, and underside.
7. Add traversal, side-collision, support, ceiling, gap, rotation, lifecycle, and deterministic-regeneration tests.

Tree trunks intentionally remain in the bounded vegetation query and retain 0.95 tangential movement. They share low-level swept-circle math with cylindrical rigid posts, whose unified structure response uses 0.98. Tree crowns remain explicitly non-collidable and do not create rigid records.
