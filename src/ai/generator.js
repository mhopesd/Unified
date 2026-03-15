// AI Asset Generator — parses natural language into playable game assets.
// Handles missions, vehicles, weapons, and NPCs.

import { DISTRICTS, NPC_ARCHETYPES, VEHICLE_TYPES, ITEM_TYPES, OBJECTIVE_TYPES } from '../missions/schema.js';

// --- Keyword maps ---

const LOCATION_KEYWORDS = {
  'downtown': 'Downtown', 'city': 'Downtown', 'bank': 'Downtown', 'office': 'Downtown',
  'docks': 'The Docks', 'dock': 'The Docks', 'harbor': 'The Docks', 'warehouse': 'The Docks', 'port': 'The Docks',
  'uptown': 'Uptown', 'mansion': 'Uptown', 'rich': 'Uptown', 'wealthy': 'Uptown',
  'industrial': 'Industrial', 'factory': 'Industrial', 'scrapyard': 'Industrial',
  'midtown': 'Midtown', 'shop': 'Midtown', 'bar': 'Midtown', 'nightlife': 'Midtown',
  'hills': 'The Hills', 'hill': 'The Hills', 'overlook': 'The Hills',
  'old town': 'Old Town', 'market': 'Old Town', 'historic': 'Old Town',
};

const ACTION_KEYWORDS = {
  'deliver': 'goto', 'bring': 'goto', 'take': 'goto', 'drive': 'goto', 'go': 'goto',
  'collect': 'collect', 'pick up': 'collect', 'grab': 'collect', 'get': 'collect', 'find': 'collect',
  'talk': 'interact', 'meet': 'interact', 'speak': 'interact', 'contact': 'interact',
  'kill': 'eliminate', 'fight': 'eliminate', 'destroy': 'eliminate', 'take out': 'eliminate', 'eliminate': 'eliminate',
  'escort': 'escort', 'protect': 'escort', 'guard': 'escort',
  'survive': 'survive', 'hold out': 'survive', 'defend': 'survive',
};

const NPC_KEYWORDS = {
  'gang': 'gang_member', 'gangster': 'gang_member', 'thug': 'gang_member',
  'cop': 'cop', 'police': 'cop', 'officer': 'cop',
  'informant': 'informant', 'snitch': 'informant', 'contact': 'informant',
  'boss': 'boss', 'leader': 'boss', 'kingpin': 'boss',
  'bodyguard': 'bodyguard', 'guard': 'bodyguard',
  'shopkeeper': 'shopkeeper', 'merchant': 'shopkeeper', 'vendor': 'shopkeeper',
  'driver': 'driver',
};

const ITEM_KEYWORDS = {
  'briefcase': 'briefcase', 'case': 'briefcase', 'package': 'briefcase',
  'money': 'cash_bundle', 'cash': 'cash_bundle',
  'key': 'key_card', 'keycard': 'key_card', 'card': 'key_card',
  'phone': 'phone',
  'gun': 'weapon_pistol', 'pistol': 'weapon_pistol', 'weapon': 'weapon_pistol',
  'shotgun': 'weapon_shotgun',
  'medkit': 'medkit', 'health': 'medkit',
  'disguise': 'disguise',
  'evidence': 'evidence_file', 'file': 'evidence_file', 'documents': 'evidence_file',
};

const DIFFICULTY_KEYWORDS = {
  'easy': 'easy', 'simple': 'easy', 'quick': 'easy', 'beginner': 'easy',
  'hard': 'hard', 'difficult': 'hard', 'tough': 'hard', 'extreme': 'hard', 'dangerous': 'hard',
};

// --- Vehicle keyword maps ---

