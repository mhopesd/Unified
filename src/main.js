// Main — open world with raycaster 3D view, vehicles, NPCs, missions, marketplace

import { initInput, wasKeyPressed, wasMouseClicked, isMouseHeld, clearJustPressed, isKeyDown, consumeMouseDX, requestPointerLock, isPointerLocked } from './engine/input.js';
import { aabbOverlap, resolveCollision } from './engine/physics.js';
import { Camera } from './engine/camera.js';
import { Renderer } from './engine/renderer.js';
import { Player } from './game/player.js';
import {
  generateWorld, TILE_SIZE, TILE_COLORS, getSolidRectsNear,
} from './game/world.js';
import { MissionEngine, MissionState } from './missions/mission-engine.js';
import { SAMPLE_MISSIONS } from './missions/sample-missions.js';
import { Marketplace } from './marketplace/marketplace.js';
import { Minimap } from './engine/minimap.js';
import { saveGame, loadGame, listSaves, migrateLegacySave } from './engine/save.js';
import { MissionEditor } from './marketplace/editor.js';
import { unlockAudio, playAccept, playObjectiveComplete, playMissionComplete, playClick, playStep, playBlip, playGunshot, playEngineLoop, stopEngineLoop, playHonk, updateSiren, startAmbientCity, updateAmbientCity, updateRainSound, playBirdChirp, playCrowdMurmur, playNPCVoice, updateTireScreech, playMeleeHit, playExplosion, playCashRegister, playCarCrash, playDoorOpen, playWeaponSwitch, playEnemyGunshot, updateHelicopterSound, playComboHit, playPropertyBuy, playSpotlightSweep, playWaterSplash, playPropBreak, playSwimStroke } from './engine/audio.js';
import { Vehicle, spawnVehicles } from './game/vehicle.js';
import { TrafficVehicle, CopVehicle, spawnTraffic, spawnCopNear, Roadblock, spawnRoadblock, PoliceHelicopter } from './game/traffic.js';
import { NPC, spawnNPCs, NPC_QUEST_TEMPLATES } from './game/npc.js';
import { AITerminal } from './ai/terminal.js';
import { CLAUDE_API_KEY_STORAGE } from './ai/generator.js';
import { CLOUD_API_STORAGE } from './marketplace/cloud.js';
import { ParticleSystem } from './engine/particles.js';
import { WeatherSystem } from './engine/weather.js';
import { Radio } from './engine/radio.js';
import { WeaponInventory, WEAPON_DEFS } from './game/combat.js';
import { GangSystem } from './game/gangs.js';
import { ShopSystem } from './game/shops.js';
import { InteriorSystem } from './game/interiors.js';
import { SpatialGrid } from './engine/spatial.js';
import { MobileControls } from './engine/mobile.js';
import { VisualMissionEditor } from './marketplace/visual-editor.js';
import { PropertySystem } from './game/properties.js';

// --- Loading progress ---
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const loadingScreen = document.getElementById('loading-screen');

function setLoadProgress(pct, msg) {
  if (loadingBar) loadingBar.style.width = pct + '%';
  if (loadingStatus) loadingStatus.textContent = msg;
}

// --- Fatal error display ---
function showFatalError(msg, err) {
  console.error('Fatal:', msg, err);
  if (window.__gameError) {
    window.__gameError(msg, err ? (err.stack || err.message || String(err)) : '');
  }
}

// --- Pause state ---
let gamePaused = false;
const pauseMenu = document.getElementById('pause-menu');
const pauseResume = document.getElementById('pause-resume');
const pauseSave = document.getElementById('pause-save');
const pauseLoad = document.getElementById('pause-load');
const pauseSettings = document.getElementById('pause-settings');
const pauseControls = document.getElementById('pause-controls');
const pauseSavesPanel = document.getElementById('pause-saves-panel');
const pauseSettingsPanel = document.getElementById('pause-settings-panel');
const autosaveIndicator = document.getElementById('autosave-indicator');

// Settings
let masterVolume = parseFloat(localStorage.getItem('unified-volume') ?? '0.8');
let mouseSensitivity = parseFloat(localStorage.getItem('unified-sensitivity') ?? '0.003');

function openPause() {
  gamePaused = true;
  if (pauseMenu) pauseMenu.classList.add('open');
  if (pauseSavesPanel) { pauseSavesPanel.classList.remove('open'); pauseSavesPanel.textContent = ''; }
  if (pauseSettingsPanel) pauseSettingsPanel.classList.remove('open');
  if (document.pointerLockElement) document.exitPointerLock();
}

function closePause() {
  gamePaused = false;
  if (pauseMenu) pauseMenu.classList.remove('open');
  if (pauseSavesPanel) pauseSavesPanel.classList.remove('open');
  if (pauseSettingsPanel) pauseSettingsPanel.classList.remove('open');
}

// Autosave flash indicator
function flashAutosave() {
  if (!autosaveIndicator) return;
  autosaveIndicator.classList.add('show');
  setTimeout(() => autosaveIndicator.classList.remove('show'), 1200);
}

// --- Config ---
let CANVAS_W = window.innerWidth;
let CANVAS_H = window.innerHeight;
const WORLD_COLS = 100;
const WORLD_ROWS = 80;
const WORLD_W = WORLD_COLS * TILE_SIZE;
const WORLD_H = WORLD_ROWS * TILE_SIZE;

// --- Init systems ---
setLoadProgress(5, 'Creating renderer...');

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, CANVAS_W, CANVAS_H);
const camera = new Camera(CANVAS_W, CANVAS_H); // kept for minimap
initInput();
unlockAudio();

// --- Window resize handler ---
let resizeTimeout = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    CANVAS_W = window.innerWidth;
    CANVAS_H = window.innerHeight;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    renderer.canvas.width = CANVAS_W;
    renderer.canvas.height = CANVAS_H;
    renderer._mainCtx.imageSmoothingEnabled = false;
  }, 150);
});

// Handle visibility change — pause when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !gamePaused) {
    openPause();
  }
});

// Pointer lock on canvas click
let hasEverStarted = false;
canvas.addEventListener('click', () => {
  if (gamePaused) return;
  if (!isPointerLocked()) {
    requestPointerLock(canvas);
    unlockAudio();
    hasEverStarted = true;
  }
});

// --- World ---
setLoadProgress(10, 'Generating city...');
const worldMap = generateWorld(WORLD_COLS, WORLD_ROWS);

// --- Player (spawn on a road tile near center) ---
function findSpawnOnRoad(map, cols, rows) {
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);
  // Spiral outward from center to find a road tile
  for (let radius = 0; radius < 20; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const r = midR + dr;
        const c = midC + dc;
        if (r > 1 && c > 1 && r < rows - 1 && c < cols - 1) {
          if (map[r][c] === 0) { // ROAD = 0
            return { x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 };
          }
        }
      }
    }
  }
  return { x: midC * TILE_SIZE, y: midR * TILE_SIZE };
}
setLoadProgress(20, 'Spawning player...');
const spawn = findSpawnOnRoad(worldMap, WORLD_COLS, WORLD_ROWS);
const player = new Player(spawn.x, spawn.y);

// --- Vehicles ---
setLoadProgress(25, 'Spawning vehicles...');
const vehicles = spawnVehicles(worldMap, TILE_SIZE, 25);

// --- Traffic (AI-driven cars on roads) ---
setLoadProgress(30, 'Spawning traffic...');
const trafficVehicles = spawnTraffic(worldMap, TILE_SIZE, 20);

// --- Cops (spawned dynamically based on wanted level) ---
const copVehicles = [];
const MAX_COPS = 3;
let copSpawnCooldown = 0;

// --- NPCs ---
setLoadProgress(40, 'Populating city with NPCs...');
const npcs = spawnNPCs(worldMap, TILE_SIZE, 40);

// --- NPC side quests (declared early so IIFE below can use it) ---
const sideQuests = [];      // { npc, targetX, targetY, reward, state }

// --- NPC side quest generation ---
(function initSideQuests() {
  for (const npc of npcs) {
    if (Math.random() > 0.22) continue; // ~22% of NPCs have a job
    const template = NPC_QUEST_TEMPLATES[Math.floor(Math.random() * NPC_QUEST_TEMPLATES.length)];
    // Pick a random road/sidewalk tile as target (must be far enough from NPC)
    let tx = 0, ty = 0;
    for (let a = 0; a < 80; a++) {
      const r = 2 + Math.floor(Math.random() * (WORLD_ROWS - 4));
      const c = 2 + Math.floor(Math.random() * (WORLD_COLS - 4));
      if (worldMap[r][c] !== 0 && worldMap[r][c] !== 1) continue;
      const wx = c * TILE_SIZE + TILE_SIZE / 2;
      const wy = r * TILE_SIZE + TILE_SIZE / 2;
      const ddx = wx - npc.x, ddy = wy - npc.y;
      if (ddx * ddx + ddy * ddy < 400 * 400) continue; // must be at least 400px away
      tx = wx; ty = wy; break;
    }
    if (!tx) continue;
    sideQuests.push({
      npc,
      targetX: tx, targetY: ty,
      reward: template.reward,
      title: template.title,
      intro: template.intro,
      outro: template.outro,
      radius: 52,
      state: 'available',
    });
  }
})();

// --- Pickups (health, ammo scattered on sidewalks) ---
const pickups = [];
function spawnPickups(map, tileSize, count) {
  const rows = map.length, cols = map[0].length;
  let attempts = 0;
  while (pickups.length < count && attempts < count * 10) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (map[r][c] !== 1 && map[r][c] !== 6) continue; // sidewalk or parking
    const type = Math.random() < 0.5 ? 'health' : 'ammo';
    pickups.push({
      x: c * tileSize + tileSize / 2,
      y: r * tileSize + tileSize / 2,
      type,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }
}
setLoadProgress(50, 'Placing pickups...');
spawnPickups(worldMap, TILE_SIZE, 30);

// --- Streetlights (spawn along roads near sidewalks) ---
const streetlights = [];
function spawnStreetlights(map, tileSize, count) {
  const rows = map.length, cols = map[0].length;
  let attempts = 0;
  while (streetlights.length < count && attempts < count * 10) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (map[r][c] !== 1) continue; // sidewalks only
    // Must be near a road
    let nearRoad = false;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 0) nearRoad = true;
    }
    if (!nearRoad) continue;
    // Not too close to others
    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;
    const tooClose = streetlights.some(s => {
      const dx = s.x - wx, dy = s.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < 100;
    });
    if (tooClose) continue;
    streetlights.push({ x: wx, y: wy });
  }
}
setLoadProgress(55, 'Placing streetlights...');
spawnStreetlights(worldMap, TILE_SIZE, 60);

// --- Street props (fire hydrants, benches, trash cans on sidewalks) ---
const streetProps = [];
const PROP_TYPES = ['hydrant', 'bench', 'trash', 'trash', 'bench']; // weighted variety
function spawnStreetProps(map, tileSize, count) {
  const rows = map.length, cols = map[0].length;
  let attempts = 0;
  while (streetProps.length < count && attempts < count * 15) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (map[r][c] !== 1) continue; // sidewalks only
    // Must be near a road
    let nearRoad = false;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 0) nearRoad = true;
    }
    if (!nearRoad) continue;
    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;
    // Not too close to streetlights or other props
    const tooClose = streetlights.some(s => {
      const dx = s.x - wx, dy = s.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < 40;
    }) || streetProps.some(p => {
      const dx = p.x - wx, dy = p.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < 28;
    });
    if (tooClose) continue;
    const propType = PROP_TYPES[Math.floor(Math.random() * PROP_TYPES.length)];
    streetProps.push({ x: wx, y: wy, propType });
  }
}
setLoadProgress(60, 'Placing street props...');
spawnStreetProps(worldMap, TILE_SIZE, 120);

// --- Traffic lights (at road intersections) ---
const trafficLights = [];
function spawnTrafficLights(map, tileSize) {
  const rows = map.length;
  const cols = map[0].length;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (map[r][c] !== 0) continue; // must be a road tile
      // Count adjacent road tiles
      let roadCount = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 0) roadCount++;
      }
      if (roadCount < 3) continue; // only real intersections
      const wx = c * tileSize + tileSize / 2;
      const wy = r * tileSize + tileSize / 2;
      // Don't place lights too close together
      const tooClose = trafficLights.some(tl => {
        const dx = tl.x - wx, dy = tl.y - wy;
        return dx * dx + dy * dy < 96 * 96;
      });
      if (tooClose) continue;
      // Stagger phases so not all lights change simultaneously
      const startGreen = trafficLights.length % 2 === 0;
      trafficLights.push({
        x: wx, y: wy,
        phase: startGreen ? 'green' : 'red',
        timer: startGreen ? (15 + Math.random() * 10) : (15 + Math.random() * 10),
      });
    }
  }
}
spawnTrafficLights(worldMap, TILE_SIZE);

setLoadProgress(70, 'Loading missions...');
// --- Missions ---
const missionEngine = new MissionEngine();
missionEngine.loadMissions(SAMPLE_MISSIONS);

