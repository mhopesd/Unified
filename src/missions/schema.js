// Mission JSON schema and validation
// Every creator-submitted mission must pass validateMission() before entering the game.

// --- World constants ---
export const WORLD_W = 3200;
export const WORLD_H = 2560;

// --- Valid enums ---
export const OBJECTIVE_TYPES = ['goto', 'collect', 'deliver', 'eliminate', 'escort', 'survive', 'interact'];
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];
export const TRIGGER_TYPES = ['location', 'npc_interaction', 'item_pickup', 'auto'];

export const NPC_ARCHETYPES = [
  'civilian', 'gang_member', 'cop', 'shopkeeper',
  'informant', 'bodyguard', 'driver', 'boss',
];

export const NPC_BEHAVIORS = ['idle', 'patrol', 'hostile', 'flee', 'follow_player'];

export const VEHICLE_TYPES = ['sedan', 'sports_car', 'truck', 'motorcycle', 'van', 'boat'];

export const ITEM_TYPES = [
  'cash_bundle', 'key_card', 'briefcase', 'phone',
  'weapon_pistol', 'weapon_shotgun', 'medkit', 'disguise', 'evidence_file',
];

export const ENTITY_TYPES = ['npc', 'vehicle', 'item', 'prop'];

export const FAIL_CONDITION_TYPES = ['player_death', 'time_expired', 'npc_death', 'out_of_bounds'];

export const REWARD_CASH_RANGES = {
  easy:   [500, 1500],
  medium: [1500, 4000],
  hard:   [4000, 10000],
};

// --- Districts (bounds in world pixels) ---
export const DISTRICTS = {
  downtown:   { x1: 1200, y1: 960,  x2: 2000, y2: 1600, label: 'Downtown' },
  docks:      { x1: 0,    y1: 1920, x2: 1200, y2: 2560, label: 'The Docks' },
  uptown:     { x1: 1200, y1: 0,    x2: 2400, y2: 960,  label: 'Uptown' },
  industrial: { x1: 2400, y1: 1600, x2: 3200, y2: 2560, label: 'Industrial' },
  midtown:    { x1: 0,    y1: 960,  x2: 1200, y2: 1920, label: 'Midtown' },
  hills:      { x1: 2400, y1: 0,    x2: 3200, y2: 960,  label: 'The Hills' },
  old_town:   { x1: 0,    y1: 0,    x2: 1200, y2: 960,  label: 'Old Town' },
};

// --- Limits ---
const MAX_OBJECTIVES = 6;
const MIN_OBJECTIVES = 1;
const MAX_ENTITY_SPAWNS = 15;
const MAX_TITLE_LEN = 60;
const MAX_DESC_LEN = 200;
const MAX_DIALOGUE_LINE_LEN = 120;
const MAX_ESTIMATED_MINUTES = 30;

// --- Helpers ---

function isNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isString(v, maxLen) {
  return typeof v === 'string' && v.length > 0 && (maxLen == null || v.length <= maxLen);
}

function inBounds(x, y) {
  return isNumber(x) && isNumber(y) && x >= 0 && x <= WORLD_W && y >= 0 && y <= WORLD_H;
}

function getDistrict(x, y) {
  for (const [key, d] of Object.entries(DISTRICTS)) {
    if (x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2) return key;
  }
  return null;
}

// --- Main validator ---

/**
 * Validate a mission JSON object. Returns { valid, errors, warnings }.
 * `errors` are hard failures — the mission cannot load.
 * `warnings` are non-blocking but should be surfaced to creators.
 */