const VEHICLE_NAME_MAP = {
  // Real car brand keywords → game vehicle configs
  'ferrari': { name: 'Veloce GT', speed: 850, accel: 1500, color: '#cc1111', turnSpeed: 4.2, w: 20, h: 38 },
  'lamborghini': { name: 'Diavolo', speed: 900, accel: 1600, color: '#ffcc00', turnSpeed: 4.0, w: 20, h: 38 },
  'lambo': { name: 'Diavolo', speed: 900, accel: 1600, color: '#ffcc00', turnSpeed: 4.0, w: 20, h: 38 },
  'porsche': { name: 'Specter 911', speed: 780, accel: 1300, color: '#2244aa', turnSpeed: 4.5, w: 20, h: 36 },
  'mustang': { name: 'Stallion', speed: 720, accel: 1200, color: '#1144dd', turnSpeed: 3.8, w: 22, h: 40 },
  'corvette': { name: 'Venom', speed: 800, accel: 1400, color: '#dd2222', turnSpeed: 4.1, w: 20, h: 38 },
  'bugatti': { name: 'Phantom', speed: 950, accel: 1800, color: '#111133', turnSpeed: 3.8, w: 20, h: 40 },
  'tesla': { name: 'Volt X', speed: 750, accel: 2000, color: '#eeeeff', turnSpeed: 3.8, w: 22, h: 40 },
  'jeep': { name: 'Brawler', speed: 480, accel: 700, color: '#445533', turnSpeed: 3.0, w: 26, h: 44 },
  'tank': { name: 'Enforcer', speed: 250, accel: 400, color: '#3a3a2a', turnSpeed: 1.5, w: 30, h: 50 },
  'motorcycle': { name: 'Razor', speed: 700, accel: 1400, color: '#222222', turnSpeed: 5.0, w: 12, h: 28 },
  'bike': { name: 'Razor', speed: 700, accel: 1400, color: '#222222', turnSpeed: 5.0, w: 12, h: 28 },
  'truck': { name: 'Hauler', speed: 380, accel: 550, color: '#555566', turnSpeed: 2.2, w: 28, h: 52 },
  'pickup': { name: 'Ranger', speed: 450, accel: 650, color: '#884422', turnSpeed: 2.8, w: 24, h: 46 },
  'van': { name: 'Transit', speed: 400, accel: 600, color: '#ddddcc', turnSpeed: 2.5, w: 26, h: 48 },
  'limo': { name: 'Executive', speed: 500, accel: 700, color: '#111111', turnSpeed: 2.0, w: 24, h: 56 },
  'police': { name: 'Interceptor', speed: 750, accel: 1300, color: '#1122dd', turnSpeed: 4.0, w: 22, h: 40 },
  'ambulance': { name: 'Medic Unit', speed: 500, accel: 800, color: '#ffffff', turnSpeed: 3.0, w: 26, h: 46 },
  'fire truck': { name: 'Blaze', speed: 400, accel: 600, color: '#cc2200', turnSpeed: 2.0, w: 28, h: 52 },
  'sports car': { name: 'Turismo', speed: 780, accel: 1300, color: '#cc3333', turnSpeed: 4.2, w: 20, h: 38 },
  'supercar': { name: 'Hyperion', speed: 900, accel: 1700, color: '#ff4400', turnSpeed: 4.0, w: 20, h: 38 },
  'race car': { name: 'Apex', speed: 950, accel: 2000, color: '#ff0000', turnSpeed: 4.5, w: 18, h: 36 },
  'suv': { name: 'Overlord', speed: 480, accel: 700, color: '#2a2a2a', turnSpeed: 3.0, w: 26, h: 46 },
  'sedan': { name: 'Primo', speed: 520, accel: 800, color: '#4466aa', turnSpeed: 3.5, w: 22, h: 40 },
  'taxi': { name: 'Metro Cab', speed: 480, accel: 700, color: '#ddcc33', turnSpeed: 3.5, w: 22, h: 40 },
  'bus': { name: 'City Bus', speed: 320, accel: 400, color: '#3377aa', turnSpeed: 1.5, w: 28, h: 58 },
};

const COLOR_KEYWORDS = {
  'red': '#cc1111', 'blue': '#1144dd', 'green': '#22aa22', 'yellow': '#ddcc00',
  'black': '#111111', 'white': '#eeeeee', 'orange': '#dd6600', 'purple': '#7722cc',
  'pink': '#dd4488', 'gold': '#ccaa00', 'silver': '#aaaaaa', 'grey': '#666666',
  'gray': '#666666', 'brown': '#664422', 'cyan': '#00cccc', 'matte black': '#1a1a1a',
};

const SPEED_KEYWORDS = {
  'fast': 1.3, 'super fast': 1.5, 'really fast': 1.5, 'fastest': 1.6,
  'slow': 0.6, 'heavy': 0.5, 'quick': 1.2, 'turbo': 1.4,
  'insane': 1.6, 'blazing': 1.5, 'rocket': 1.7,
};

// --- Weapon keyword maps ---

