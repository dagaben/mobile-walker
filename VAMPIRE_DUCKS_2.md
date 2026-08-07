# Vampire Ducks 2.0

**Environment foundation:** [durrri/mobile-walker](https://github.com/durrri/mobile-walker)  
**Original demo:** https://durrri.github.io/mobile-walker/  
**This fork:** https://github.com/dagaben/mobile-walker  
**Classic v1:** https://dagaben.github.io/vampireducks/

Used with permission from the Mobile Walker author.

## Implemented

- [x] Fork mobile-walker as engine base
- [x] Solid **garlic** collectibles (4/chunk, ~10% super garlic worth 10)
- [x] **Day/night cycle** (~75s day / ~50s night) with sky, fog, and sun blend
- [x] **Vampire rubber ducks** spawn at night, chase player, clear at dawn
- [x] **Flying vampire ducks**: cape, fangs, flapping wings, hover/bob animation
- [x] Petrify costs garlic (scales with difficulty); otherwise lose a life (5 lives, invuln blink)
- [x] HUD: garlic (top-right), lives + day/night + score (top-left)
- [x] Pause button + mute button + procedural day/night audio
- [x] **Landscape orientation**: lock on PLAY (Screen Orientation API), CSS adaptations for HUD/toolbar/start screen, resize on orientationchange
- [x] Deploy workflow (GitHub Actions → Pages)

## Still optional polish

- [ ] CatDog player mesh refinements (currently present)
- [ ] Arcade leaderboard from v1 (already wired)
- [ ] Title / start screen poster from v1 (present)
- [ ] Full upstream CSS for every debug control (core UI works)

## Play

1. Enable **Settings → Pages → Source: GitHub Actions** on this repo (one-time).
2. After the deploy workflow finishes: **https://dagaben.github.io/mobile-walker/**

Local:

```bash
npm ci
npm run dev
```

## How it plays

- **Day:** walk the biomes, collect garlic (golden = super / +10).
- **Night:** sky darkens; flying rubber vampire ducks (cape, fangs, flapping wings) spawn and chase you with hover bob.
- Touch a duck with enough garlic → petrify (duck turns blue, disappears).
- Touch a duck without enough garlic → lose a life (brief invulnerability).
- On mobile, tapping PLAY requests landscape lock; HUD and start screen adapt to landscape.

## Attribution

World engine: **durrri / Mobile Walker**  
Vampire Ducks gameplay: **dagaben**
