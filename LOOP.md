# LOOP — Open World Creator Game MVP

## Status: 🟡 In Progress — Initial Build

---

## WHERE WE ARE
- **Phase**: 1 — Foundation
- **Last Updated**: 2026-03-07
- **What exists**: Empty project, directory structure created
- **Tech stack**: HTML5 Canvas, vanilla JavaScript (ES modules), Vite dev server
- **Playable**: No — not yet

## WHERE WE WANT TO GO

### Phase 1 — Foundation (Current)
- [x] Project structure
- [ ] Game loop (fixed timestep)
- [ ] Canvas renderer (2D top-down)
- [ ] Minimal physics (AABB collision, gravity optional, velocity/friction)
- [ ] Player entity with movement

### Phase 2 — Open World
- [ ] Tile-based world system
- [ ] Camera that follows player
- [ ] World boundaries
- [ ] Basic terrain types (ground, water, walls)
- [ ] World chunks / loading zones

### Phase 3 — Mission System
- [ ] Mission data schema (JSON-based)
- [ ] Mission trigger zones in world
- [ ] Mission objectives (go-to, collect, interact)
- [ ] Mission state machine (inactive → active → complete/failed)
- [ ] Creator API: define missions via JSON

### Phase 4 — Marketplace
- [ ] Creator dashboard UI
- [ ] Mission editor (form-based, outputs JSON)
- [ ] Mission browser / marketplace listing
- [ ] Install/load community missions into world
- [ ] Rating/review placeholder

### Phase 5 — Polish & Ship
- [ ] Save/load game state
- [ ] Sound effects placeholder
- [ ] UI/HUD (health, minimap, mission tracker)
- [ ] Performance pass
- [ ] Deploy (static host)

---

## ERRORS & BLOCKERS
| # | Date | Error/Issue | Status | Resolution |
|---|------|-------------|--------|------------|
| — | — | None yet | — | — |

---

## DECISIONS LOG
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | 2D top-down (not 3D) | Fastest to MVP, lower complexity |
| 2026-03-07 | Vanilla JS + Canvas | No engine dependency, full control, runs in browser |
| 2026-03-07 | Vite for dev/build | Fast HMR, ES module support |
| 2026-03-07 | JSON-based missions | Easy for creators, portable, marketplace-friendly |
| 2026-03-07 | Tile-based world | Simple collision, easy to extend, creator-friendly |

---

## HOW TO RUN
```bash
cd /Users/micha/Unified
npm install
npm run dev
# Open http://localhost:5173
```

---

## ARCHITECTURE
```
src/
  engine/       — Game loop, renderer, physics, input, camera
  game/         — Player, world, entities, tiles
  marketplace/  — Marketplace UI, mission browser
  missions/     — Mission system, schema, loader
assets/         — Sprites, sounds, data files
public/         — Static files
```