const WEAPON_NAME_MAP = {
  'pistol': { name: 'Pistol', damage: 15, fireRate: 3, range: 10, ammo: 60, spread: 0.02, color: '#aaa' },
  'glock': { name: '9mm Auto', damage: 14, fireRate: 4, range: 10, ammo: 80, spread: 0.025, color: '#888' },
  'revolver': { name: 'Revolver', damage: 35, fireRate: 1.2, range: 12, ammo: 36, spread: 0.01, color: '#bbb' },
  'magnum': { name: '.44 Magnum', damage: 45, fireRate: 1.0, range: 14, ammo: 30, spread: 0.01, color: '#ccc' },
  'deagle': { name: 'Desert Eagle', damage: 40, fireRate: 1.5, range: 13, ammo: 35, spread: 0.015, color: '#c9a040' },
  'desert eagle': { name: 'Desert Eagle', damage: 40, fireRate: 1.5, range: 13, ammo: 35, spread: 0.015, color: '#c9a040' },
  'uzi': { name: 'Micro SMG', damage: 8, fireRate: 12, range: 8, ammo: 200, spread: 0.06, color: '#777' },
  'smg': { name: 'SMG', damage: 10, fireRate: 10, range: 9, ammo: 180, spread: 0.05, color: '#888' },
  'mp5': { name: 'Tactical SMG', damage: 12, fireRate: 9, range: 9, ammo: 150, spread: 0.04, color: '#666' },
  'ak47': { name: 'Assault Rifle', damage: 22, fireRate: 7, range: 14, ammo: 120, spread: 0.035, color: '#8a7050' },
  'ak': { name: 'Assault Rifle', damage: 22, fireRate: 7, range: 14, ammo: 120, spread: 0.035, color: '#8a7050' },
  'm16': { name: 'Carbine Rifle', damage: 20, fireRate: 8, range: 15, ammo: 120, spread: 0.03, color: '#555' },
  'm4': { name: 'Carbine Rifle', damage: 20, fireRate: 8, range: 15, ammo: 120, spread: 0.03, color: '#555' },
  'rifle': { name: 'Assault Rifle', damage: 22, fireRate: 7, range: 14, ammo: 120, spread: 0.035, color: '#666' },
  'assault rifle': { name: 'Assault Rifle', damage: 22, fireRate: 7, range: 14, ammo: 120, spread: 0.035, color: '#666' },
  'shotgun': { name: 'Shotgun', damage: 50, fireRate: 1.2, range: 6, ammo: 40, spread: 0.1, color: '#8a6a4a' },
  'pump shotgun': { name: 'Pump Shotgun', damage: 55, fireRate: 1.0, range: 6, ammo: 40, spread: 0.1, color: '#7a5a3a' },
  'sniper': { name: 'Sniper Rifle', damage: 80, fireRate: 0.5, range: 25, ammo: 20, spread: 0.005, color: '#444' },
  'sniper rifle': { name: 'Sniper Rifle', damage: 80, fireRate: 0.5, range: 25, ammo: 20, spread: 0.005, color: '#444' },
  'minigun': { name: 'Minigun', damage: 6, fireRate: 25, range: 10, ammo: 500, spread: 0.08, color: '#555' },
  'rpg': { name: 'Rocket Launcher', damage: 100, fireRate: 0.3, range: 18, ammo: 8, spread: 0.01, color: '#556633' },
  'rocket launcher': { name: 'Rocket Launcher', damage: 100, fireRate: 0.3, range: 18, ammo: 8, spread: 0.01, color: '#556633' },
  'machine gun': { name: 'Light MG', damage: 16, fireRate: 10, range: 12, ammo: 200, spread: 0.05, color: '#666' },
  'lmg': { name: 'Light MG', damage: 16, fireRate: 10, range: 12, ammo: 200, spread: 0.05, color: '#666' },
};

// --- NPC creation keywords ---

const NPC_BEHAVIOR_KEYWORDS = {
  'hostile': 'hostile', 'enemy': 'hostile', 'aggressive': 'hostile', 'angry': 'hostile',
  'friendly': 'idle', 'peaceful': 'idle', 'calm': 'idle', 'nice': 'idle',
  'patrol': 'patrol', 'patrolling': 'patrol', 'roaming': 'patrol', 'walking': 'patrol',
  'flee': 'flee', 'scared': 'flee', 'running': 'flee', 'coward': 'flee',
  'follow': 'follow_player', 'following': 'follow_player', 'companion': 'follow_player', 'buddy': 'follow_player', 'partner': 'follow_player',
};

// --- Coordinate helpers ---

const DISTRICT_LIST = Object.values(DISTRICTS);