export function validateMission(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Mission data must be an object'], warnings: [] };
  }

  // --- Required top-level fields ---
  if (!isString(data.id, 128))           errors.push('Missing or invalid "id" (string, max 128 chars)');
  if (!isString(data.name, MAX_TITLE_LEN)) errors.push(`Missing or invalid "name" (string, max ${MAX_TITLE_LEN} chars)`);
  if (!isString(data.author, 60))        errors.push('Missing or invalid "author" (string, max 60 chars)');

  // Optional but validated if present
  if (data.description != null && !isString(data.description, MAX_DESC_LEN)) {
    errors.push(`"description" must be a string of max ${MAX_DESC_LEN} chars`);
  }

  if (data.difficulty != null && !DIFFICULTY_LEVELS.includes(data.difficulty)) {
    errors.push(`"difficulty" must be one of: ${DIFFICULTY_LEVELS.join(', ')}`);
  }

  if (data.estimated_minutes != null) {
    if (!Number.isInteger(data.estimated_minutes) || data.estimated_minutes < 1 || data.estimated_minutes > MAX_ESTIMATED_MINUTES) {
      errors.push(`"estimated_minutes" must be an integer 1-${MAX_ESTIMATED_MINUTES}`);
    }
  }

  // --- Trigger zone ---
  if (!data.triggerZone || typeof data.triggerZone !== 'object') {
    errors.push('Missing "triggerZone" object');
  } else {
    const tz = data.triggerZone;
    if (!isNumber(tz.x) || !isNumber(tz.y)) {
      errors.push('triggerZone.x and triggerZone.y must be numbers');
    } else if (!inBounds(tz.x, tz.y)) {
      errors.push(`triggerZone (${tz.x}, ${tz.y}) is outside world bounds (0-${WORLD_W}, 0-${WORLD_H})`);
    }
    if (!isNumber(tz.radius) || tz.radius < 10 || tz.radius > 200) {
      errors.push('triggerZone.radius must be a number between 10 and 200');
    }
    if (tz.type != null && !TRIGGER_TYPES.includes(tz.type)) {
      errors.push(`triggerZone.type "${tz.type}" is not valid. Use: ${TRIGGER_TYPES.join(', ')}`);
    }
  }

  // --- Objectives ---
  if (!Array.isArray(data.objectives) || data.objectives.length === 0) {
    errors.push('Must have at least one objective');
  } else {
    if (data.objectives.length > MAX_OBJECTIVES) {
      errors.push(`Too many objectives (${data.objectives.length}). Max is ${MAX_OBJECTIVES}`);
    }

    data.objectives.forEach((obj, i) => {
      const prefix = `Objective ${i + 1}`;

      if (!OBJECTIVE_TYPES.includes(obj.type)) {
        errors.push(`${prefix}: invalid type "${obj.type}". Use: ${OBJECTIVE_TYPES.join(', ')}`);
      }

      if (!isString(obj.description, 120)) {
        errors.push(`${prefix}: missing or too-long description (max 120 chars)`);
      }

      // Target validation
      if (!obj.target || typeof obj.target !== 'object') {
        errors.push(`${prefix}: missing "target" object`);
      } else {
        if (!isNumber(obj.target.x) || !isNumber(obj.target.y)) {
          errors.push(`${prefix}: target.x and target.y must be numbers`);
        } else if (!inBounds(obj.target.x, obj.target.y)) {
          errors.push(`${prefix}: target (${obj.target.x}, ${obj.target.y}) is outside world bounds`);
        }
        if (obj.target.radius != null && (!isNumber(obj.target.radius) || obj.target.radius < 5 || obj.target.radius > 300)) {
          errors.push(`${prefix}: target.radius must be 5-300`);
        }
      }

      // Type-specific checks
      if (obj.type === 'collect' && !isString(obj.item, 60)) {
        warnings.push(`${prefix}: "collect" objective should have an "item" name`);
      }
      if (obj.type === 'deliver' && !isString(obj.item, 60)) {
        warnings.push(`${prefix}: "deliver" objective should have an "item" name`);
      }
      if (obj.type === 'eliminate' && !isString(obj.target_npc, 60) && !obj.quantity) {
        warnings.push(`${prefix}: "eliminate" objective should specify target_npc or quantity`);
      }
      if (obj.type === 'survive' && !isNumber(obj.time_limit_seconds)) {
        warnings.push(`${prefix}: "survive" objective should have a time_limit_seconds`);
      }

      if (obj.time_limit_seconds != null && (!Number.isInteger(obj.time_limit_seconds) || obj.time_limit_seconds < 1)) {
        errors.push(`${prefix}: time_limit_seconds must be a positive integer`);
      }
      if (obj.quantity != null && (!Number.isInteger(obj.quantity) || obj.quantity < 1)) {
        errors.push(`${prefix}: quantity must be a positive integer`);
      }
    });
  }

  // --- Spawn entities (optional) ---
  if (data.spawn_entities != null) {
    if (!Array.isArray(data.spawn_entities)) {
      errors.push('"spawn_entities" must be an array');
    } else {
      if (data.spawn_entities.length > MAX_ENTITY_SPAWNS) {
        errors.push(`Too many spawn entities (${data.spawn_entities.length}). Max is ${MAX_ENTITY_SPAWNS}`);
      }
      data.spawn_entities.forEach((ent, i) => {
        const prefix = `spawn_entities[${i}]`;
        if (!ENTITY_TYPES.includes(ent.type)) {
          errors.push(`${prefix}: invalid type "${ent.type}". Use: ${ENTITY_TYPES.join(', ')}`);
        }
        if (ent.type === 'npc' && ent.archetype && !NPC_ARCHETYPES.includes(ent.archetype)) {
          errors.push(`${prefix}: unknown NPC archetype "${ent.archetype}". Use: ${NPC_ARCHETYPES.join(', ')}`);
        }
        if (ent.type === 'vehicle' && ent.archetype && !VEHICLE_TYPES.includes(ent.archetype)) {
          errors.push(`${prefix}: unknown vehicle type "${ent.archetype}". Use: ${VEHICLE_TYPES.join(', ')}`);
        }
        if (ent.type === 'item' && ent.archetype && !ITEM_TYPES.includes(ent.archetype)) {
          errors.push(`${prefix}: unknown item type "${ent.archetype}". Use: ${ITEM_TYPES.join(', ')}`);
        }
        if (ent.behavior && !NPC_BEHAVIORS.includes(ent.behavior)) {
          errors.push(`${prefix}: unknown behavior "${ent.behavior}". Use: ${NPC_BEHAVIORS.join(', ')}`);
        }
        if (ent.position) {
          if (!Array.isArray(ent.position) || ent.position.length !== 2) {
            errors.push(`${prefix}: position must be [x, y]`);
          } else if (!inBounds(ent.position[0], ent.position[1])) {
            errors.push(`${prefix}: position out of world bounds`);
          }
          // Boats only in Docks
          if (ent.type === 'vehicle' && ent.archetype === 'boat') {
            const district = getDistrict(ent.position[0], ent.position[1]);
            if (district !== 'docks') {
              errors.push(`${prefix}: boats can only spawn in The Docks district`);
            }
          }
        }
      });
    }
  }

  // --- Dialogue (optional) ---
  if (data.dialogue != null) {
    if (!Array.isArray(data.dialogue)) {
      errors.push('"dialogue" must be an array');
    } else {
      data.dialogue.forEach((dlg, i) => {
        const prefix = `dialogue[${i}]`;
        if (!Array.isArray(dlg.lines) || dlg.lines.length === 0) {
          errors.push(`${prefix}: must have at least one line`);
        } else {
          dlg.lines.forEach((line, j) => {
            if (!isString(line.speaker, 40)) {
              errors.push(`${prefix}.lines[${j}]: missing or invalid "speaker"`);
            }
            if (!isString(line.text, MAX_DIALOGUE_LINE_LEN)) {
              errors.push(`${prefix}.lines[${j}]: "text" missing or exceeds ${MAX_DIALOGUE_LINE_LEN} chars`);
            }
          });
        }
      });
    }
  }

  // --- Reward ---
  if (data.reward != null && typeof data.reward === 'object') {
    if (data.reward.cash != null) {
      if (!Number.isInteger(data.reward.cash) || data.reward.cash < 0 || data.reward.cash > 10000) {
        errors.push('reward.cash must be an integer 0-10000');
      }
      // Check scaling if difficulty is set
      if (data.difficulty && REWARD_CASH_RANGES[data.difficulty]) {
        const [min, max] = REWARD_CASH_RANGES[data.difficulty];
        if (data.reward.cash < min || data.reward.cash > max) {
          warnings.push(`reward.cash ${data.reward.cash} is outside expected range for "${data.difficulty}" difficulty (${min}-${max})`);
        }
      }
    }
    if (data.reward.reputation != null) {
      if (!Number.isInteger(data.reward.reputation) || data.reward.reputation < -100 || data.reward.reputation > 100) {
        errors.push('reward.reputation must be an integer -100 to 100');
      }
    }
    if (data.reward.items != null) {
      if (!Array.isArray(data.reward.items)) {
        errors.push('reward.items must be an array');
      } else {
        data.reward.items.forEach((item, i) => {
          if (!isString(item, 60)) {
            errors.push(`reward.items[${i}]: must be a non-empty string`);
          }
        });
      }
    }
    // Backward compat: xp is allowed
    if (data.reward.xp != null && (!isNumber(data.reward.xp) || data.reward.xp < 0)) {
      errors.push('reward.xp must be a non-negative number');
    }
  }

  // --- Fail conditions (optional) ---
  if (data.fail_conditions != null) {
    if (!Array.isArray(data.fail_conditions)) {
      errors.push('"fail_conditions" must be an array');
    } else {
      data.fail_conditions.forEach((fc, i) => {
        const prefix = `fail_conditions[${i}]`;
        if (!FAIL_CONDITION_TYPES.includes(fc.type)) {
          errors.push(`${prefix}: invalid type "${fc.type}". Use: ${FAIL_CONDITION_TYPES.join(', ')}`);
        }
        if (fc.type === 'npc_death' && !isString(fc.target_npc, 60)) {
          errors.push(`${prefix}: "npc_death" must specify target_npc`);
        }
        if (fc.message != null && !isString(fc.message, 200)) {
          errors.push(`${prefix}: message must be a string (max 200 chars)`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