// --- Marketplace ---
const marketplace = new Marketplace(missionEngine);
marketplace.addToCatalog({
  id: 'community-heist',
  name: 'The Bank Job',
  author: 'HeistMaster',
  description: 'Plan and execute a daring heist across the city.',
  difficulty: 'hard',
  price: 250,
  triggerZone: { x: 400, y: 400, radius: 45 },
  objectives: [
    { type: 'goto', description: 'Scout the bank', target: { x: 800, y: 300, radius: 35 } },
    { type: 'goto', description: 'Get the getaway car', target: { x: 600, y: 600, radius: 35 } },
    { type: 'interact', description: 'Hit the bank', target: { x: 800, y: 300, radius: 35 } },
    { type: 'goto', description: 'Escape to the safehouse', target: { x: 200, y: 700, radius: 40 } },
  ],
  reward: { cash: 5000, xp: 1000 },
  fail_conditions: [
    { type: 'player_death', message: 'Heist failed — you were caught.' },
  ],
});
marketplace.addToCatalog({
  id: 'community-race',
  name: 'Midnight Street Race',
  author: 'SpeedDemon',
  description: 'Illegal street race through downtown. Get a car first!',
  difficulty: 'easy',
  triggerZone: { x: 600, y: 550, radius: 40 },
  objectives: [
    { type: 'goto', description: 'Checkpoint 1 — Downtown', target: { x: 900, y: 300, radius: 35 } },
    { type: 'goto', description: 'Checkpoint 2 — Waterfront', target: { x: 1200, y: 800, radius: 35 } },
    { type: 'goto', description: 'Checkpoint 3 — Park District', target: { x: 400, y: 700, radius: 35 } },
    { type: 'goto', description: 'Finish!', target: { x: 600, y: 550, radius: 40 } },
  ],
  reward: { cash: 1000, xp: 500 },
  fail_conditions: [
    { type: 'player_death', message: 'Wrecked!' },
  ],
});

// --- Mission Editor ---
const editor = new MissionEditor(marketplace);
editor.mount(document.getElementById('marketplace-panel'));

// --- AI Terminal ---
const aiTerminal = new AITerminal(marketplace, missionEngine);

// Wire editor player position
editor.setPlayerPositionGetter(() => ({
  x: player.x + player.w / 2,
  y: player.y + player.h / 2,
}));

// Wire marketplace wallet — lets priced missions charge the player
marketplace.setWallet({
  getMoney: () => money,
  spendMoney: (amount) => {
    if (money < amount) return false;
    money -= amount;
    return true;
  },
  notify: (msg) => showNotification(msg),
});

// --- Particle system ---
const particles = new ParticleSystem(400);

// --- Weather system ---
const weather = new WeatherSystem();
renderer.setWeather(weather);

// --- Radio ---
const radio = new Radio();

// --- Save/Load ---
setLoadProgress(78, 'Loading save data...');
migrateLegacySave(); // upgrade any old single-slot saves
const savedData = loadGame(0); // load slot 0 on startup
let _savedMoney = 500, _savedHealth = 100, _savedArmor = 0, _savedWeapons = [], _savedWanted = 0;
if (savedData) {
  player.x = savedData.player.x;
  player.y = savedData.player.y;
  savedData.completedMissions.forEach(id => missionEngine.completedIds.add(id));
  for (const am of savedData.activeMissions) {
    const mission = missionEngine.missions.find(m => m.data.id === am.id);
    if (mission) {
      mission.state = MissionState.ACTIVE;
      mission.currentObjective = am.currentObjective;
      missionEngine.activeMissions.push(mission);
    }
  }
  _savedMoney  = savedData.money  ?? 500;
  _savedHealth = savedData.health ?? 100;
  _savedArmor  = savedData.armor  ?? 0;
  _savedWeapons = savedData.weapons ?? [];
  _savedWanted = savedData.wantedLevel ?? 0;
}

// --- Weapon inventory (replaces old single-weapon tracking) ---
const weaponInventory = new WeaponInventory();
// Restore weapons from save data
for (const saved of _savedWeapons) {
  if (saved && saved.type && WEAPON_DEFS[saved.type]) {
    weaponInventory.add(saved.type);
    const slot = weaponInventory.slots.find(s => s.type === saved.type);
    if (slot && saved.ammo !== undefined) slot.ammo = saved.ammo;
  }
}

// --- Gang system ---
const gangSystem = new GangSystem(WORLD_W, WORLD_H);

// --- Shop system ---
const shopSystem = new ShopSystem();
shopSystem.placeShops(worldMap, TILE_SIZE);

// --- Interior system ---
const interiorSystem = new InteriorSystem(TILE_SIZE);
interiorSystem.placeDoors(worldMap);

// --- Spatial grid (256px cells for entity queries) ---
const spatialGrid = new SpatialGrid(256, WORLD_W, WORLD_H);

// --- Mobile controls ---
const mobileControls = new MobileControls(canvas);
if (MobileControls.shouldActivate()) {
  mobileControls.activate();
}

// --- Visual mission editor ---
const visualEditor = new VisualMissionEditor(worldMap, TILE_SIZE, marketplace);

// --- Property system ---
setLoadProgress(92, 'Placing properties...');
const propertySystem = new PropertySystem();
propertySystem.placeProperties(WORLD_W, WORLD_H);

setLoadProgress(95, 'Finalizing...');

// --- Police helicopter (wanted level 5) ---
let helicopter = null;

// --- Melee combo system ---
let comboCount = 0;
let comboTimer = 0;
const COMBO_WINDOW = 0.8; // seconds to chain next hit
const COMBO_MAX = 4;

// --- Swimming ---
let isSwimming = false;
let swimStrokeTimer = 0;
const SWIM_SPEED = 100;

// --- Destructible props ---
// streetProps already exists — we track which are destroyed
const destroyedProps = new Set();

// --- Ambient events ---
const ambientEvents = []; // {type, x, y, timer, npcs}
let ambientEventCooldown = 20 + Math.random() * 30;

// --- Roadblocks ---
const roadblocks = [];
let roadblockCooldown = 0;

// Weapon pickups scattered in the world
const weaponPickups = [];
function spawnWeaponPickups(map, tileSize) {
  const rows = map.length, cols = map[0].length;
  const types = Object.keys(WEAPON_DEFS);
  const countPerType = 2;
  for (const wt of types) {
    let spawned = 0, attempts = 0;
    while (spawned < countPerType && attempts < 200) {
      attempts++;
      const r = 2 + Math.floor(Math.random() * (rows - 4));
      const c = 2 + Math.floor(Math.random() * (cols - 4));
      if (map[r][c] !== 1) continue; // sidewalk only
      const wx = c * tileSize + tileSize / 2;
      const wy = r * tileSize + tileSize / 2;
      weaponPickups.push({ x: wx, y: wy, weaponType: wt, bobPhase: Math.random() * Math.PI * 2 });
      spawned++;
    }
  }
}
spawnWeaponPickups(worldMap, TILE_SIZE);

// --- Weapon system (backed by WeaponInventory) ---
let currentWeapon = null;  // synced from weaponInventory.current each frame
let weaponCooldown = 0;
let muzzleFlashTimer = 0;
let hitMarkerTimer = 0;
let weaponRecoil = 0;      // recoil animation offset
let weaponBobPhase = 0;    // sway phase
let meleeSwingTimer = 0;   // bat swing animation (0=idle, >0=swinging)
let weaponNearby = null;   // nearest weapon pickup for prompt

// --- Thrown grenades ---
const thrownGrenades = [];  // { x, y, vx, vy, timer }

// --- NPC side quests (continued) ---
let questNearby = null;     // NPC with available quest nearby (for prompt)
let activeQuest = null;     // currently tracked side quest

// --- Sprint ---
let isSprinting = false;
const WALK_SPEED = 300;
const SPRINT_SPEED = 520;
let stamina = 100;

// --- Head bob ---
let headBobPhase = 0;
let headBobAmount = 0;

// --- Death/respawn ---
let isDead = false;
let deathTimer = 0;
const DEATH_RESPAWN_TIME = 3;
const RESPAWN_COST = 100;

// --- Particle timers ---
let dustTimer = 0;
let tireTimer = 0;

// --- Ambient sound timers ---
let birdTimer = 8 + Math.random() * 12;   // first chirp after a few seconds
let crowdTimer = 5 + Math.random() * 10;  // first murmur

// --- AI Terminal callbacks: spawn assets into the live game ---
aiTerminal.onSpawnVehicle = (config) => {
  // Spawn near the player on a road tile
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  // Place in front of the player
  const spawnX = px + Math.cos(player.angle) * 80;
  const spawnY = py + Math.sin(player.angle) * 80;
  const v = new Vehicle(spawnX, spawnY, 0);
  // Override with AI-generated stats
  v.name = config.name;
  v.maxSpeed = config.speed;
  v.accel = config.accel;
  v.turnSpeed = config.turnSpeed;
  v.color = config.color;
  v.w = config.w;
  v.h = config.h;
  v.angle = player.angle;
  vehicles.push(v);
};

aiTerminal.onEquipWeapon = (config) => {
  weaponInventory.equipDirect(config);
};