function districtCenter(name) {
  const d = DISTRICT_LIST.find(d => d.label === name);
  if (!d) return { x: 1600, y: 1280 };
  return {
    x: (d.x1 + d.x2) / 2 + (Math.random() - 0.5) * (d.x2 - d.x1) * 0.4,
    y: (d.y1 + d.y2) / 2 + (Math.random() - 0.5) * (d.y2 - d.y1) * 0.4,
  };
}

function randomDistrict() {
  return DISTRICT_LIST[Math.floor(Math.random() * DISTRICT_LIST.length)].label;
}

// --- Asset type detection ---

export function detectAssetType(prompt) {
  const lower = prompt.toLowerCase();

  // Vehicle keywords
  const vehicleSignals = [
    'car', 'vehicle', 'drive', 'ride', 'motorcycle', 'bike', 'truck',
    'van', 'bus', 'taxi', 'suv', 'sedan', 'limo', 'tank',
    ...Object.keys(VEHICLE_NAME_MAP),
  ];
  // Weapon keywords
  const weaponSignals = [
    'gun', 'weapon', 'shoot', 'rifle', 'pistol', 'shotgun', 'sniper',
    'ammo', 'fire', 'arm me', 'armed',
    ...Object.keys(WEAPON_NAME_MAP),
  ];
  // NPC keywords
  const npcSignals = [
    'person', 'people', 'npc', 'character', 'civilian', 'pedestrian',
    'spawn', 'summon', 'create a', 'make a',
    ...Object.keys(NPC_KEYWORDS),
  ];

  // Check for creation verbs + asset nouns
  const hasCreate = /\b(create|make|give|spawn|summon|build|generate|get|want|need)\b/.test(lower);

  // Score each type
  let vehicleScore = 0, weaponScore = 0, npcScore = 0, missionScore = 0;

  for (const kw of vehicleSignals) {
    if (lower.includes(kw)) vehicleScore += kw.length > 4 ? 3 : 2;
  }
  for (const kw of weaponSignals) {
    if (lower.includes(kw)) weaponScore += kw.length > 4 ? 3 : 2;
  }
  for (const kw of npcSignals) {
    if (lower.includes(kw)) npcScore++;
  }

  // Mission signals
  const missionSignals = ['mission', 'objective', 'quest', 'deliver', 'escort', 'survive', 'collect'];
  for (const kw of missionSignals) {
    if (lower.includes(kw)) missionScore += 3;
  }

  // If "I can drive" → vehicle, "I can shoot" → weapon
  if (/\b(i can drive|driveable|drivable)\b/.test(lower)) vehicleScore += 5;
  if (/\b(i can shoot|shootable|equip|arm me)\b/.test(lower)) weaponScore += 5;

  // Default to mission if no strong signals or mission signals are strongest
  if (missionScore >= vehicleScore && missionScore >= weaponScore && missionScore >= npcScore) {
    return 'mission';
  }
  if (vehicleScore >= weaponScore && vehicleScore >= npcScore && (hasCreate || vehicleScore > 3)) {
    return 'vehicle';
  }
  if (weaponScore >= npcScore && (hasCreate || weaponScore > 3)) {
    return 'weapon';
  }
  if (npcScore > 0 && hasCreate) {
    return 'npc';
  }
  return 'mission'; // fallback
}

// --- Vehicle Generator ---

export function generateVehicle(prompt) {
  const lower = prompt.toLowerCase();

  // Find vehicle base type
  let base = null;
  for (const [kw, config] of Object.entries(VEHICLE_NAME_MAP)) {
    if (lower.includes(kw)) {
      base = { ...config };
      break;
    }
  }

  // Default: generic sports car
  if (!base) {
    base = { name: 'Custom Ride', speed: 600, accel: 1000, color: '#cc3333', turnSpeed: 3.8, w: 22, h: 40 };
  }

  // Override color if specified
  for (const [kw, col] of Object.entries(COLOR_KEYWORDS)) {
    if (lower.includes(kw)) {
      base.color = col;
      break;
    }
  }

  // Speed modifier
  for (const [kw, mul] of Object.entries(SPEED_KEYWORDS)) {
    if (lower.includes(kw)) {
      base.speed = Math.round(base.speed * mul);
      base.accel = Math.round(base.accel * mul);
      break;
    }
  }

  // Extract a custom name if prompt says "called" or "named"
  const nameMatch = lower.match(/(?:called|named)\s+"?([^"]+)"?/);
  if (nameMatch) {
    base.name = nameMatch[1].split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 20);
  }

  return base;
}

