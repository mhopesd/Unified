# LOOP — Unified City (GTA-Style Open World)

## Status: 🟢 Playable — GTA-Style MVP Complete

---

## WHERE WE ARE
- **Phase**: All phases complete — GTA-style city with vehicles, NPCs, missions, marketplace
- **Last Updated**: 2026-03-07
- **What exists**: Full GTA-style open world with driveable cars, pedestrian NPCs, wanted system, day/night cycle, mission system, creator marketplace
- **Tech stack**: HTML5 Canvas, vanilla JavaScript (ES modules), Vite dev server
- **Playable**: YES — `npm run dev` → http://localhost:5173

## FEATURES

### Core Engine
- [x] Fixed timestep game loop (60Hz)
- [x] Canvas 2D renderer with 3/4 perspective depth
- [x] AABB collision detection and resolution
- [x] Smooth-follow camera with world clamping
- [x] Keyboard input system (keydown/up/justPressed)

### City World
- [x] Grid-based city layout (100x80 tiles, 8 tile types)
- [x] Roads with lane markings
- [x] Sidewalks with tile patterns
- [x] Buildings with 3D height, shadows, and lit windows
- [x] Parks with trees and flowers
- [x] Parking lots
- [x] River/waterfront with animated water
- [x] Streetlights with night glow
- [x] Village square spawn area

### Vehicles (GTA-style)
- [x] 5 car types: Sedan, Sports, Truck, Taxi, SUV
- [x] Enter/exit vehicles (F key)
- [x] Steering + acceleration physics
- [x] Braking (Space)
- [x] Speed display (MPH)
- [x] 25 parked cars spawned on roads
- [x] Collision with buildings

### NPCs
- [x] 40 pedestrians walking around sidewalks/parks
- [x] Varied colors and skin tones
- [x] Direction-changing AI with idle pauses
- [x] Flee from fast vehicles
- [x] Wanted level increases when hitting NPCs

### GTA-Style HUD
- [x] Health bar
- [x] Armor bar
- [x] Money display ($500 start, earn from missions)
- [x] Wanted stars (1-5, decay over time)
- [x] Vehicle name + speed when driving
- [x] Minimap (bottom-right)
- [x] Mission tracker (top-right)
- [x] Notification toast system

### Day/Night Cycle
- [x] Continuous time-of-day cycle (~2 min full day)
- [x] Night overlay darkens the scene
- [x] Building windows glow warm at night
- [x] Streetlight radial glow at night

### Mission System
- [x] JSON-based mission schema with validation
- [x] Trigger zones in world
- [x] Multi-step objectives (goto, collect, interact)
- [x] State machine (available → active → completed)
- [x] 3 built-in missions + 2 marketplace missions
- [x] Sound effects on accept/complete

### Marketplace
- [x] Browse/install community missions (M key)
- [x] Mission editor form for creators
- [x] JSON validation on submit
- [x] Install missions into live world

### Save/Load
- [x] Autosave every 30 seconds (localStorage)
- [x] Manual save (F5)
- [x] Persists: player position, completed/active missions

### Audio
- [x] Synthesized sounds (Web Audio API, no files)
- [x] Footsteps, mission accept chime, objective ding, completion fanfare
- [x] UI click sounds

---

## CONTROLS
| Key | Action |
|-----|--------|
| WASD / Arrows | Move (on foot) / Steer + accelerate (in car) |
| F | Enter / Exit vehicle |
| E | Interact / Accept mission |
| M | Toggle marketplace panel |
| Space | Brake (in vehicle) |
| F5 | Manual save |
| ESC | Close marketplace |

---

## ERRORS & BLOCKERS
| # | Date | Error/Issue | Status | Resolution |
|---|------|-------------|--------|------------|
| 1 | 2026-03-07 | Preview "Awaiting server" | Resolved | Added --host flag to Vite |
| 2 | 2026-03-07 | innerHTML XSS warning | Resolved | Switched to safe DOM methods |
| 3 | 2026-03-07 | Canvas aspect ratio in preview | Resolved | Set canvas to 100vw/100vh |

---

## DECISIONS LOG
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | 2D Canvas (not WebGL/3D) | Fastest to MVP, runs everywhere |
| 2026-03-07 | Vanilla JS, no framework | Full control, no dependencies |
| 2026-03-07 | GTA top-down style | User requested GTA feel |
| 2026-03-07 | Grid-based city gen | Natural for roads/blocks layout |
| 2026-03-07 | Web Audio API for sound | No asset files needed |
| 2026-03-07 | JSON missions for creators | Portable, validatable, marketplace-ready |

---

## HOW TO RUN
```bash
cd /Users/micha/Unified
npm install
npm run dev
# Open http://localhost:5173
```

## ARCHITECTURE
```
src/
  engine/
    input.js        Keyboard tracking
    physics.js      Velocity, friction, AABB collision
    camera.js       Smooth-follow camera
    renderer.js     GTA-style tile/building/vehicle/NPC rendering, day/night
    minimap.js      Minimap overlay
    save.js         localStorage save/load
    audio.js        Web Audio synthesized sounds
  game/
    player.js       WASD movement with physics
    world.js        City grid generation (8 tile types)
    vehicle.js      5 car types, driving physics, spawning
    npc.js          Pedestrian AI, flee behavior, spawning
  marketplace/
    marketplace.js  Browse/install missions
    editor.js       Creator mission editor form
  missions/
    schema.js       Mission JSON validation
    mission-engine.js  State machine, objective tracking
    sample-missions.js  Built-in missions
```

## CREATOR MISSION FORMAT
```json
{
  "id": "unique-id",
  "name": "Mission Name",
  "author": "CreatorName",
  "description": "Description text.",
  "triggerZone": { "x": 500, "y": 300, "radius": 50 },
  "objectives": [
    { "type": "goto", "description": "Go somewhere", "target": { "x": 800, "y": 600, "radius": 40 } }
  ],
  "reward": { "xp": 100 }
}
```
