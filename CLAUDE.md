# Project: Open World Mission Creator

You are helping build an MVP for a user-generated open-world game where players
describe missions in plain English and Claude Code generates valid, playable
mission files.

## Architecture

This is a 2D top-down open-world game (early GTA style) built in Python using
Pygame. The game has three layers:

1. **Game Runtime** - Renders the world, handles player movement, NPC behavior,
   vehicle mechanics, and basic combat
2. **Mission Interpreter** - Reads mission JSON files, spawns entities, manages
   triggers, tracks objectives, handles success/failure states
3. **Mission Generator** - Claude Code takes natural language descriptions from
   players and outputs valid mission JSON files

## Tech Stack

- Python 3.11+
- Pygame for rendering and game loop
- JSON for mission definitions
- Pydantic for mission schema validation

## Project Structure

open-world-missions/
├── CLAUDE.md
├── README.md
├── requirements.txt
├── src/
│   ├── engine/
│   │   ├── game.py              # Main game loop, rendering
│   │   ├── player.py            # Player controller
│   │   ├── npc.py               # NPC behavior/AI
│   │   ├── vehicle.py           # Vehicle spawning and physics
│   │   ├── world.py             # Map, districts, collision
│   │   └── camera.py            # Viewport/camera follow
│   ├── missions/
│   │   ├── schema.py            # Pydantic models for mission JSON
│   │   ├── interpreter.py       # Reads JSON, manages mission state
│   │   ├── objective_handlers.py # Logic for each objective type
│   │   ├── trigger_system.py    # Proximity, interaction, time triggers
│   │   └── validator.py         # Validates mission files pre-load
│   ├── ui/
│   │   ├── hud.py               # Health, minimap, objective tracker
│   │   └── mission_prompt.py    # In-game text input for mission creation
│   └── data/
│       ├── map.json             # World layout, district boundaries
│       ├── npc_archetypes.json  # Available NPC types
│       ├── items.json           # Items, weapons, vehicles catalog
│       └── missions/            # Generated mission files go here
│           └── example_bank_heist.json
├── tools/
│   └── generate_mission.py      # CLI tool: describe mission -> JSON
└── tests/
├── test_schema.py
├── test_interpreter.py
└── test_validator.py


## Mission JSON Schema

Every generated mission MUST conform to this schema. Reject anything that
doesn't validate.
```json
{
  "mission_id": "string (uuid4)",
  "title": "string (max 60 chars)",
  "description": "string (max 200 chars, shown to player)",
  "author": "string (player name)",
  "difficulty": "easy | medium | hard",
  "estimated_minutes": "integer (1-30)",
  "trigger": {
    "type": "location | npc_interaction | item_pickup | auto",
    "location": [x, y],
    "radius": "integer (pixels)",
    "npc_id": "string (optional, for npc_interaction type)"
  },
  "objectives": [
    {
      "id": "string",
      "type": "go_to | collect | deliver | eliminate | escort | survive | interact",
      "description": "string (shown in HUD)",
      "target_location": [x, y],
      "target_npc": "string (optional)",
      "target_item": "string (optional)",
      "quantity": "integer (default 1)",
      "time_limit_seconds": "integer (optional)",
      "required": true,
      "order": "integer (sequential ordering, missions play in order)"
    }
  ],
  "dialogue": [
    {
      "trigger_objective_id": "string (plays when this objective activates)",
      "npc_name": "string",
      "lines": [
        {
          "speaker": "string",
          "text": "string (max 120 chars per line)",
          "choices": [
            {
              "text": "string",
              "next_line_index": "integer (optional, for branching)"
            }
          ]
        }
      ]
    }
  ],
  "spawn_entities": [
    {
      "type": "npc | vehicle | item | prop",
      "archetype": "string (must exist in npc_archetypes.json or items.json)",
      "position": [x, y],
      "behavior": "idle | patrol | hostile | flee | follow_player",
      "despawn_on_objective": "string (optional, objective_id)"
    }
  ],
  "rewards": {
    "cash": "integer (0-10000)",
    "reputation": "integer (-100 to 100)",
    "items": ["string (item IDs)"],
    "unlock_district": "string (optional)"
  },
  "fail_conditions": [
    {
      "type": "player_death | time_expired | npc_death | out_of_bounds",
      "target_npc": "string (optional, for npc_death)",
      "message": "string (shown on fail)"
    }
  ]
}
```