// --- Weapon Generator ---

export function generateWeapon(prompt) {
  const lower = prompt.toLowerCase();

  // Find weapon base
  let base = null;
  for (const [kw, config] of Object.entries(WEAPON_NAME_MAP)) {
    if (lower.includes(kw)) {
      base = { ...config };
      break;
    }
  }

  // Default: pistol
  if (!base) {
    base = { name: 'Custom Gun', damage: 15, fireRate: 3, range: 10, ammo: 60, spread: 0.02, color: '#aaa' };
  }

  // Modifiers
  if (/\b(powerful|strong|heavy damage|devastating)\b/.test(lower)) {
    base.damage = Math.round(base.damage * 1.5);
    base.name = 'Heavy ' + base.name;
  }
  if (/\b(rapid|fast fire|high rate|automatic)\b/.test(lower)) {
    base.fireRate = Math.round(base.fireRate * 1.5);
  }
  if (/\b(accurate|precise|laser|pinpoint)\b/.test(lower)) {
    base.spread *= 0.3;
    base.range = Math.round(base.range * 1.3);
  }
  if (/\b(silenced|suppressed|quiet)\b/.test(lower)) {
    base.name = 'Suppressed ' + base.name;
  }
  if (/\b(gold|golden)\b/.test(lower)) {
    base.color = '#ccaa00';
    base.name = 'Gold ' + base.name;
  }

  // Custom name
  const nameMatch = lower.match(/(?:called|named)\s+"?([^"]+)"?/);
  if (nameMatch) {
    base.name = nameMatch[1].split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 25);
  }

  return base;
}

// --- NPC Generator ---

export function generateNPC(prompt) {
  const lower = prompt.toLowerCase();

  // Detect archetype
  let archetype = 'civilian';
  for (const [kw, type] of Object.entries(NPC_KEYWORDS)) {
    if (lower.includes(kw)) { archetype = type; break; }
  }

  // Detect behavior
  let behavior = 'idle';
  for (const [kw, beh] of Object.entries(NPC_BEHAVIOR_KEYWORDS)) {
    if (lower.includes(kw)) { behavior = beh; break; }
  }

  // Count
  let count = 1;
  const countMatch = lower.match(/(\d+)\s+(?:of|people|npcs?|guys?|enemies|hostiles|civilians)/);
  if (countMatch) count = Math.min(parseInt(countMatch[1]), 10);
  if (/\b(group|squad|team|gang|crowd)\b/.test(lower)) count = Math.max(count, 4);
  if (/\b(army|horde|swarm|tons)\b/.test(lower)) count = 8;

  // Color
  let color = null;
  for (const [kw, col] of Object.entries(COLOR_KEYWORDS)) {
    if (lower.includes(kw)) { color = col; break; }
  }

  // Name
  let name = archetype.replace('_', ' ');
  name = name[0].toUpperCase() + name.slice(1);

  return { archetype, behavior, count, color, name };
}

// --- Mission Generator (existing logic) ---