aiTerminal.onSpawnNPCs = (config) => {
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  for (let i = 0; i < config.count; i++) {
    // Scatter around the player
    const angle = (i / config.count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 60 + Math.random() * 80;
    const nx = px + Math.cos(angle) * dist;
    const ny = py + Math.sin(angle) * dist;
    const npc = new NPC(nx, ny);
    if (config.color) npc.color = config.color;
    npc.name = config.name;
    // Set behavior
    if (config.behavior === 'hostile') {
      npc.fleeing = false; // hostile NPCs don't flee (concept)
    } else if (config.behavior === 'follow_player') {
      npc.following = true; // we'll handle this in update
    }
    npcs.push(npc);
  }
};

// --- Minimap ---
setLoadProgress(80, 'Baking minimap...');
const minimap = new Minimap(WORLD_COLS, WORLD_ROWS, 340);
minimap.bake(worldMap);

// --- Game state ---
let inVehicle = null;
let money = _savedMoney;
let health = _savedHealth;
let armor = _savedArmor;
let wantedLevel = _savedWanted;
let wantedDecayTimer = 0;

// --- Day/night cycle ---
let timeOfDay = 0.25;
const DAY_SPEED = 0.008;

// --- Districts (named areas of the city) ---
const WORLD_DISTRICTS = [
  { name: 'Old Town',   x1: 0,          y1: 0,          x2: WORLD_W * 0.33, y2: WORLD_H * 0.33 },
  { name: 'Uptown',     x1: WORLD_W * 0.33, y1: 0,      x2: WORLD_W * 0.67, y2: WORLD_H * 0.33 },
  { name: 'The Hills',  x1: WORLD_W * 0.67, y1: 0,      x2: WORLD_W,        y2: WORLD_H * 0.33 },
  { name: 'Midtown',    x1: 0,          y1: WORLD_H * 0.33, x2: WORLD_W * 0.33, y2: WORLD_H * 0.67 },
  { name: 'Downtown',   x1: WORLD_W * 0.33, y1: WORLD_H * 0.33, x2: WORLD_W * 0.67, y2: WORLD_H * 0.67 },
  { name: 'East Side',  x1: WORLD_W * 0.67, y1: WORLD_H * 0.33, x2: WORLD_W,        y2: WORLD_H * 0.67 },
  { name: 'The Docks',  x1: 0,          y1: WORLD_H * 0.67, x2: WORLD_W * 0.33, y2: WORLD_H },
  { name: 'Industrial', x1: WORLD_W * 0.33, y1: WORLD_H * 0.67, x2: WORLD_W * 0.67, y2: WORLD_H },
  { name: 'Southgate',  x1: WORLD_W * 0.67, y1: WORLD_H * 0.67, x2: WORLD_W,        y2: WORLD_H },
];
let currentDistrict = '';
let districtNameTimer = 0;
let districtDisplayName = '';

// --- HUD elements ---
const hudMoney = document.getElementById('hud-money');
const hudWanted = document.getElementById('hud-wanted');
const hudVehicle = document.getElementById('hud-vehicle');
const healthFill = document.getElementById('health-fill');
const hudFps = document.getElementById('hud-fps');
const missionTracker = document.getElementById('mission-tracker');

// --- Notification ---
let notification = null;
let notificationTimer = 0;
function showNotification(text, duration = 2.5) {
  notification = text;
  notificationTimer = duration;
}

let interactPrompt = null;
let vehiclePrompt = null;
let frameCount = 0;
let fpsTime = 0;
let displayFps = 0;
let saveTimer = 0;
let stepTimer = 0;

const TICK_RATE = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;

function gameLoop(now) {
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frameDt;

  fpsTime += frameDt;
  frameCount++;
  if (fpsTime >= 1) {
    displayFps = frameCount;
    frameCount = 0;
    fpsTime = 0;
  }

  // Mouse look (applied per-frame for smoothness) — skip when terminal/menus open
  const mdx = consumeMouseDX();
  if (!inVehicle && !aiTerminal.isOpen) {
    player.angle += mdx * player.mouseSensitivity;
  }

  // Shooting / attacking
  const wantsAttack = currentWeapon && !inVehicle && !aiTerminal.isOpen && weaponCooldown <= 0
    && (currentWeapon.shootType === 'auto' ? isMouseHeld() : wasMouseClicked());

  if (wantsAttack) {
    const hasAmmo = currentWeapon.ammo === Infinity || currentWeapon.ammo > 0;
    if (hasAmmo) {
      if (currentWeapon.ammo !== Infinity) currentWeapon.ammo--;
      weaponCooldown = 1 / currentWeapon.fireRate;
      weaponRecoil = 1;

      const pcx = player.x + player.w / 2;
      const pcy = player.y + player.h / 2;

      if (currentWeapon.shootType === 'thrown') {
        // --- Thrown grenade ---
        const throwSpeed = 300;
        thrownGrenades.push({
          x: pcx + Math.cos(player.angle) * 22,
          y: pcy + Math.sin(player.angle) * 22,
          vx: Math.cos(player.angle) * throwSpeed,
          vy: Math.sin(player.angle) * throwSpeed,
          timer: 2.5,
        });
        playBlip(280, 0.07);
        showNotification('Grenade thrown!');

      } else if (currentWeapon.shootType === 'melee') {
        // --- Melee: combo system ---
        if (comboTimer > 0) {
          comboCount = Math.min(comboCount + 1, COMBO_MAX);
        } else {
          comboCount = 1;
        }
        comboTimer = COMBO_WINDOW;
        meleeSwingTimer = 0.35;
        const comboDamageMultiplier = 1 + comboCount * 0.3; // 1.3x, 1.6x, 1.9x, 2.2x
        const comboKnockback = 180 + comboCount * 60; // increasing knockback
        playComboHit(comboCount);
        if (comboCount >= 3) {
          renderer.triggerScreenShake(0.6 * comboCount);
        }
        const meleeRange = currentWeapon.range * TILE_SIZE;
        let hitAny = false;
        for (const npc of npcs) {
          const dx = npc.x - pcx;
          const dy = npc.y - pcy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > meleeRange) continue;
          const toNpc = Math.atan2(dy, dx);
          let ad = toNpc - player.angle;
          ad = ((ad + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(ad) < 0.9) {
            npc.takeDamage(Math.ceil(currentWeapon.damage * comboDamageMultiplier));
            particles.emitBlood(npc.x, npc.y);
            npc.vx = (dx / (dist || 1)) * comboKnockback;
            npc.vy = (dy / (dist || 1)) * comboKnockback;
            if (!npc.dead) { npc.fleeing = true; npc.fleeTimer = 3; }
            hitMarkerTimer = 0.2;
            hitAny = true;
            if (wantedLevel < 5) { wantedLevel++; wantedDecayTimer = 0; }
          }
        }
        if (hitAny && comboCount >= 2) {
          showNotification(`${comboCount}x COMBO!`);
        }
      } else {
        // --- Ranged: hitscan (single or multi-pellet) ---
        muzzleFlashTimer = 0.08;
        playGunshot(currentWeapon.shootType === 'auto' ? 'auto' : 'single');
        particles.emitMuzzleSparks(
          pcx + Math.cos(player.angle) * 20,
          pcy + Math.sin(player.angle) * 20,
          player.angle
        );

        const pellets = currentWeapon.pellets || 1;
        const maxRange = currentWeapon.range * TILE_SIZE;

        for (let p = 0; p < pellets; p++) {
          const shootAngle = player.angle + (Math.random() - 0.5) * currentWeapon.spread;

          let bestHit = null;
          let bestDist = maxRange;
          for (const npc of npcs) {
            const dx = npc.x - pcx;
            const dy = npc.y - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxRange || dist < 10) continue;
            const toNpc = Math.atan2(dy, dx);
            let ad = toNpc - shootAngle;
            ad = ((ad + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            if (Math.abs(ad) < Math.atan2(16, dist) && dist < bestDist) {
              bestDist = dist;
              bestHit = npc;
            }
          }

          if (bestHit) {
            hitMarkerTimer = 0.2;
            const dx = bestHit.x - pcx;
            const dy = bestHit.y - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            bestHit.x += (dx / dist) * 15;
            bestHit.y += (dy / dist) * 15;
            particles.emitBlood(bestHit.x, bestHit.y);
            renderer.triggerScreenShake(0.8);
            bestHit.takeDamage(currentWeapon.damage);
            if (!bestHit.dead) {
              bestHit.fleeing = true;
              bestHit.fleeTimer = 4;
              bestHit.vx = (dx / dist) * 200;
              bestHit.vy = (dy / dist) * 200;
            }
            if (wantedLevel < 5) { wantedLevel++; wantedDecayTimer = 0; }
          }
        }

        // All nearby NPCs flee from gunfire
        for (const npc of npcs) {
          const dx = npc.x - pcx;
          const dy = npc.y - pcy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200 && !npc.fleeing) {
            npc.fleeing = true;
            npc.fleeTimer = 2 + Math.random() * 2;
            npc.vx = (dx / (dist || 1)) * npc.speed * 2;
            npc.vy = (dy / (dist || 1)) * npc.speed * 2;
            if (dist < 120) npc.reactToGunfire();
          }
        }
      }
    }
  }

  // Sync currentWeapon from inventory
  currentWeapon = weaponInventory.current;

  // Input
  if (wasKeyPressed('KeyM') && !aiTerminal.isOpen && !shopSystem.isOpen) { marketplace.toggle(); playClick(); }
  if (wasKeyPressed('KeyT') && !marketplace.isOpen && !shopSystem.isOpen) { aiTerminal.toggle(); playClick(); }
  if (wasKeyPressed('KeyV') && !aiTerminal.isOpen && !marketplace.isOpen && !shopSystem.isOpen) { visualEditor.toggle(); playClick(); }
  if (wasKeyPressed('Escape')) {
    // Close open menus first, or open pause
    if (marketplace.isOpen) { marketplace.close(); }
    else if (aiTerminal.isOpen) { aiTerminal.close(); }
    else if (shopSystem.isOpen) { shopSystem.close(); }
    else if (visualEditor.isOpen) { visualEditor.close(); }
    else if (propertySystem.isOpen) { propertySystem.close(); }
    else {
      openPause();
      playClick();
    }
  }
  if (wasKeyPressed('KeyR') && !aiTerminal.isOpen && !marketplace.isOpen) {
    const ch = radio.nextChannel();
    showNotification(`Radio: ${ch.name}`);
    playClick();
  }
  if (wasKeyPressed('F5')) {
    try {
      if (saveGame(player, missionEngine, buildSaveState())) {
        showNotification('Game saved! (Slot 1)');
        flashAutosave();
        playClick();
      }
    } catch (err) {
      showNotification('Save failed!');
      console.error('Save error:', err);
    }
  }

  // Weapon switching with scroll wheel or number keys
  if (!aiTerminal.isOpen && !marketplace.isOpen && !shopSystem.isOpen) {
    if (wasKeyPressed('Digit1')) { weaponInventory.selectByNumber(1); playWeaponSwitch(); }
    if (wasKeyPressed('Digit2')) { weaponInventory.selectByNumber(2); playWeaponSwitch(); }
    if (wasKeyPressed('Digit3')) { weaponInventory.selectByNumber(3); playWeaponSwitch(); }
    if (wasKeyPressed('Digit4')) { weaponInventory.selectByNumber(4); playWeaponSwitch(); }
    if (wasKeyPressed('Digit5')) { weaponInventory.selectByNumber(5); playWeaponSwitch(); }
    if (wasKeyPressed('Tab')) { weaponInventory.next(); playWeaponSwitch(); }
  }

  // Mobile controls input integration
  if (mobileControls.active) {
    const mov = mobileControls.getMovement();
    const lookDx = mobileControls.consumeLookDX();
    if (!inVehicle) player.angle += lookDx;
    // Mobile fire button
    if (mobileControls.buttons.fire.pressed && currentWeapon && !inVehicle && weaponCooldown <= 0) {
      // Simulate mouse click for shooting
    }
    if (mobileControls.wasJustPressed('interact') && !shopSystem.isOpen) {
      // Simulate E key press
    }
    if (mobileControls.wasJustPressed('vehicle')) {
      // Simulate F key press
    }
    if (mobileControls.wasJustPressed('weapon')) {
      weaponInventory.next();
      playWeaponSwitch();
    }
    mobileControls.clearJustPressed();
  }

  // Shop interaction
  if (shopSystem.isOpen) {
    if (wasKeyPressed('KeyW') || wasKeyPressed('ArrowUp')) { shopSystem.navigateUp(); playClick(); }
    if (wasKeyPressed('KeyS') || wasKeyPressed('ArrowDown')) { shopSystem.navigateDown(); playClick(); }
    if (wasKeyPressed('KeyE') || wasKeyPressed('Enter')) {
      const result = shopSystem.purchase(money);
      if (result && result.success) {
        money -= result.cost;
        playCashRegister();
        const item = result.item;
        if (item.type === 'weapon') {
          weaponInventory.add(item.weaponType);
          showNotification(`Bought ${item.label}!`);
        } else if (item.type === 'ammo' && currentWeapon && currentWeapon.ammo !== Infinity) {
          currentWeapon.ammo += item.amount;
          showNotification(`+${item.amount} Ammo`);
        } else if (item.type === 'health') {
          health = Math.min(100, health + item.amount);
          showNotification(`+${item.amount} Health`);
        } else if (item.type === 'armor') {
          armor = Math.min(100, armor + item.amount);
          showNotification(`+${item.amount} Armor`);
        } else if (item.type === 'vehicle') {
          const v = new Vehicle(player.x + 60, player.y, item.vehicleType);
          vehicles.push(v);
          showNotification(`${item.label} delivered!`);
        }
      } else if (result) {
        playBlip(150, 0.15);
      }
    }
    if (wasKeyPressed('Escape')) { shopSystem.close(); playClick(); }
  }

  // Enter/Exit vehicle (F key)
  if (wasKeyPressed('KeyF')) {
    if (inVehicle) {
      inVehicle.occupied = false;
      player.x = inVehicle.x + 30;
      player.y = inVehicle.y;
      player.angle = inVehicle.angle;
      inVehicle = null;
      stopEngineLoop();
      showNotification('Exited vehicle');
      playClick();
    } else {
      const nearV = findNearestVehicle();
      if (nearV) {
        inVehicle = nearV;
        nearV.occupied = true;
        showNotification(`Entered ${nearV.name}`);
        playClick();
      }
    }
  }

  // Skip update/render when paused
  if (gamePaused) {
    clearJustPressed();
    requestAnimationFrame(gameLoop);
    return;
  }

  while (accumulator >= TICK_RATE) {
    if (!aiTerminal.isOpen) {
      try {
        update(TICK_RATE);
      } catch (err) {
        console.error('Update error:', err);
        // Don't crash the loop — skip this tick
      }
    }
    accumulator -= TICK_RATE;
  }

  try {
    render();
  } catch (err) {
    console.error('Render error:', err);
  }
  clearJustPressed();
  requestAnimationFrame(gameLoop);
}

function findNearestVehicle() {
  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;
  let best = null;
  let bestDist = 60;
  for (const v of vehicles) {
    if (v.occupied) continue;
    const dx = v.x - px;
    const dy = v.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

function buildSaveState() {
  return {
    money,
    health,
    armor,
    wantedLevel,
    weapons: weaponInventory.slots.map(w => ({ type: w.type, ammo: w.ammo })),
  };
}

function update(dt) {
  // Death state
  if (isDead) {
    deathTimer -= dt;
    if (deathTimer <= 0) {
      // Respawn
      isDead = false;
      health = 100;
      const rs = findSpawnOnRoad(worldMap, WORLD_COLS, WORLD_ROWS);
      player.x = rs.x;
      player.y = rs.y;
      money = Math.max(0, money - RESPAWN_COST);
      wantedLevel = 0;
      if (inVehicle) {
        inVehicle.occupied = false;
        inVehicle = null;
        stopEngineLoop();
      }
      showNotification(`Respawned. -$${RESPAWN_COST}`);
    }
    return;
  }

  // Day/night cycle
  timeOfDay = (timeOfDay + DAY_SPEED * dt) % 1;
  const nightCurve = Math.cos(timeOfDay * Math.PI * 2) * 0.5 + 0.5;
  renderer.setNightAlpha(nightCurve);
  renderer.setTimeOfDay(timeOfDay);

  // Weather
  weather.update(dt, timeOfDay);

  // Ambient city sounds
  updateAmbientCity(dt, timeOfDay, weather.rainIntensity);
  updateRainSound(weather.rainIntensity);

  // Bird chirps (daytime only, random interval)
  const isDaytime = timeOfDay > 0.2 && timeOfDay < 0.8;
  if (isDaytime && !inVehicle) {
    birdTimer -= dt;
    if (birdTimer <= 0) {
      playBirdChirp();
      birdTimer = 12 + Math.random() * 18;
    }
  }

  // Crowd murmur (daytime, random)
  if (isDaytime) {
    crowdTimer -= dt;
    if (crowdTimer <= 0) {
      playCrowdMurmur();
      crowdTimer = 8 + Math.random() * 15;
    }
  }

  // Particles
  particles.update(dt);

  // Traffic lights — cycle phases
  for (const tl of trafficLights) {
    tl.timer -= dt;
    if (tl.timer <= 0) {
      if (tl.phase === 'green') {
        tl.phase = 'yellow';
        tl.timer = 3;
      } else if (tl.phase === 'yellow') {
        tl.phase = 'red';
        tl.timer = 20 + Math.random() * 5;
      } else {
        tl.phase = 'green';
        tl.timer = 20 + Math.random() * 5;
      }
    }
  }

  // Wanted decay
  if (wantedLevel > 0) {
    wantedDecayTimer += dt;
    if (wantedDecayTimer > 15) {
      wantedLevel = Math.max(0, wantedLevel - 1);
      wantedDecayTimer = 0;
    }
  }

  const playerCX = player.x + player.w / 2;
  const playerCY = player.y + player.h / 2;

  if (inVehicle) {
    // --- Vehicle mode ---
    inVehicle.update(dt);

    // Vehicle collision with solids
    const vAABB = inVehicle.getAABB();
    const solids = getSolidRectsNear(worldMap, inVehicle.x, inVehicle.y, 80);
    for (const solid of solids) {
      if (aabbOverlap(vAABB, solid)) {
        resolveCollision(vAABB, solid);
        inVehicle.x = vAABB.x + vAABB.w / 2;
        inVehicle.y = vAABB.y + vAABB.h / 2;
        inVehicle.speed *= 0.5;
      }
    }

    inVehicle.x = Math.max(40, Math.min(inVehicle.x, WORLD_W - 40));
    inVehicle.y = Math.max(40, Math.min(inVehicle.y, WORLD_H - 40));

    // Sync player to vehicle
    player.x = inVehicle.x - player.w / 2;
    player.y = inVehicle.y - player.h / 2;
    player.angle = inVehicle.angle - Math.PI / 2; // vehicle angle faces "up", camera faces forward

    // Check if hitting NPCs
    for (const npc of npcs) {
      const dx = inVehicle.x - npc.x;
      const dy = inVehicle.y - npc.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && Math.abs(inVehicle.speed) > 100) {
        npc.x += dx * 0.5;
        npc.y += dy * 0.5;
        npc.fleeing = true;
        npc.fleeTimer = 3;
        if (wantedLevel < 5) {
          wantedLevel++;
          wantedDecayTimer = 0;
          showNotification('Wanted level increased!');
        }
      }
    }

    // Destructible props — vehicle smashes through them
    if (Math.abs(inVehicle.speed) > 80) {
      for (let i = streetProps.length - 1; i >= 0; i--) {
        const sp = streetProps[i];
        if (destroyedProps.has(i)) continue;
        const dx = inVehicle.x - sp.x;
        const dy = inVehicle.y - sp.y;
        if (dx * dx + dy * dy < 25 * 25) {
          destroyedProps.add(i);
          particles.emitPropDebris(sp.x, sp.y, sp.propType);
          playPropBreak(sp.propType);
          inVehicle.takeDamage(3);
          renderer.triggerScreenShake(0.5);
          // Hydrant geyser — spawns water particles for a while
          if (sp.propType === 'hydrant') {
            sp._geyserTimer = 8; // seconds of water spray
          }
        }
      }
    }

    // Engine sound
    playEngineLoop(inVehicle.speed, inVehicle.maxSpeed);

    // Tire screech when drifting
    updateTireScreech(inVehicle.drifting ? inVehicle.driftIntensity : 0);

    // Tire smoke — always when drifting, or fast cornering
    tireTimer -= dt;
    const tireSmokeInterval = inVehicle.drifting ? 0.04 : 0.08;
    if ((inVehicle.drifting || Math.abs(inVehicle.speed) > 200) && tireTimer <= 0) {
      particles.emitTireSmoke(inVehicle.x, inVehicle.y, Math.abs(inVehicle.speed));
      tireTimer = tireSmokeInterval;
    }

    // Speed lines effect
    const speedFrac = Math.abs(inVehicle.speed) / inVehicle.maxSpeed;
    renderer.setSpeedLines(speedFrac > 0.6 ? (speedFrac - 0.6) / 0.4 : 0);

    camera.follow({ x: inVehicle.x - CANVAS_W / 4, y: inVehicle.y - CANVAS_H / 4, w: CANVAS_W / 2, h: CANVAS_H / 2 }, dt);
  } else {
    // --- On foot ---
    // Check if player is in water
    const footCol = Math.floor(playerCX / TILE_SIZE);
    const footRow = Math.floor(playerCY / TILE_SIZE);
    const wasSwimming = isSwimming;
    isSwimming = false;
    if (footRow >= 0 && footCol >= 0 && footRow < worldMap.length && footCol < worldMap[0].length) {
      isSwimming = worldMap[footRow][footCol] === 4; // WATER tile
    }

    // Entering water — splash effect
    if (isSwimming && !wasSwimming) {
      playWaterSplash();
      particles.emitSplash(playerCX, playerCY);
      showNotification('Swimming — move slowly');
    }

    // Sprint handling
    isSprinting = isKeyDown('ShiftLeft') || isKeyDown('ShiftRight');
    if (isSwimming) {
      player.speed = SWIM_SPEED;
      isSprinting = false;
      // Swimming drains stamina slowly
      stamina = Math.max(0, stamina - 8 * dt);
      // Swim stroke sound
      swimStrokeTimer -= dt;
      if (swimStrokeTimer <= 0 && (Math.abs(player.vx) > 10 || Math.abs(player.vy) > 10)) {
        playSwimStroke();
        swimStrokeTimer = 0.6;
      }
      // Drown if stamina runs out
      if (stamina <= 0) {
        health -= 15 * dt;
        if (health > 0 && Math.random() < dt) showNotification('Drowning!');
      }
    } else if (isSprinting && stamina > 0) {
      player.speed = SPRINT_SPEED;
      stamina = Math.max(0, stamina - 25 * dt);
      if (stamina <= 0) isSprinting = false;
    } else {
      player.speed = WALK_SPEED;
      if (!isSprinting) stamina = Math.min(100, stamina + 15 * dt);
    }

    player.update(dt);

    // Head bob
    const isMoving = Math.abs(player.vx) > 30 || Math.abs(player.vy) > 30;
    if (isMoving) {
      const bobSpeed = isSprinting ? 14 : 9;
      headBobPhase += dt * bobSpeed;
      headBobAmount = Math.min(headBobAmount + dt * 6, 1);
    } else {
      headBobAmount = Math.max(headBobAmount - dt * 4, 0);
    }

    // Footstep sounds + dust
    if (isMoving) {
      const stepInterval = isSprinting ? 0.18 : 0.28;
      stepTimer -= dt;
      if (stepTimer <= 0) {
        playStep();
        stepTimer = stepInterval;
        if (isSprinting) {
          particles.emitDustKick(player.x + player.w / 2, player.y + player.h / 2);
        }
      }
    } else {
      stepTimer = 0;
    }

    // Clear speed lines and tire screech when on foot
    renderer.setSpeedLines(0);
    updateTireScreech(0);

    // Collision
    const solids = getSolidRectsNear(worldMap, playerCX, playerCY, 80);
    for (const solid of solids) {
      if (aabbOverlap(player, solid)) {
        resolveCollision(player, solid);
      }
    }

    player.x = Math.max(0, Math.min(player.x, WORLD_W - player.w));
    player.y = Math.max(0, Math.min(player.y, WORLD_H - player.h));

    camera.follow(player, dt);
  }

  camera.clamp(WORLD_W, WORLD_H);

  // Vehicle proximity prompt
  if (!inVehicle) {
    const nearV = findNearestVehicle();
    vehiclePrompt = nearV ? `Press F: Enter ${nearV.name}` : null;
  } else {
    vehiclePrompt = 'Press F: Exit vehicle';
  }

  // Mission checks
  const prevCompleted = missionEngine.completedIds.size;
  const activeM = missionEngine.activeMissions[0];
  const prevObjIdx = activeM ? activeM.currentObjective : -1;

  const nearMission = missionEngine.getAvailableMissionNear(playerCX, playerCY);
  interactPrompt = nearMission ? `Press E: ${nearMission.data.name}` : null;
  // Quest prompt set later (after quest NPCs checked)

  if (nearMission && wasKeyPressed('KeyE')) {
    missionEngine.acceptMission(nearMission);
    interactPrompt = null;
    playAccept();
    showNotification(`Mission: ${nearMission.data.name}`);
  }

  const missionResult = missionEngine.update(playerCX, playerCY, dt);

  if (missionResult.objectiveCompleted) {
    playObjectiveComplete();
    showNotification('Objective complete!');
    money += 50;
  }
  if (missionResult.missionCompleted) {
    playMissionComplete();
    money += 200;
    showNotification('Mission complete! +$200');
  }
  if (missionResult.missionFailed) {
    playBlip(150, 0.3);
    renderer.triggerDamageFlash(0.3);
    showNotification(missionResult.failMessage || 'Mission failed!');
  }

  // Update NPCs
  const playerSpd = inVehicle ? Math.abs(inVehicle.speed) : Math.sqrt(player.vx ** 2 + player.vy ** 2);
  for (const npc of npcs) {
    npc.update(dt, worldMap, TILE_SIZE, playerCX, playerCY, !!inVehicle, playerSpd, timeOfDay);
  }
  // Remove dead NPCs after despawn timer
  for (let i = npcs.length - 1; i >= 0; i--) {
    if (npcs[i].dead && npcs[i].deathTimer <= 0) {
      npcs.splice(i, 1);
    }
  }

  // NPC greetings — find nearest NPC within greeting range and trigger speech
  if (!inVehicle) {
    let closestNPC = null;
    let closestDist = 75;
    for (const npc of npcs) {
      const dx = npc.x - playerCX;
      const dy = npc.y - playerCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closestDist = dist; closestNPC = npc; }
    }
    if (closestNPC) {
      const isNight = timeOfDay < 0.2 || timeOfDay > 0.8;
      const greeted = closestNPC.tryGreet(closestDist, isNight);
      if (greeted) playNPCVoice();
    }
  }

  // NPC side quests — find nearby quest giver and handle acceptance/completion
  if (!inVehicle && !activeQuest) {
    questNearby = null;
    let qBestDist = 70;
    for (const sq of sideQuests) {
      if (sq.state !== 'available') continue;
      if (!sq.npc || sq.npc.dead) continue;
      const dx = sq.npc.x - playerCX;
      const dy = sq.npc.y - playerCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < qBestDist) { qBestDist = dist; questNearby = sq; }
    }
    if (questNearby && wasKeyPressed('KeyE') && !missionEngine.getAvailableMissionNear(playerCX, playerCY)) {
      activeQuest = questNearby;
      questNearby.state = 'active';
      questNearby = null;
      playAccept();
      showNotification(`Side job: ${activeQuest.title} (+$${activeQuest.reward})`);
      // NPC says intro line
      activeQuest.npc.speechText = activeQuest.intro || 'Thanks. Mark is on your radar.';
      activeQuest.npc.speechTimer = 4;
      playNPCVoice();
    }
  }
  // Check active quest completion
  if (activeQuest && !inVehicle) {
    const dx = playerCX - activeQuest.targetX;
    const dy = playerCY - activeQuest.targetY;
    if (dx * dx + dy * dy < activeQuest.radius * activeQuest.radius) {
      money += activeQuest.reward;
      playMissionComplete();
      const outroSnip = (activeQuest.outro || 'Good work.').slice(0, 38);
      showNotification(`"${outroSnip}" — +$${activeQuest.reward}`);
      // NPC speech callback if still alive and nearby
      if (activeQuest.npc && !activeQuest.npc.dead) {
        activeQuest.npc.speechText = activeQuest.outro || 'Good work.';
        activeQuest.npc.speechTimer = 3.5;
      }
      activeQuest.state = 'done';
      activeQuest = null;
      questNearby = null;
    }
  }

  // Update traffic vehicles (only those within ~1200px of player for perf)
  const TRAFFIC_CULL_DIST = 1200 * 1200;
  for (const tv of trafficVehicles) {
    if (!tv.alive) continue;
    const tdx = tv.x - playerCX;
    const tdy = tv.y - playerCY;
    if (tdx * tdx + tdy * tdy > TRAFFIC_CULL_DIST) continue;
    const shouldHonk = tv.update(dt, worldMap, TILE_SIZE, playerCX, playerCY, trafficVehicles, trafficLights);
    if (shouldHonk) playHonk();
  }
  // Respawn dead traffic vehicles to keep count consistent
  for (let i = trafficVehicles.length - 1; i >= 0; i--) {
    if (!trafficVehicles[i].alive) trafficVehicles.splice(i, 1);
  }
  if (trafficVehicles.length < 18) {
    const newBatch = spawnTraffic(worldMap, TILE_SIZE, 5);
    for (const t of newBatch) trafficVehicles.push(t);
  }

  // Police spawn/despawn based on wanted level
  copSpawnCooldown = Math.max(0, copSpawnCooldown - dt);
  const targetCops = wantedLevel >= 5 ? 3 : wantedLevel >= 4 ? 2 : wantedLevel >= 3 ? 1 : 0;
  if (copVehicles.length < targetCops && copSpawnCooldown <= 0) {
    copVehicles.push(spawnCopNear(playerCX, playerCY, WORLD_W, WORLD_H));
    copSpawnCooldown = 5;
  }
  // Remove cops when wanted level clears
  if (wantedLevel < 3 && copVehicles.length > 0) {
    copVehicles.length = 0;
  }

  // Update cop vehicles
  updateSiren(dt, wantedLevel);
  for (let i = copVehicles.length - 1; i >= 0; i--) {
    const cop = copVehicles[i];
    const dist = cop.update(dt, playerCX, playerCY);
    // Ram player (deal damage if close and moving fast)
    if (dist < 35 && cop.ramCooldown <= 0) {
      health = Math.max(0, health - 10);
      renderer.triggerDamageFlash(0.5);
      renderer.triggerScreenShake(1.5);
      cop.ramCooldown = 2;
      showNotification('Busted by police! -10 HP');
    }
    // Remove if too far (player escaped)
    const cdx = cop.x - playerCX;
    const cdy = cop.y - playerCY;
    if (cdx * cdx + cdy * cdy > 2400 * 2400) {
      copVehicles.splice(i, 1);
    }
  }

  // --- Gang system update ---
  const gangResult = gangSystem.update(dt, playerCX, playerCY, worldMap, TILE_SIZE);
  // Process enemy shots hitting player
  for (const shot of gangResult.shots) {
    const dx = playerCX - shot.fromX;
    const dy = playerCY - shot.fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < shot.range) {
      // Simple hit check — angle-based
      const toPlayer = Math.atan2(dy, dx);
      let angleDiff = toPlayer - shot.angle;
      angleDiff = ((angleDiff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(angleDiff) < 0.2) {
        const damage = shot.damage * (1 - dist / shot.range * 0.5);
        // Armor absorbs damage first
        if (armor > 0) {
          const absorbed = Math.min(armor, damage * 0.7);
          armor -= absorbed;
          health -= (damage - absorbed);
        } else {
          health -= damage;
        }
        health = Math.max(0, health);
        renderer.triggerDamageFlash(0.4);
        renderer.triggerScreenShake(0.5);
        playEnemyGunshot();
      }
    }
  }
  // Show ambient event notifications
  for (const note of gangResult.notifications) {
    showNotification(note);
  }

  // --- Shop system update ---
  shopSystem.update(dt);
  const nearbyShop = shopSystem.getNearbyShop(playerCX, playerCY);
  if (nearbyShop && !shopSystem.isOpen && !inVehicle) {
    if (wasKeyPressed('KeyE') && !interactPrompt && !questNearby) {
      shopSystem.open(nearbyShop);
      playDoorOpen();
    }
    if (!interactPrompt && !questNearby) {
      interactPrompt = `Press E: ${nearbyShop.def.name}`;
    }
  }

  // --- Interior system update ---
  interiorSystem.update(dt);
  if (!inVehicle && !interiorSystem.activeInterior) {
    const nearbyDoor = interiorSystem.getNearbyDoor(playerCX, playerCY);
    if (nearbyDoor && wasKeyPressed('KeyE') && !interactPrompt && !questNearby && !nearbyShop) {
      const interior = interiorSystem.enterInterior(nearbyDoor);
      if (interior) {
        playDoorOpen();
        showNotification(`Entering ${interior.name}`);
      }
    }
  }

  // --- Vehicle damage update ---
  for (const v of vehicles) {
    const exploded = v.updateDamage(dt);
    if (exploded) {
      playExplosion();
      particles.emitExplosion(v.x, v.y);
      renderer.triggerScreenShake(3);
      if (inVehicle === v) {
        inVehicle = null;
        stopEngineLoop();
        health = Math.max(0, health - 40);
        renderer.triggerDamageFlash(0.8);
        showNotification('Vehicle destroyed!');
      }
    }
    // Emit smoke particles when damaged
    if (v.damageLevel >= 3 && v.smokeTimer <= 0 && !v.destroyed) {
      particles.emitTireSmoke(v.x, v.y - 10, 50);
      v.smokeTimer = 0.3;
    }
  }

  // Vehicle collision damage
  if (inVehicle && !inVehicle.destroyed) {
    const impactSpeed = Math.abs(inVehicle.speed);
    // Check wall collision damage
    const vAABB = inVehicle.getAABB();
    const vSolids = getSolidRectsNear(worldMap, inVehicle.x, inVehicle.y, 60);
    for (const solid of vSolids) {
      if (aabbOverlap(vAABB, solid) && impactSpeed > 200) {
        const dmg = (impactSpeed - 200) * 0.05;
        inVehicle.takeDamage(dmg);
        playCarCrash();
        health = Math.max(0, health - dmg * 0.3);
        renderer.triggerScreenShake(1);
      }
    }
  }

  // --- Roadblock spawning at wanted level 4+ ---
  if (wantedLevel >= 4) {
    roadblockCooldown -= dt;
    if (roadblocks.length < 2 && roadblockCooldown <= 0) {
      const block = spawnRoadblock(playerCX, playerCY, player.angle, worldMap, TILE_SIZE, WORLD_W, WORLD_H);
      if (block) {
        roadblocks.push(block);
        for (const cop of block.cops) copVehicles.push(cop);
        showNotification('Police roadblock ahead!');
      }
      roadblockCooldown = 15;
    }
  }
  // Clear roadblocks when wanted level drops
  if (wantedLevel < 3) {
    roadblocks.length = 0;
  }

  // --- Police helicopter at wanted level 5 ---
  if (wantedLevel >= 5 && !helicopter) {
    helicopter = new PoliceHelicopter(playerCX, playerCY);
    updateHelicopterSound(true);
    showNotification('Police helicopter deployed!');
  }
  if (helicopter) {
    if (wantedLevel < 4) {
      helicopter = null;
      updateHelicopterSound(false);
    } else {
      const heliShot = helicopter.update(dt, playerCX, playerCY);
      if (heliShot) {
        // Helicopter fires at player
        const dx = playerCX - heliShot.fromX;
        const dy = playerCY - heliShot.fromY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < heliShot.range) {
          const hitChance = 0.4; // 40% accuracy
          if (Math.random() < hitChance) {
            if (armor > 0) {
              const absorbed = Math.min(armor, heliShot.damage * 0.7);
              armor -= absorbed;
              health -= (heliShot.damage - absorbed);
            } else {
              health -= heliShot.damage;
            }
            health = Math.max(0, health);
            renderer.triggerDamageFlash(0.3);
            playEnemyGunshot();
          }
        }
      }
    }
  }

  // --- Property system ---
  if (!inVehicle && !propertySystem.isOpen) {
    const nearProp = propertySystem.getNearbyProperty(playerCX, playerCY);
    if (nearProp && !interactPrompt && !questNearby && !shopSystem.isOpen) {
      const owned = propertySystem.isOwned(nearProp.def.id);
      interactPrompt = `Press E: ${owned ? 'Enter' : 'Buy'} ${nearProp.def.name}`;
      if (wasKeyPressed('KeyE')) {
        propertySystem.open(nearProp);
        playDoorOpen();
      }
    }
  }
  if (propertySystem.isOpen) {
    if (wasKeyPressed('KeyW') || wasKeyPressed('ArrowUp')) { propertySystem.navigateUp(); playClick(); }
    if (wasKeyPressed('KeyS') || wasKeyPressed('ArrowDown')) { propertySystem.navigateDown(); playClick(); }
    if (wasKeyPressed('KeyE') || wasKeyPressed('Enter')) {
      const result = propertySystem.interact(money);
      if (result) {
        if (result.action === 'buy') {
          const buyResult = propertySystem.buy(result.property, money);
          if (buyResult.success) {
            money -= buyResult.cost;
            playPropertyBuy();
            showNotification(buyResult.message);
          } else {
            playBlip(150, 0.15);
            showNotification(buyResult.message);
          }
        } else if (result.action === 'save') {
          saveGame(player, missionEngine, buildSaveState());
          showNotification('Game saved at safehouse!');
          playClick();
        } else if (result.action === 'heal') {
          if (health < 100) {
            health = 100;
            armor = Math.min(100, armor + 50);
            showNotification('Healed to full! +50 Armor');
            playBlip(800, 0.1);
          } else {
            showNotification('Already at full health');
          }
        }
      }
    }
    if (wasKeyPressed('Escape')) { propertySystem.close(); playClick(); }
  }

  // Combo timer decay
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) comboCount = 0;
  }

  // --- Hydrant geyser particles ---
  for (const sp of streetProps) {
    if (sp._geyserTimer && sp._geyserTimer > 0) {
      sp._geyserTimer -= dt;
      if (Math.random() < dt * 8) {
        particles.emitSplash(sp.x, sp.y);
      }
    }
  }

  // --- Ambient random events ---
  ambientEventCooldown -= dt;
  if (ambientEventCooldown <= 0 && ambientEvents.length < 3) {
    ambientEventCooldown = 25 + Math.random() * 40;
    // Pick a random event near player
    const eventTypes = ['argument', 'street_performer', 'car_alarm', 'phone_crowd'];
    const evType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 300;
    const ex = playerCX + Math.cos(angle) * dist;
    const ey = playerCY + Math.sin(angle) * dist;
    // Make sure it's on a walkable tile
    const ec = Math.floor(ex / TILE_SIZE);
    const er = Math.floor(ey / TILE_SIZE);
    if (er >= 0 && ec >= 0 && er < worldMap.length && ec < worldMap[0].length) {
      const tile = worldMap[er][ec];
      if (tile === 0 || tile === 1 || tile === 7) {
        ambientEvents.push({
          type: evType,
          x: ex, y: ey,
          timer: 8 + Math.random() * 12,
        });
        // Trigger nearby NPC reactions
        for (const npc of npcs) {
          const ndx = npc.x - ex;
          const ndy = npc.y - ey;
          if (ndx * ndx + ndy * ndy < 120 * 120 && !npc.dead && !npc.fleeing) {
            if (evType === 'argument') {
              npc.speechText = ['Hey, back off!', 'You talking to me?!', 'Mind your business!'][Math.floor(Math.random() * 3)];
              npc.speechTimer = 3;
            } else if (evType === 'street_performer') {
              npc.speechText = ['Not bad!', '*clapping*', 'Play Freebird!'][Math.floor(Math.random() * 3)];
              npc.speechTimer = 3;
              npc.idleTimer = 4 + Math.random() * 3; // stop to watch
            } else if (evType === 'car_alarm') {
              npc.speechText = ['That alarm again...', 'Somebody shut that off!'][Math.floor(Math.random() * 2)];
              npc.speechTimer = 2;
            } else if (evType === 'phone_crowd') {
              npc.behavior = 'phone';
              npc.behaviorTimer = 5 + Math.random() * 5;
            }
          }
        }
        if (Math.sqrt((ex - playerCX) ** 2 + (ey - playerCY) ** 2) < 300) {
          const labels = {
            argument: 'Nearby argument',
            street_performer: 'Street performer nearby',
            car_alarm: 'Car alarm going off',
            phone_crowd: '',
          };
          if (labels[evType]) showNotification(labels[evType]);
        }
      }
    }
  }
  // Update ambient event timers
  for (let i = ambientEvents.length - 1; i >= 0; i--) {
    ambientEvents[i].timer -= dt;
    if (ambientEvents[i].timer <= 0) ambientEvents.splice(i, 1);
  }

  // --- NPC recording behavior (film nearby action with phones) ---
  if (wantedLevel >= 2 || comboCount >= 3) {
    for (const npc of npcs) {
      if (npc.dead || npc.fleeing) continue;
      const ndx = npc.x - playerCX;
      const ndy = npc.y - playerCY;
      const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
      if (ndist < 180 && ndist > 60 && npc.behavior !== 'phone' && Math.random() < dt * 0.3) {
        npc.behavior = 'phone';
        npc.behaviorTimer = 3 + Math.random() * 4;
        npc.speechText = ['*recording*', '*streaming live*', 'This is going viral!', 'WorldStar!'][Math.floor(Math.random() * 4)];
        npc.speechTimer = 2.5;
      }
    }
  }

  // Weapon cooldown & recoil
  if (weaponCooldown > 0) weaponCooldown -= dt;
  if (muzzleFlashTimer > 0) muzzleFlashTimer -= dt;
  if (hitMarkerTimer > 0) hitMarkerTimer -= dt;
  if (weaponRecoil > 0) weaponRecoil = Math.max(0, weaponRecoil - dt * 12);
  const playerMoving = !inVehicle && (Math.abs(player.vx) > 30 || Math.abs(player.vy) > 30);
  if (currentWeapon) weaponBobPhase += dt * (playerMoving ? 5 : 1.5);

  // --- Update thrown grenades ---
  for (let i = thrownGrenades.length - 1; i >= 0; i--) {
    const g = thrownGrenades[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= (1 - dt * 1.2);  // rolling friction
    g.vy *= (1 - dt * 1.2);
    g.timer -= dt;

    // Simple wall bounce — flip velocity if inside a solid tile
    const tC = Math.floor(g.x / TILE_SIZE);
    const tR = Math.floor(g.y / TILE_SIZE);
    if (tR >= 0 && tC >= 0 && tR < worldMap.length && tC < worldMap[0].length) {
      const t = worldMap[tR][tC];
      if (t === 2 || t === 5) { // BUILDING or WALL
        g.vx *= -0.5;
        g.vy *= -0.5;
        g.x += g.vx * dt * 2;
        g.y += g.vy * dt * 2;
      }
    }

    // Explode when fuse expires
    if (g.timer <= 0) {
      playExplosion();
      particles.emitExplosion(g.x, g.y);
      renderer.triggerScreenShake(4.5);
      muzzleFlashTimer = 0.18; // bright flash

      // Blast damage to NPCs
      const blastRadius = 110;
      for (const npc of npcs) {
        const dx = npc.x - g.x;
        const dy = npc.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < blastRadius) {
          const falloff = 1 - dist / blastRadius;
          npc.takeDamage(Math.ceil(80 * falloff));
          npc.vx = (dx / (dist || 1)) * 220 * falloff;
          npc.vy = (dy / (dist || 1)) * 220 * falloff;
          if (!npc.dead) { npc.fleeing = true; npc.fleeTimer = 5; }
          particles.emitBlood(npc.x, npc.y);
        }
      }
      // Blast damage to player
      const pdx = playerCX - g.x;
      const pdy = playerCY - g.y;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pDist < blastRadius) {
        const falloff = 1 - pDist / blastRadius;
        health = Math.max(0, health - Math.ceil(45 * falloff));
        renderer.triggerDamageFlash(0.7 * falloff);
      }
      if (wantedLevel < 5) { wantedLevel = Math.min(5, wantedLevel + 2); wantedDecayTimer = 0; }
      thrownGrenades.splice(i, 1);
    }
  }

  // Health/ammo pickup checks
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = p.x - playerCX;
    const dy = p.y - playerCY;
    if (dx * dx + dy * dy < 30 * 30) {
      if (p.type === 'health' && health < 100) {
        health = Math.min(100, health + 25);
        showNotification('+25 Health');
        playBlip(600, 0.08);
        particles.emitPickupSparkle(p.x, p.y);
        pickups.splice(i, 1);
      } else if (p.type === 'ammo' && weaponInventory.current && weaponInventory.current.ammo !== Infinity) {
        weaponInventory.current.ammo += 30;
        showNotification('+30 Ammo');
        playBlip(800, 0.08);
        particles.emitPickupSparkle(p.x, p.y);
        pickups.splice(i, 1);
      }
    }
  }

  // Weapon pickup checks (press E or auto-pickup on contact)
  {
    let nearestWeapon = null;
    let nearestDist = 45;
    for (const wp of weaponPickups) {
      const dx = wp.x - playerCX;
      const dy = wp.y - playerCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) { nearestDist = dist; nearestWeapon = wp; }
    }
    if (nearestWeapon && wasKeyPressed('KeyG')) {
      const def = WEAPON_DEFS[nearestWeapon.weaponType];
      weaponInventory.add(nearestWeapon.weaponType);
      weaponPickups.splice(weaponPickups.indexOf(nearestWeapon), 1);
      showNotification(`Picked up ${def.name}`);
      playBlip(900, 0.1);
      particles.emitPickupSparkle(nearestWeapon.x, nearestWeapon.y);
    }
    // Store for render prompt
    weaponNearby = nearestWeapon;
  }

  // Melee swing animation timer
  if (meleeSwingTimer > 0) meleeSwingTimer -= dt;

  // Death check
  if (health <= 0 && !isDead) {
    isDead = true;
    deathTimer = DEATH_RESPAWN_TIME;
    renderer.triggerDamageFlash(1);
    renderer.triggerScreenShake(3);
    showNotification('WASTED');
  }

  // Notification timer
  if (notificationTimer > 0) {
    notificationTimer -= dt;
    if (notificationTimer <= 0) notification = null;
  }

  // District tracking
  const districtEntry = WORLD_DISTRICTS.find(d =>
    playerCX >= d.x1 && playerCX < d.x2 && playerCY >= d.y1 && playerCY < d.y2
  );
  const newDistrictName = districtEntry ? districtEntry.name : '';
  if (newDistrictName && newDistrictName !== currentDistrict) {
    currentDistrict = newDistrictName;
    districtDisplayName = newDistrictName;
    districtNameTimer = 3.5;
  }
  if (districtNameTimer > 0) districtNameTimer -= dt;

  // Autosave (every 30 seconds)
  saveTimer += dt;
  if (saveTimer >= 30) {
    try {
      saveGame(player, missionEngine, buildSaveState());
      flashAutosave();
    } catch (err) {
      console.warn('Autosave failed:', err);
    }
    saveTimer = 0;
  }
}