## World Map Reference

The game world is a 4000x4000 pixel map divided into districts. ALL coordinates
in mission files must fall within valid district boundaries.

| District        | Top-Left   | Bottom-Right | Description                    |
|-----------------|------------|--------------|--------------------------------|
| Downtown        | (1500,1500)| (2500,2500)  | High-rises, banks, offices     |
| The Docks       | (0,3000)   | (1500,4000)  | Warehouses, shipping, shady    |
| Uptown          | (1500,0)   | (3000,1500)  | Wealthy residential, mansions  |
| Industrial      | (3000,2500)| (4000,4000)  | Factories, scrapyards          |
| Midtown         | (0,1500)   | (1500,3000)  | Shops, apartments, nightlife   |
| The Hills       | (3000,0)   | (4000,1500)  | Winding roads, overlooks       |
| Old Town        | (0,0)      | (1500,1500)  | Historic buildings, markets    |

## NPC Archetypes Available

Only these NPC types can be referenced. Do not invent new ones.

- `civilian` - Neutral, flees danger
- `gang_member` - Hostile if provoked, patrols territory
- `cop` - Pursues player with wanted level
- `shopkeeper` - Stationary, interactable
- `informant` - Gives intel, interactable
- `bodyguard` - Follows and protects a target
- `driver` - Operates vehicles on patrol routes
- `boss` - Tougher enemy, used for climactic encounters

## Vehicle Types Available

- `sedan`, `sports_car`, `truck`, `motorcycle`, `van`, `boat` (docks only)

## Item Types Available

- `cash_bundle`, `key_card`, `briefcase`, `phone`, `weapon_pistol`,
  `weapon_shotgun`, `medkit`, `disguise`, `evidence_file`

## Rules for Mission Generation

1. ALL coordinates must be within the 4000x4000 map and inside a valid district
2. ALL NPC archetypes, vehicles, and items must come from the lists above
3. Objectives must be ordered sequentially (order: 1, 2, 3...)
4. Missions should have 2-6 objectives for MVP scope
5. Every mission needs at least one fail condition
6. Dialogue lines max 120 characters (they render in a small text box)
7. Estimated time should be realistic for the objective count
8. Don't spawn more than 15 entities total (performance)
9. Boat vehicles can only spawn in The Docks district
10. Reward cash should scale with difficulty: easy (500-1500), medium (1500-4000), hard (4000-10000)

## Validation

Before outputting any mission file, run it through `validator.py` which checks:
- Schema conformance (Pydantic)
- Coordinate bounds
- Archetype/item existence
- Objective ordering
- Entity count limits
- Reward scaling

If validation fails, fix the issues and re-validate. Never output an invalid
mission.

## How to Generate a Mission (CLI)
```bash
python tools/generate_mission.py "I want a mission where I pick up a briefcase
from an informant in Old Town, then drive it to a boss in the Industrial
district while being chased by gang members"
```

This should:
1. Parse the natural language description
2. Map it to valid schema elements
3. Generate the full mission JSON
4. Validate it
5. Save to src/data/missions/
6. Print a playtest summary

## How to Test
```bash
pytest tests/ -v
```

Always write tests for new mission features or schema changes.

## Current Sprint Goals

- [ ] Basic Pygame world rendering with district boundaries
- [ ] Player movement and camera
- [ ] Mission interpreter that loads and runs a single hardcoded mission
- [ ] Pydantic schema + validator
- [ ] CLI mission generator (generate_mission.py)
- [ ] NPC spawning and basic behavior (idle, hostile, patrol)
- [ ] Objective tracking HUD
- [ ] 3 example missions to prove the system works