export function generateMission(prompt) {
  const lower = prompt.toLowerCase();

  const locations = [];
  for (const [kw, dist] of Object.entries(LOCATION_KEYWORDS)) {
    if (lower.includes(kw) && !locations.includes(dist)) locations.push(dist);
  }
  if (locations.length === 0) locations.push(randomDistrict(), randomDistrict());
  if (locations.length === 1) {
    let second = randomDistrict();
    while (second === locations[0]) second = randomDistrict();
    locations.push(second);
  }

  const actions = [];
  for (const [kw, type] of Object.entries(ACTION_KEYWORDS)) {
    if (lower.includes(kw) && !actions.includes(type)) actions.push(type);
  }
  if (actions.length === 0) actions.push('goto', 'interact');

  const npcs = [];
  for (const [kw, type] of Object.entries(NPC_KEYWORDS)) {
    if (lower.includes(kw) && !npcs.includes(type)) npcs.push(type);
  }

  const items = [];
  for (const [kw, type] of Object.entries(ITEM_KEYWORDS)) {
    if (lower.includes(kw) && !items.includes(type)) items.push(type);
  }

  let difficulty = 'medium';
  for (const [kw, diff] of Object.entries(DIFFICULTY_KEYWORDS)) {
    if (lower.includes(kw)) { difficulty = diff; break; }
  }

  const id = 'ai-' + Date.now();
  const objectives = [];
  const spawnEntities = [];

  const nameWords = prompt.split(/\s+/).filter(w => w.length > 2).slice(0, 5);
  const missionName = nameWords.length > 0
    ? nameWords.map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : 'Custom Mission';

  let objIdx = 0;
  for (let i = 0; i < Math.min(actions.length + 1, 5); i++) {
    const action = actions[i % actions.length];
    const loc = locations[i % locations.length];
    const pos = districtCenter(loc);

    let desc;
    switch (action) {
      case 'collect':
        desc = items.length > 0
          ? `Pick up the ${items[0].replace('_', ' ')} in ${loc}`
          : `Collect the package in ${loc}`;
        break;
      case 'eliminate':
        desc = npcs.length > 0
          ? `Take out the ${npcs[0].replace('_', ' ')} in ${loc}`
          : `Eliminate the target in ${loc}`;
        break;
      case 'interact':
        desc = npcs.length > 0
          ? `Meet the ${npcs[0].replace('_', ' ')} in ${loc}`
          : `Talk to the contact in ${loc}`;
        break;
      case 'escort':
        desc = `Escort the target through ${loc}`;
        break;
      case 'survive':
        desc = `Survive the ambush in ${loc}`;
        break;
      default:
        desc = `Head to ${loc}`;
    }

    objectives.push({
      type: action,
      description: desc.slice(0, 80),
      target: { x: Math.round(pos.x), y: Math.round(pos.y), radius: 40 },
    });
    objIdx++;
  }

  if (objectives.length < 3) {
    const escapeLoc = locations[locations.length - 1];
    const escapePos = districtCenter(escapeLoc);
    objectives.push({
      type: 'goto',
      description: `Get to the safehouse in ${escapeLoc}`,
      target: { x: Math.round(escapePos.x), y: Math.round(escapePos.y), radius: 45 },
    });
  }

  if (npcs.length > 0) {
    for (const npc of npcs.slice(0, 3)) {
      const loc = locations[Math.floor(Math.random() * locations.length)];
      const pos = districtCenter(loc);
      spawnEntities.push({
        type: 'npc',
        archetype: npc,
        position: [Math.round(pos.x), Math.round(pos.y)],
        behavior: npc === 'gang_member' || npc === 'boss' ? 'hostile' : 'idle',
      });
    }
  }

  const trigPos = districtCenter(locations[0]);
  const cashMap = { easy: 800, medium: 2500, hard: 6000 };

  const mission = {
    id,
    name: missionName.slice(0, 50),
    author: 'AI Generator',
    description: prompt.slice(0, 120),
    difficulty,
    triggerZone: { x: Math.round(trigPos.x), y: Math.round(trigPos.y), radius: 50 },
    objectives,
    reward: { cash: cashMap[difficulty] || 2500, xp: objectives.length * 200 },
    fail_conditions: [{ type: 'player_death', message: 'Mission failed — you died.' }],
  };

  if (spawnEntities.length > 0) mission.spawn_entities = spawnEntities;
  return mission;
}

// --- "AI thinking" flavor text ---

export function getThinkingSteps(prompt, assetType) {
  const lower = prompt.toLowerCase();

  if (assetType === 'vehicle') {
    return [
      'Analyzing vehicle description...',
      'Configuring engine and handling...',
      'Applying custom paint and body kit...',
      'Running performance simulation...',
      'Vehicle ready for deployment.',
    ];
  }
  if (assetType === 'weapon') {
    return [
      'Analyzing weapon specifications...',
      'Calibrating damage and fire rate...',
      'Loading ammunition...',
      'Running ballistics check...',
      'Weapon ready for equip.',
    ];
  }
  if (assetType === 'npc') {
    return [
      'Analyzing character description...',
      'Setting up behavior AI...',
      'Generating appearance...',
      'Character ready to spawn.',
    ];
  }

  // Mission (original)
  const steps = ['Analyzing mission description...', 'Mapping locations to city districts...'];
  if (lower.includes('gang') || lower.includes('fight') || lower.includes('kill')) {
    steps.push('Configuring hostile NPC encounters...');
  }
  if (lower.includes('deliver') || lower.includes('collect') || lower.includes('package')) {
    steps.push('Setting up item pickup and delivery points...');
  }
  if (lower.includes('escort') || lower.includes('protect')) {
    steps.push('Programming escort AI behavior...');
  }
  steps.push('Generating objective sequence...', 'Validating mission schema...', 'Mission ready.');
  return steps;
}