function render() {
  // Build sprite list for raycaster
  const sprites = [];
  for (const npc of npcs) {
    if (npc.dead) continue;
    const [hr, hg, hb] = renderer._parseColor(npc.hatColor);
    sprites.push({
      x: npc.x, y: npc.y, color: npc.color, type: 'npc',
      skinTone: npc.skinTone,
      hairColor: npc.hairColor,
      hat: npc.hat,
      hatColorRGB: [hr, hg, hb],
      pantsColor: npc.pantsColor,
      bodyScale: npc.bodyScale,
    });
  }
  for (const v of vehicles) {
    if (v === inVehicle) continue;
    sprites.push({ x: v.x, y: v.y, color: v.color, type: 'vehicle' });
  }
  for (const tv of trafficVehicles) {
    if (!tv.alive) continue;
    sprites.push({ x: tv.x, y: tv.y, color: tv.color, type: 'vehicle' });
  }
  for (const cop of copVehicles) {
    sprites.push({ x: cop.x, y: cop.y, color: cop.sirenColor, type: 'vehicle' });
  }
  for (const p of pickups) {
    sprites.push({ x: p.x, y: p.y, color: p.type === 'health' ? '#ff4444' : '#ffaa22', type: 'pickup', pickupType: p.type });
  }
  // Weapon pickups
  const WEAPON_COLORS = { bat: '#c8a060', pistol: '#aaaaaa', shotgun: '#8B6914', smg: '#445566', rifle: '#556633', grenade: '#446633' };
  for (const wp of weaponPickups) {
    sprites.push({ x: wp.x, y: wp.y, color: WEAPON_COLORS[wp.weaponType] || '#888', type: 'pickup', pickupType: 'weapon' });
  }
  // Thrown grenades (render as small bouncing pickups)
  for (const g of thrownGrenades) {
    sprites.push({ x: g.x, y: g.y, color: g.timer < 0.8 ? '#ff8800' : '#446633', type: 'pickup', pickupType: 'grenade' });
  }
  // Gang hostile NPCs
  for (const h of gangSystem.hostiles) {
    if (h.dead) continue;
    sprites.push({
      x: h.x, y: h.y, color: h.color, type: 'npc',
      skinTone: h.skinTone, hairColor: h.hairColor,
      hat: h.hat, hatColorRGB: [parseInt(h.hatColor.slice(1,3),16)||100, parseInt(h.hatColor.slice(3,5),16)||50, parseInt(h.hatColor.slice(5,7),16)||50],
      pantsColor: h.pantsColor, bodyScale: h.bodyScale,
    });
  }
  // Shop markers
  for (const shop of shopSystem.shops) {
    sprites.push({ x: shop.x, y: shop.y, color: shop.def.color, type: 'pickup', pickupType: 'shop' });
  }
  // Property markers
  for (const prop of propertySystem.properties) {
    const owned = propertySystem.isOwned(prop.def.id);
    sprites.push({ x: prop.x, y: prop.y, color: owned ? '#44ff88' : '#ff8844', type: 'pickup', pickupType: 'property' });
  }
  // Helicopter (render as a dark sprite above)
  if (helicopter) {
    sprites.push({ x: helicopter.x, y: helicopter.y, color: '#333344', type: 'vehicle' });
  }
  for (const sl of streetlights) {
    sprites.push({ x: sl.x, y: sl.y, color: '#888888', type: 'streetlight' });
  }
  // Traffic lights — only render those within view distance
  const TL_CULL_SQ = 800 * 800;
  for (const tl of trafficLights) {
    const tdx = tl.x - (player.x + player.w / 2);
    const tdy = tl.y - (player.y + player.h / 2);
    if (tdx * tdx + tdy * tdy > TL_CULL_SQ) continue;
    sprites.push({ x: tl.x, y: tl.y, type: 'trafficlight', phase: tl.phase });
  }
  for (let i = 0; i < streetProps.length; i++) {
    if (destroyedProps.has(i)) continue;
    const sp = streetProps[i];
    sprites.push({ x: sp.x, y: sp.y, type: 'prop', propType: sp.propType });
  }
  // Show hydrant geysers as water sprites
  for (const sp of streetProps) {
    if (sp._geyserTimer && sp._geyserTimer > 0) {
      sprites.push({ x: sp.x, y: sp.y - 8, color: '#4488cc', type: 'pickup', pickupType: 'geyser' });
    }
  }

  // Mission markers + active side quest target
  const markers = missionEngine.getMarkers();
  if (activeQuest && activeQuest.state === 'active') {
    markers.push({ x: activeQuest.targetX, y: activeQuest.targetY, type: 'sidequest' });
  }

  // --- Raycaster render ---
  const bobOffset = Math.sin(headBobPhase) * 3 * headBobAmount;
  renderer.renderScene(player, worldMap, TILE_SIZE, sprites, markers, bobOffset, particles.particles);

  // --- HUD overlays (drawn on main canvas) ---
  const ctx = renderer.ctx;

  // Prompts at center-bottom
  if (vehiclePrompt) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '14px monospace';
    const tw = ctx.measureText(vehiclePrompt).width + 20;
    ctx.fillRect(CANVAS_W / 2 - tw / 2, CANVAS_H - 90, tw, 24);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(vehiclePrompt, CANVAS_W / 2, CANVAS_H - 72);
    ctx.textAlign = 'left';
  }
  // Weapon pickup prompt (above interact prompt)
  if (weaponNearby && !inVehicle) {
    const def = WEAPON_DEFS[weaponNearby.weaponType];
    const wPrompt = `Press G: Pick up ${def.name}`;
    ctx.font = '14px monospace';
    const wTw = ctx.measureText(wPrompt).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(CANVAS_W / 2 - wTw / 2, CANVAS_H - 148, wTw, 24);
    ctx.fillStyle = '#88ddff';
    ctx.textAlign = 'center';
    ctx.fillText(wPrompt, CANVAS_W / 2, CANVAS_H - 130);
    ctx.textAlign = 'left';
  }

  if (interactPrompt && !inVehicle) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.font = 'bold 28px monospace';
    const tw = ctx.measureText(interactPrompt).width + 40;
    ctx.fillRect(CANVAS_W / 2 - tw / 2, CANVAS_H - 175, tw, 46);
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(interactPrompt, CANVAS_W / 2, CANVAS_H - 143);
    ctx.textAlign = 'left';
  }

  // NPC speech bubbles — find nearest speaking NPC and show their text
  {
    let bestNPC = null;
    let bestDist = 200;
    for (const npc of npcs) {
      if (!npc.speechText || npc.dead) continue;
      const dx = npc.x - (player.x + player.w / 2);
      const dy = npc.y - (player.y + player.h / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) { bestDist = dist; bestNPC = npc; }
    }
    if (bestNPC) {
      const alpha = Math.min(1, bestNPC.speechTimer * 1.5);
      const text = `${bestNPC.name}: "${bestNPC.speechText}"`;
      ctx.font = '13px monospace';
      const tw = ctx.measureText(text).width + 22;
      const bx = CANVAS_W / 2 - tw / 2;
      const by = CANVAS_H * 0.72;
      ctx.fillStyle = `rgba(0,0,0,${0.72 * alpha})`;
      const r = 6;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 28, r);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,220,100,${0.4 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 28, r);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,235,160,${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(text, CANVAS_W / 2, by + 19);
      ctx.textAlign = 'left';
    }
  }

  // "Click to resume" (pointer lost mid-game, after title screen dismissed)
  if (!isPointerLocked() && hasEverStarted) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(CANVAS_W / 2 - 130, CANVAS_H / 2 - 22, 260, 44);
    ctx.strokeStyle = 'rgba(255,200,80,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(CANVAS_W / 2 - 130, CANVAS_H / 2 - 22, 260, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click to resume', CANVAS_W / 2, CANVAS_H / 2 + 6);
    ctx.textAlign = 'left';
  }

  // Add shop markers to minimap
  for (const shop of shopSystem.shops) {
    markers.push({ x: shop.x, y: shop.y, type: 'shop', label: shop.def.name });
  }
  // Add property markers to minimap
  for (const prop of propertySystem.properties) {
    const owned = propertySystem.isOwned(prop.def.id);
    markers.push({ x: prop.x, y: prop.y, type: owned ? 'safehouse' : 'property', label: prop.def.name });
  }
  // Add helicopter to minimap
  if (helicopter) {
    markers.push({ x: helicopter.x, y: helicopter.y, type: 'helicopter' });
  }

  // Minimap
  minimap.draw(ctx, CANVAS_W, CANVAS_H, player, TILE_SIZE, camera, markers);

  // Shop UI overlay
  shopSystem.draw(ctx, CANVAS_W, CANVAS_H);

  // Property UI overlay
  propertySystem.draw(ctx, CANVAS_W, CANVAS_H);

  // Interior transition overlay
  interiorSystem.drawTransition(ctx, CANVAS_W, CANVAS_H);

  // Mobile controls overlay
  mobileControls.draw(ctx, CANVAS_W, CANVAS_H);

  // Notification toast
  if (notification) {
    const alpha = Math.min(1, notificationTimer * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.7 * alpha})`;
    ctx.font = '14px monospace';
    const tw = ctx.measureText(notification).width + 24;
    ctx.fillRect(CANVAS_W / 2 - tw / 2, 50, tw, 28);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.textAlign = 'center';
    ctx.fillText(notification, CANVAS_W / 2, 69);
    ctx.textAlign = 'left';
  }

  // Crosshair (changes color when weapon equipped)
  if (currentWeapon) {
    ctx.fillStyle = hitMarkerTimer > 0 ? 'rgba(255,50,50,0.9)' : 'rgba(255,255,255,0.6)';
    // Cross with gap in center
    ctx.fillRect(CANVAS_W / 2 - 12, CANVAS_H / 2, 8, 1);
    ctx.fillRect(CANVAS_W / 2 + 4, CANVAS_H / 2, 8, 1);
    ctx.fillRect(CANVAS_W / 2, CANVAS_H / 2 - 12, 1, 8);
    ctx.fillRect(CANVAS_W / 2, CANVAS_H / 2 + 4, 1, 8);
    if (hitMarkerTimer > 0) {
      // X hit marker
      ctx.strokeStyle = 'rgba(255,50,50,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2 - 6, CANVAS_H / 2 - 6);
      ctx.lineTo(CANVAS_W / 2 + 6, CANVAS_H / 2 + 6);
      ctx.moveTo(CANVAS_W / 2 + 6, CANVAS_H / 2 - 6);
      ctx.lineTo(CANVAS_W / 2 - 6, CANVAS_H / 2 + 6);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(CANVAS_W / 2 - 8, CANVAS_H / 2, 16, 1);
    ctx.fillRect(CANVAS_W / 2, CANVAS_H / 2 - 8, 1, 16);
  }

  // --- Weapon viewmodel (weapon at bottom of screen) ---
  if (currentWeapon && !inVehicle) {
    const swingAnim = meleeSwingTimer > 0 ? (meleeSwingTimer / 0.35) : 0;
    const bobX = Math.sin(weaponBobPhase) * 4;
    const bobY = Math.abs(Math.cos(weaponBobPhase)) * 3;
    const recoilY = weaponRecoil * -35;
    const gc = currentWeapon.color || '#555';
    const wt = currentWeapon.type;

    ctx.save();

    if (wt === 'bat') {
      // Baseball bat — long cylindrical shape, swings on attack
      const bx = CANVAS_W * 0.60 + bobX;
      const by = CANVAS_H * 0.55 + bobY;
      ctx.translate(bx, by);
      ctx.rotate(-0.3 + swingAnim * -1.1); // swing animation
      // Handle
      ctx.fillStyle = '#8B5E3C';
      ctx.fillRect(-6, 0, 12, 130);
      // Barrel (wider end)
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.roundRect(-10, -20, 20, 50, 5);
      ctx.fill();
      // Highlight stripe
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-3, -18, 5, 44);
      // Knob
      ctx.fillStyle = '#7a4d28';
      ctx.beginPath();
      ctx.ellipse(0, 132, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (wt === 'pistol') {
      ctx.translate(CANVAS_W * 0.63 + bobX, CANVAS_H * 0.68 + recoilY + bobY);
      ctx.rotate(weaponRecoil * -0.15);
      const gw = 110, gh = 70;
      ctx.fillStyle = gc;
      ctx.fillRect(0, 10, gw * 0.65, gh * 0.25);
      ctx.fillRect(gw * 0.1, gh * 0.25, gw * 0.45, gh * 0.4);
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(gw * 0.28, gh * 0.55, gw * 0.18, gh * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, 12, gw * 0.65, 3);
      ctx.strokeStyle = gc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gw * 0.32, gh * 0.55, 7, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.fillRect(gw * 0.05, 4, 5, 7);

    } else if (wt === 'shotgun') {
      ctx.translate(CANVAS_W * 0.55 + bobX, CANVAS_H * 0.65 + recoilY + bobY);
      ctx.rotate(weaponRecoil * -0.12);
      const sw = 160, sh = 70;
      // Double barrel
      ctx.fillStyle = gc;
      ctx.fillRect(0, 6, sw * 0.8, 8);   // top barrel
      ctx.fillRect(0, 16, sw * 0.8, 8);  // bottom barrel
      // Stock / receiver
      ctx.fillStyle = '#5a3a18';
      ctx.fillRect(sw * 0.6, 0, sw * 0.38, sh * 0.55);
      ctx.fillRect(sw * 0.65, sh * 0.4, sw * 0.32, sh * 0.6);
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 7, sw * 0.8, 2);
      ctx.fillRect(0, 17, sw * 0.8, 2);
      // Pump
      ctx.fillStyle = '#3a2810';
      ctx.fillRect(sw * 0.3 - weaponRecoil * 10, 4, 30, 22);

    } else if (wt === 'smg') {
      ctx.translate(CANVAS_W * 0.60 + bobX, CANVAS_H * 0.67 + recoilY + bobY);
      ctx.rotate(weaponRecoil * -0.08);
      const mw = 130, mh = 75;
      // Short compact body
      ctx.fillStyle = gc;
      ctx.fillRect(0, 8, mw * 0.75, mh * 0.22);  // barrel
      ctx.fillRect(mw * 0.08, mh * 0.22, mw * 0.58, mh * 0.38); // receiver
      // Vertical magazine
      ctx.fillStyle = '#334455';
      ctx.fillRect(mw * 0.25, mh * 0.55, 12, 45);
      // Foregrip
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(mw * 0.42, mh * 0.55, 10, 28);
      // Stock (folded)
      ctx.fillStyle = gc;
      ctx.fillRect(mw * 0.62, mh * 0.25, 22, 8);
      ctx.fillRect(mw * 0.62, mh * 0.25, 4, 28);
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 9, mw * 0.75, 2);

    } else if (wt === 'rifle') {
      ctx.translate(CANVAS_W * 0.50 + bobX, CANVAS_H * 0.66 + recoilY + bobY);
      ctx.rotate(weaponRecoil * -0.1);
      const rw = 200, rh = 70;
      // Long barrel
      ctx.fillStyle = gc;
      ctx.fillRect(0, 10, rw * 0.9, 10);
      // Receiver
      ctx.fillStyle = '#3a4a28';
      ctx.fillRect(rw * 0.5, 6, rw * 0.4, rh * 0.5);
      // Stock
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(rw * 0.72, 4, rw * 0.25, rh * 0.65);
      // Magazine (curved, angled)
      ctx.fillStyle = '#334422';
      ctx.fillRect(rw * 0.62, rh * 0.5, 14, 40);
      // Scope
      ctx.fillStyle = '#222';
      ctx.fillRect(rw * 0.54, 2, 40, 8);
      ctx.fillStyle = 'rgba(50,150,255,0.4)';
      ctx.beginPath(); ctx.arc(rw * 0.54 + 6, 6, 5, 0, Math.PI * 2); ctx.fill();
      // Barrel highlight
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 11, rw * 0.9, 2);

    } else if (wt === 'grenade') {
      // Grenade — round cylinder with safety lever, throw animation
      ctx.translate(CANVAS_W * 0.64 + bobX + swingAnim * 40, CANVAS_H * 0.67 + recoilY + bobY + swingAnim * -30);
      ctx.rotate(-0.2 + swingAnim * -0.9);
      // Body (oval green)
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      // Segmentation lines
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
      ctx.moveTo(-14, -10); ctx.lineTo(14, -10);
      ctx.moveTo(-14, 10); ctx.lineTo(14, 10);
      ctx.stroke();
      // Top cap/fuse
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(-5, -26, 10, 8);
      // Safety lever
      ctx.fillStyle = '#999';
      ctx.fillRect(12, -14, 14, 4);
      ctx.fillRect(22, -20, 4, 10);
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(-5, -6, 5, 9, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Muzzle flash overlay
  if (muzzleFlashTimer > 0) {
    const flashAlpha = muzzleFlashTimer / 0.08;
    ctx.fillStyle = `rgba(255,200,50,${0.12 * flashAlpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Flash at gun muzzle
    const fx = CANVAS_W * 0.62;
    const fy = CANVAS_H * 0.70;
    const fSize = 35 + Math.random() * 25;
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fSize);
    grad.addColorStop(0, `rgba(255,255,200,${0.9 * flashAlpha})`);
    grad.addColorStop(0.3, `rgba(255,180,50,${0.6 * flashAlpha})`);
    grad.addColorStop(1, `rgba(255,100,0,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(fx - fSize, fy - fSize, fSize * 2, fSize * 2);
  }

  // Weapon HUD (bottom-right)
  if (currentWeapon) {
    const wx = CANVAS_W - 200;
    const wy = CANVAS_H - 65;
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const hudRad = 6;
    ctx.beginPath();
    ctx.roundRect(wx - 10, wy - 5, 200, 58, hudRad);
    ctx.fill();
    // Border
    ctx.strokeStyle = 'rgba(255,170,68,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(wx - 10, wy - 5, 200, 58, hudRad);
    ctx.stroke();
    // Weapon name
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffaa44';
    ctx.textAlign = 'right';
    ctx.fillText(currentWeapon.name, CANVAS_W - 20, wy + 14);
    // Ammo count
    ctx.font = 'bold 22px monospace';
    const ammoDisplay = currentWeapon.ammo === Infinity ? '∞' : `${currentWeapon.ammo}`;
    const ammoLow = currentWeapon.ammo !== Infinity && currentWeapon.ammo < 10;
    ctx.fillStyle = ammoLow ? '#ff4444' : '#fff';
    ctx.fillText(ammoDisplay, CANVAS_W - 20, wy + 40);
    // Ammo label
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('AMMO', CANVAS_W - 65, wy + 40);
    // Ammo bar (not for melee)
    if (currentWeapon.ammo !== Infinity) {
      const maxAmmo = 120;
      const ammoFrac = Math.min(1, currentWeapon.ammo / maxAmmo);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(wx, wy + 47, 180, 3);
      ctx.fillStyle = currentWeapon.ammo < 10 ? '#ff4444' : '#ffaa44';
      ctx.fillRect(wx, wy + 47, 180 * ammoFrac, 3);
    }
    ctx.textAlign = 'left';
  }

  // Stamina bar (below health when sprinting or recovering)
  if (stamina < 100) {
    const staminaBarW = 200;
    const stBarX = 16;
    const stBarY = 48;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(stBarX, stBarY, staminaBarW, 8);
    ctx.fillStyle = stamina > 25 ? '#44aaff' : '#ff6644';
    ctx.fillRect(stBarX, stBarY, staminaBarW * stamina / 100, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px monospace';
    ctx.fillText('STAMINA', stBarX + 2, stBarY + 7);
  }

  // --- HUD DOM updates ---
  hudMoney.textContent = `$${money.toLocaleString()}`;
  healthFill.style.width = `${Math.max(0, health)}%`;
  const armorFill = document.getElementById('armor-fill');
  if (armorFill) armorFill.style.width = `${armor}%`;

  // Vehicle health bar (when driving)
  if (inVehicle && !inVehicle.destroyed) {
    const vhpW = 200;
    const vhpX = 16;
    const vhpY = 62;
    const vhp = inVehicle.health / inVehicle.maxHealth;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(vhpX, vhpY, vhpW, 8);
    ctx.fillStyle = vhp > 0.5 ? '#4fc3f7' : vhp > 0.25 ? '#ffa726' : '#ef5350';
    ctx.fillRect(vhpX, vhpY, vhpW * vhp, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px monospace';
    ctx.fillText('VEHICLE', vhpX + 2, vhpY + 7);
  }

  // Weapon inventory slots (bottom center-left)
  if (weaponInventory.slots.length > 0) {
    const slotSize = 28;
    const slotGap = 4;
    const slotsX = 16;
    const slotsY = CANVAS_H - 180;
    for (let i = 0; i < weaponInventory.slots.length; i++) {
      const sx = slotsX + i * (slotSize + slotGap);
      const isActive = i === weaponInventory.activeIndex;
      ctx.fillStyle = isActive ? 'rgba(255,170,68,0.3)' : 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx, slotsY, slotSize, slotSize);
      ctx.strokeStyle = isActive ? '#ffaa44' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(sx, slotsY, slotSize, slotSize);
      // Slot number
      ctx.fillStyle = isActive ? '#ffaa44' : 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(`${i + 1}`, sx + 2, slotsY + 10);
      // Weapon type initial
      const wp = weaponInventory.slots[i];
      ctx.fillStyle = isActive ? '#fff' : '#888';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(wp.name.charAt(0), sx + slotSize / 2, slotsY + slotSize - 5);
      ctx.textAlign = 'left';
    }
  }

  // Mission timer display
  const missionObj = missionEngine.getActiveObjectiveText();
  if (missionObj && missionObj.timeLeft !== undefined) {
    const timeColor = missionObj.timeLeft < 10 ? '#ff4444' : '#ffd700';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(CANVAS_W / 2 - 40, 110, 80, 24);
    ctx.fillStyle = timeColor;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(missionObj.timeLeft)}s`, CANVAS_W / 2, 128);
    ctx.textAlign = 'left';
  }

  // Stealth detection indicator
  if (missionObj && missionObj.detected) {
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(0, 0, CANVAS_W, 4);
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DETECTED!', CANVAS_W / 2, 130);
    ctx.textAlign = 'left';
  }

  const stars = wantedLevel > 0
    ? Array(wantedLevel).fill('\u2605').join('') + Array(5 - wantedLevel).fill('\u2606').join('')
    : '';
  hudWanted.textContent = stars;
  hudWanted.style.color = wantedLevel >= 3 ? '#ff4444' : '#fff';

  if (inVehicle) {
    const speedMph = Math.abs(Math.round(inVehicle.speed * 0.3));
    hudVehicle.textContent = '';
    hudVehicle.style.whiteSpace = 'pre-line';
    // Draw speed dial on canvas
    const dialX = 100;
    const dialY = CANVAS_H - 100;
    const dialR = 45;
    // Background arc
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    // Speed arc
    const speedFrac = Math.min(1, Math.abs(inVehicle.speed) / inVehicle.maxSpeed);
    const arcLen = Math.PI * 1.5 * speedFrac;
    ctx.strokeStyle = speedFrac > 0.8 ? '#ff4444' : '#4fc3f7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR, Math.PI * 0.75, Math.PI * 0.75 + arcLen);
    ctx.stroke();
    // Needle
    const needleAngle = Math.PI * 0.75 + arcLen;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dialX, dialY);
    ctx.lineTo(dialX + Math.cos(needleAngle) * (dialR - 8), dialY + Math.sin(needleAngle) * (dialR - 8));
    ctx.stroke();
    // MPH text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${speedMph}`, dialX, dialY + 8);
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('MPH', dialX, dialY + 20);
    // Vehicle name
    ctx.font = '11px monospace';
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText(inVehicle.name, dialX, dialY + dialR + 16);
    ctx.textAlign = 'left';
  } else {
    hudVehicle.textContent = '';
  }

  hudFps.textContent = `FPS: ${displayFps}`;

  const obj = missionEngine.getActiveObjectiveText();
  if (obj) {
    let trackerText = `${obj.missionName} [${obj.progress}]\n${obj.objectiveText}`;
    if (obj.timeLeft !== undefined) trackerText += `\nTime: ${Math.ceil(obj.timeLeft)}s`;
    if (obj.surviveProgress !== undefined) trackerText += `\nProgress: ${Math.round(obj.surviveProgress * 100)}%`;
    if (obj.objectiveType) trackerText += `\n[${obj.objectiveType.toUpperCase()}]`;
    missionTracker.textContent = trackerText;
    missionTracker.style.whiteSpace = 'pre-line';
  } else if (activeQuest && activeQuest.state === 'active') {
    // Show active side quest in mission tracker
    const qdx = activeQuest.targetX - (player.x + player.w / 2);
    const qdy = activeQuest.targetY - (player.y + player.h / 2);
    const qdist = Math.round(Math.sqrt(qdx * qdx + qdy * qdy));
    const qtitle = activeQuest.title || 'Street Job';
    missionTracker.textContent = `${qtitle} [$${activeQuest.reward}]\nGet to the marked location\n${qdist}m away`;
    missionTracker.style.whiteSpace = 'pre-line';
  } else {
    missionTracker.textContent = '';
  }

  // Radio indicator
  if (radio.channelIndex > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(16, CANVAS_H - 38, 140, 22);
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '11px monospace';
    ctx.fillText(`♪ ${radio.channelName}`, 24, CANVAS_H - 22);
  }

  // Swimming overlay — blue tint at bottom of screen
  if (isSwimming) {
    const swimGrad = ctx.createLinearGradient(0, CANVAS_H * 0.5, 0, CANVAS_H);
    swimGrad.addColorStop(0, 'rgba(20,60,120,0)');
    swimGrad.addColorStop(1, 'rgba(20,60,120,0.35)');
    ctx.fillStyle = swimGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Wave effect at mid-screen
    ctx.strokeStyle = 'rgba(100,160,220,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = 0; sx < CANVAS_W; sx += 4) {
      const wy = CANVAS_H * 0.55 + Math.sin(sx * 0.03 + performance.now() * 0.003) * 5;
      sx === 0 ? ctx.moveTo(sx, wy) : ctx.lineTo(sx, wy);
    }
    ctx.stroke();
    // Swimming indicator
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px monospace';
    ctx.fillText('SWIMMING', 16, CANVAS_H - 58);
  }

  // Weather indicator (rain)
  if (weather.rainIntensity > 0.1) {
    ctx.fillStyle = 'rgba(150,180,220,0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('☂ Rain', 16, CANVAS_H - 48);
  }

  // District name — GTA-style location banner (bottom-left)
  if (districtNameTimer > 0) {
    const t = districtNameTimer;
    // Fade in 0.5s, hold, fade out 0.8s before end
    const fadeIn = Math.min(1, t > 3 ? (3.5 - t) / 0.5 : 1);
    const fadeOut = t < 0.8 ? t / 0.8 : 1;
    const alpha = Math.min(fadeIn, fadeOut);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Separator line
    ctx.strokeStyle = 'rgba(220,200,120,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, CANVAS_H - 185);
    ctx.lineTo(16 + Math.min(300, ctx.measureText(districtDisplayName).width + 60), CANVAS_H - 185);
    ctx.stroke();
    // "ENTERING" label
    ctx.fillStyle = 'rgba(200,185,110,0.8)';
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LOCATION', 16, CANVAS_H - 192);
    // District name
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.fillStyle = 'rgba(240,228,168,1)';
    ctx.fillText(districtDisplayName, 16, CANVAS_H - 166);
    ctx.restore();
  }

  // Helicopter spotlight effect (pulsing light circle at screen center when helicopter active)
  if (helicopter && !isDead) {
    const spotAlpha = 0.06 + Math.sin(performance.now() / 300) * 0.03;
    const grad = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 0, CANVAS_W / 2, CANVAS_H / 2, 200);
    grad.addColorStop(0, `rgba(255,255,220,${spotAlpha})`);
    grad.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Combo indicator
  if (comboCount >= 2 && comboTimer > 0) {
    const comboAlpha = Math.min(1, comboTimer / 0.3);
    const scale = 1 + comboCount * 0.15;
    ctx.save();
    ctx.globalAlpha = comboAlpha;
    ctx.fillStyle = comboCount >= COMBO_MAX ? '#ff4444' : '#ffaa44';
    ctx.font = `bold ${Math.floor(24 * scale)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${comboCount}x COMBO`, CANVAS_W / 2, CANVAS_H * 0.35);
    // Combo bar showing window remaining
    const barW = 100;
    const barH = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_W / 2 - barW / 2, CANVAS_H * 0.35 + 8, barW, barH);
    ctx.fillStyle = comboCount >= COMBO_MAX ? '#ff4444' : '#ffaa44';
    ctx.fillRect(CANVAS_W / 2 - barW / 2, CANVAS_H * 0.35 + 8, barW * (comboTimer / COMBO_WINDOW), barH);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Death screen overlay
  if (isDead) {
    ctx.fillStyle = 'rgba(80,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WASTED', CANVAS_W / 2, CANVAS_H / 2 - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.fillText(`Respawning in ${Math.ceil(deathTimer)}...`, CANVAS_W / 2, CANVAS_H / 2 + 25);
    ctx.textAlign = 'left';
  }
}

