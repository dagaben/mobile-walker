# Vampire Ducks 2.0

**Environment foundation:** [durrri/mobile-walker](https://github.com/durrri/mobile-walker)  
**Original playable demo:** https://durrri.github.io/mobile-walker/  
**Classic Vampire Ducks (v1):** https://dagaben.github.io/vampireducks/

This repository is a fork of **Mobile Walker** by durrri, used with explicit permission as the new landscape/engine for Vampire Ducks 2.0.

## Why a new foundation?

Vampire Ducks v1 gameplay (garlic, rubber vampire ducks, day/night, lives, leaderboard) is fun for kids, but the procedural forest was limited. Mobile Walker provides:

- Multi-biome world (plains, forest, wetland, lake, highlands, mountain)
- Proper rivers, bridges, wetlands, and POIs
- Seeded chunk generation (including a web worker)
- Clean ECS architecture (Miniplex) + fixed timestep
- Mobile-first controls and presentation

## Design goals for 2.0

Keep the **gameplay** from Vampire Ducks v1:

| Feature | Plan |
|--------|------|
| Collect garlic by day | Replace mushrooms / waypoints with garlic |
| Super garlic | Occasional high-value pickups |
| Night = vampire rubber ducks | Spawn ducks only at night; aggression scales |
| Garlic ≥ 10 petrifies a duck | Same threshold |
| 5 lives + invulnerability | Port lives HUD + invuln blink |
| Day / night cycle | Drive sunlight + duck spawns from cycle |
| Top-10 arcade leaderboard | localStorage initials board |
| CatDog character | Reskin player mesh (chibi CatDog) |
| Pinch zoom / joystick | Already strong mobile controls in base |

Keep / improve from Mobile Walker:

- All biome/terrain/river/bridge/forest generation
- Chunk streaming and collision
- Camera options and performance tools (debug can stay behind a menu)

## Architecture notes

| Area | Location |
|------|----------|
| Chunk generation | `src/world/` |
| Collectibles | `src/world/collectibles.ts` + exploration systems |
| Player movement | `src/player/` |
| Presentation / camera | `src/game/presentationSystems.ts`, `src/rendering/` |
| ECS loop | `src/core/`, `src/ecs/` |

Vampire Ducks systems should live as additional Miniplex systems (e.g. `DayNightSystem`, `DuckSpawnSystem`, `DuckAISystem`, `GarlicSystem`, `LivesSystem`) rather than rewriting the world.

## Attribution

World engine and environment: **durrri / Mobile Walker**  
Game concept & Vampire Ducks gameplay: **dagaben / Vampire Ducks**

## Status

- [x] Fork mobile-walker as engine base
- [x] Rebrand package to vampireducks-v2
- [ ] Garlic collectibles (visual + scoring)
- [ ] Day/night cycle + lighting
- [ ] Vampire duck entities + night spawn
- [ ] Petrify / lives / invuln
- [ ] CatDog player mesh
- [ ] Title screen + leaderboard from v1
- [ ] GitHub Pages deploy as Vampire Ducks 2.0

## Local development

```bash
npm ci
npm run dev
```

## Play

- Mobile Walker original: https://durrri.github.io/mobile-walker/
- This fork (after Pages is enabled): https://dagaben.github.io/mobile-walker/
