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
- [x] Petrify costs **10 garlic**; otherwise lose a life (5 lives, invuln blink)
- [x] HUD: garlic (top-right), lives + day/night (top-left)
- [x] Deploy workflow (GitHub Actions → Pages)

## Still optional polish

- [ ] CatDog player mesh (currently pink walker capsule)
- [ ] Arcade leaderboard from v1
- [ ] Title / start screen poster from v1
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
- **Night:** sky darkens; rubber vampire ducks spawn and chase you.
- Touch a duck with **≥10 garlic** → petrify (duck turns blue, disappears).
- Touch a duck with **&lt;10 garlic** → lose a life (brief invulnerability).

## Attribution

World engine: **durrri / Mobile Walker**  
Vampire Ducks gameplay: **dagaben**