// --- Start ambient city sounds on first player interaction ---
function onFirstInteraction() {
  unlockAudio();
  startAmbientCity();
}
document.addEventListener('keydown', onFirstInteraction, { once: true });
document.addEventListener('click', onFirstInteraction, { once: true });

// Prevent context menu on canvas for visual editor
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Pause menu button handlers ---
if (pauseResume) pauseResume.addEventListener('click', () => { closePause(); playClick(); });
if (pauseSave) pauseSave.addEventListener('click', () => {
  try {
    saveGame(player, missionEngine, buildSaveState());
    showNotification('Game saved! (Slot 1)');
    playClick();
  } catch (err) {
    showNotification('Save failed!');
    console.error('Save error:', err);
  }
});
if (pauseLoad) pauseLoad.addEventListener('click', () => {
  if (pauseSavesPanel) {
    pauseSavesPanel.classList.toggle('open');
    pauseSettingsPanel.classList.remove('open');
    // Build save slot buttons
    pauseSavesPanel.textContent = '';
    const saves = listSaves();
    for (let i = 0; i < 3; i++) {
      const btn = document.createElement('button');
      btn.className = 'pause-save-slot';
      if (saves[i]) {
        const date = new Date(saves[i].timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        btn.textContent = `Slot ${i + 1}: $${saves[i].money} | HP:${saves[i].health} | ${dateStr}`;
        btn.addEventListener('click', () => {
          try {
            const data = loadGame(i);
            if (data) {
              player.x = data.player.x;
              player.y = data.player.y;
              money = data.money ?? 500;
              health = data.health ?? 100;
              armor = data.armor ?? 0;
              wantedLevel = data.wantedLevel ?? 0;
              showNotification(`Loaded Slot ${i + 1}`);
              closePause();
              playClick();
            }
          } catch (err) {
            showNotification('Load failed!');
            console.error('Load error:', err);
          }
        });
      } else {
        btn.textContent = `Slot ${i + 1}: Empty`;
        btn.className += ' empty';
      }
      pauseSavesPanel.appendChild(btn);
    }
  }
});
if (pauseSettings) pauseSettings.addEventListener('click', () => {
  if (pauseSettingsPanel) {
    pauseSettingsPanel.classList.toggle('open');
    pauseSavesPanel.classList.remove('open');
  }
  playClick();
});
if (pauseControls) pauseControls.addEventListener('click', () => {
  // Close pause and show title screen controls overlay briefly
  closePause();
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) {
    titleScreen.style.display = 'flex';
    titleScreen.classList.remove('fade-out');
    const dismiss = () => {
      titleScreen.classList.add('fade-out');
      setTimeout(() => { titleScreen.style.display = 'none'; }, 950);
    };
    titleScreen.addEventListener('click', dismiss, { once: true });
    document.addEventListener('keydown', dismiss, { once: true });
  }
  playClick();
});

// Volume slider
const volumeSlider = document.getElementById('volume-slider');
if (volumeSlider) {
  volumeSlider.value = Math.round(masterVolume * 100);
  volumeSlider.addEventListener('input', (e) => {
    masterVolume = e.target.value / 100;
    localStorage.setItem('unified-volume', String(masterVolume));
  });
}

// Sensitivity slider
const sensitivitySlider = document.getElementById('sensitivity-slider');
if (sensitivitySlider) {
  sensitivitySlider.value = Math.round(mouseSensitivity * 10000);
  sensitivitySlider.addEventListener('input', (e) => {
    mouseSensitivity = e.target.value / 10000;
    player.mouseSensitivity = mouseSensitivity;
    localStorage.setItem('unified-sensitivity', String(mouseSensitivity));
  });
}

// Claude API key
const apiKeyInput = document.getElementById('api-key-input');
const apiKeyStatus = document.getElementById('api-key-status');
function renderApiKeyStatus() {
  if (!apiKeyStatus) return;
  const key = (localStorage.getItem(CLAUDE_API_KEY_STORAGE) || '').trim();
  if (key) {
    apiKeyStatus.textContent = `Key set (…${key.slice(-4)}) — AI missions enabled.`;
    apiKeyStatus.classList.remove('missing');
  } else {
    apiKeyStatus.textContent = 'No key set — using keyword fallback.';
    apiKeyStatus.classList.add('missing');
  }
}
if (apiKeyInput) {
  apiKeyInput.value = localStorage.getItem(CLAUDE_API_KEY_STORAGE) || '';
  apiKeyInput.addEventListener('keydown', (e) => e.stopPropagation());
  apiKeyInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) localStorage.setItem(CLAUDE_API_KEY_STORAGE, val);
    else localStorage.removeItem(CLAUDE_API_KEY_STORAGE);
    renderApiKeyStatus();
  });
  renderApiKeyStatus();
}

// Marketplace API URL + test button
const cloudUrlInput = document.getElementById('cloud-url-input');
const cloudStatus = document.getElementById('cloud-status');
const cloudTestBtn = document.getElementById('cloud-test-btn');
function renderCloudStatus(text, ok) {
  if (!cloudStatus) return;
  cloudStatus.textContent = text;
  cloudStatus.classList.toggle('missing', !ok);
}
function renderCloudIdle() {
  const url = (localStorage.getItem(CLOUD_API_STORAGE) || '').trim();
  if (url) renderCloudStatus(`Configured: ${url.replace(/^https?:\/\//, '').slice(0, 40)}`, true);
  else renderCloudStatus('Offline — using local-only marketplace.', false);
}
if (cloudUrlInput) {
  cloudUrlInput.value = localStorage.getItem(CLOUD_API_STORAGE) || '';
  cloudUrlInput.addEventListener('keydown', (e) => e.stopPropagation());
  cloudUrlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().replace(/\/+$/, '');
    if (val) localStorage.setItem(CLOUD_API_STORAGE, val);
    else localStorage.removeItem(CLOUD_API_STORAGE);
    renderCloudIdle();
  });
  renderCloudIdle();
}
if (cloudTestBtn) {
  cloudTestBtn.addEventListener('click', async () => {
    renderCloudStatus('Testing…', true);
    const result = await marketplace.cloud.ping();
    if (result.ok) {
      renderCloudStatus(`OK — ${result.latencyMs}ms. Re-syncing…`, true);
      // Force a fresh hydrate so the catalog picks up live data
      marketplace.hydrated = false;
      marketplace._hydrate().then(() => {
        renderCloudStatus(`Connected — ${marketplace.catalog.length} missions synced.`, true);
      });
    } else {
      renderCloudStatus(`Failed: ${result.error}`, false);
    }
  });
}

// Apply loaded sensitivity
player.mouseSensitivity = mouseSensitivity;

// --- Loading complete: transition to title screen ---
setLoadProgress(100, 'Ready!');

// Short delay to show 100%, then transition
setTimeout(() => {
  // Hide loading screen
  if (loadingScreen) loadingScreen.classList.add('done');
  setTimeout(() => { if (loadingScreen) loadingScreen.style.display = 'none'; }, 500);

  // Show title screen
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) {
    titleScreen.style.display = 'flex';
    const dismiss = () => {
      titleScreen.classList.add('fade-out');
      setTimeout(() => { titleScreen.style.display = 'none'; }, 950);
    };
    titleScreen.addEventListener('click', dismiss, { once: true });
    document.addEventListener('keydown', dismiss, { once: true });
  }
}, 300);

// --- Start ---
showNotification('Welcome to Unified City — Click to play');
requestAnimationFrame(gameLoop);
console.log('Unified — 3D raycaster loaded. WASD move, mouse look, F enter car, E interact/buy, 1-5 weapons, V visual editor, T ai creator, M marketplace, Esc pause.');
