// Main — open world with raycaster 3D view, vehicles, NPCs, missions, marketplace

import { initInput, wasKeyPressed, wasMouseClicked, clearJustPressed, isKeyDown, consumeMouseDX, requestPointerLock, isPointerLocked } from './engine/input.js';
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
import { saveGame, loadGame } from './engine/save.js';
import { MissionEditor } from './marketplace/editor.js';
import { unlockAudio, playAccept, playObjectiveComplete, playMissionComplete, playClick, playStep } from './engine/audio.js';
import { Vehicle, spawnVehicles } from './game/vehicle.js';
import { NPC, spawnNPCs } from './game/npc.js';
import { AITerminal } from './ai/terminal.js';

// --- Config ---
const CANVAS_W = window.innerWidth;
const CANVAS_H = window.innerHeight;
const WORLD_COLS = 100;
const WORLD_ROWS = 80;
const WORLD_W = WORLD_COLS * TILE_SIZE;
const WORLD_H = WORLD_ROWS * TILE_SIZE;

// --- Init systems ---
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, CANVAS_W, CANVAS_H);
const camera = new Camera(CANVAS_W, CANVAS_H); // kept for minimap
initInput();
unlockAudio();

// Pointer lock on canvas click
canvas.addEventListener('click', () => {
  if (!isPointerLocked()) {
    requestPointerLock(canvas);
    unlockAudio();
  }
});

// --- World ---
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
const spawn = findSpawnOnRoad(worldMap, WORLD_COLS, WORLD_ROWS);
const player = new Player(spawn.x, spawn.y);

// --- Vehicles ---
const vehicles = spawnVehicles(worldMap, TILE_SIZE, 25);

// --- NPCs ---
const npcs = spawnNPCs(worldMap, TILE_SIZE, 40);

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

// --- Weapon system ---
let currentWeapon = null;  // { name, damage, fireRate, range, ammo, spread, color }
let weaponCooldown = 0;
let muzzleFlashTimer = 0;
let hitMarkerTimer = 0;

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
  currentWeapon = { ...config };
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
const minimap = new Minimap(WORLD_COLS, WORLD_ROWS, 150);
minimap.bake(worldMap);

// --- Save/Load ---
const savedData = loadGame();
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
}

// --- Game state ---
let inVehicle = null;
let money = 500;
let health = 100;
let wantedLevel = 0;
let wantedDecayTimer = 0;

// --- Day/night cycle ---
let timeOfDay = 0.25;
const DAY_SPEED = 0.008;

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

  // Shooting (left click when pointer locked, not in vehicle, have a weapon)
  if (wasMouseClicked() && currentWeapon && !inVehicle && !aiTerminal.isOpen && weaponCooldown <= 0) {
    if (currentWeapon.ammo > 0) {
      currentWeapon.ammo--;
      weaponCooldown = 1 / currentWeapon.fireRate;
      muzzleFlashTimer = 0.08;

      // Hitscan: check NPCs near crosshair direction
      const shootAngle = player.angle + (Math.random() - 0.5) * currentWeapon.spread;
      const shootDirX = Math.cos(shootAngle);
      const shootDirY = Math.sin(shootAngle);
      const maxRange = currentWeapon.range * TILE_SIZE;

      let bestHit = null;
      let bestDist = maxRange;

      for (const npc of npcs) {
        const dx = npc.x - (player.x + player.w / 2);
        const dy = npc.y - (player.y + player.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRange || dist < 10) continue;

        // Check if NPC is roughly in the crosshair direction
        const toNpc = Math.atan2(dy, dx);
        let angleDiff = toNpc - shootAngle;
        angleDiff = ((angleDiff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const hitWidth = Math.atan2(16, dist); // NPC angular width

        if (Math.abs(angleDiff) < hitWidth && dist < bestDist) {
          bestDist = dist;
          bestHit = npc;
        }
      }

      if (bestHit) {
        hitMarkerTimer = 0.2;
        // Push NPC away and make them flee
        const dx = bestHit.x - (player.x + player.w / 2);
        const dy = bestHit.y - (player.y + player.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        bestHit.x += (dx / dist) * 15;
        bestHit.y += (dy / dist) * 15;
        bestHit.fleeing = true;
        bestHit.fleeTimer = 4;
        bestHit.vx = (dx / dist) * 200;
        bestHit.vy = (dy / dist) * 200;

        // Wanted level for shooting near cops
        if (wantedLevel < 3) {
          wantedLevel++;
          wantedDecayTimer = 0;
        }
      }

      // All nearby NPCs flee from gunfire
      const px = player.x + player.w / 2;
      const py = player.y + player.h / 2;
      for (const npc of npcs) {
        const dx = npc.x - px;
        const dy = npc.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && !npc.fleeing) {
          npc.fleeing = true;
          npc.fleeTimer = 2 + Math.random() * 2;
          npc.vx = (dx / (dist || 1)) * npc.speed * 2;
          npc.vy = (dy / (dist || 1)) * npc.speed * 2;
        }
      }
    }
  }

  // Input
  if (wasKeyPressed('KeyM') && !aiTerminal.isOpen) { marketplace.toggle(); playClick(); }
  if (wasKeyPressed('KeyT') && !marketplace.isOpen) { aiTerminal.toggle(); playClick(); }
  if (wasKeyPressed('Escape')) { marketplace.close(); aiTerminal.close(); }
  if (wasKeyPressed('F5')) {
    if (saveGame(player, missionEngine)) {
      showNotification('Game saved!');
      playClick();
    }
  }

  // Enter/Exit vehicle (F key)
  if (wasKeyPressed('KeyF')) {
    if (inVehicle) {
      inVehicle.occupied = false;
      player.x = inVehicle.x + 30;
      player.y = inVehicle.y;
      player.angle = inVehicle.angle; // keep facing vehicle's direction
      inVehicle = null;
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

  while (accumulator >= TICK_RATE) {
    if (!aiTerminal.isOpen) update(TICK_RATE);
    accumulator -= TICK_RATE;
  }

  render();
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

function update(dt) {
  // Day/night cycle
  timeOfDay = (timeOfDay + DAY_SPEED * dt) % 1;
  const nightCurve = Math.cos(timeOfDay * Math.PI * 2) * 0.5 + 0.5;
  renderer.setNightAlpha(nightCurve);

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

    camera.follow({ x: inVehicle.x - CANVAS_W / 4, y: inVehicle.y - CANVAS_H / 4, w: CANVAS_W / 2, h: CANVAS_H / 2 }, dt);
  } else {
    // --- On foot ---
    player.update(dt);

    // Footstep sounds
    const isMoving = Math.abs(player.vx) > 30 || Math.abs(player.vy) > 30;
    if (isMoving) {
      stepTimer -= dt;
      if (stepTimer <= 0) { playStep(); stepTimer = 0.25; }
    } else {
      stepTimer = 0;
    }

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

  if (nearMission && wasKeyPressed('KeyE')) {
    missionEngine.acceptMission(nearMission);
    interactPrompt = null;
    playAccept();
    showNotification(`Mission: ${nearMission.data.name}`);
  }

  missionEngine.update(playerCX, playerCY);

  const curActiveM = missionEngine.activeMissions[0];
  if (curActiveM && curActiveM === activeM && curActiveM.currentObjective > prevObjIdx) {
    playObjectiveComplete();
    showNotification('Objective complete!');
    money += 50;
  }
  if (missionEngine.completedIds.size > prevCompleted) {
    playMissionComplete();
    money += 200;
    showNotification('Mission complete! +$200');
  }

  // Update NPCs
  const playerSpeed = inVehicle ? Math.abs(inVehicle.speed) : Math.sqrt(player.vx ** 2 + player.vy ** 2);
  for (const npc of npcs) {
    npc.update(dt, worldMap, TILE_SIZE, playerCX, playerCY, !!inVehicle, playerSpeed);
  }

  // Weapon cooldown
  if (weaponCooldown > 0) weaponCooldown -= dt;
  if (muzzleFlashTimer > 0) muzzleFlashTimer -= dt;
  if (hitMarkerTimer > 0) hitMarkerTimer -= dt;

  // Notification timer
  if (notificationTimer > 0) {
    notificationTimer -= dt;
    if (notificationTimer <= 0) notification = null;
  }

  // Autosave
  saveTimer += dt;
  if (saveTimer >= 30) { saveGame(player, missionEngine); saveTimer = 0; }
}

function render() {
  // Build sprite list for raycaster
  const sprites = [];
  for (const npc of npcs) {
    sprites.push({ x: npc.x, y: npc.y, color: npc.color, type: 'npc' });
  }
  for (const v of vehicles) {
    if (v === inVehicle) continue; // don't render our vehicle
    sprites.push({ x: v.x, y: v.y, color: v.color, type: 'vehicle' });
  }

  // Mission markers
  const markers = missionEngine.getMarkers();

  // --- Raycaster render ---
  renderer.renderScene(player, worldMap, TILE_SIZE, sprites, markers);

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
  if (interactPrompt && !inVehicle) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '14px monospace';
    const tw = ctx.measureText(interactPrompt).width + 20;
    ctx.fillRect(CANVAS_W / 2 - tw / 2, CANVAS_H - 120, tw, 24);
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(interactPrompt, CANVAS_W / 2, CANVAS_H - 102);
    ctx.textAlign = 'left';
  }

  // "Click to play" when pointer not locked
  if (!isPointerLocked()) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_W / 2 - 120, CANVAS_H / 2 - 20, 240, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click to play', CANVAS_W / 2, CANVAS_H / 2 + 5);
    ctx.textAlign = 'left';
  }

  // Minimap
  minimap.draw(ctx, CANVAS_W, CANVAS_H, player, TILE_SIZE, camera, markers);

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

  // Muzzle flash overlay
  if (muzzleFlashTimer > 0) {
    const flashAlpha = muzzleFlashTimer / 0.08;
    ctx.fillStyle = `rgba(255,200,50,${0.15 * flashAlpha})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // Flash at bottom-right (gun position)
    const fx = CANVAS_W * 0.65;
    const fy = CANVAS_H * 0.75;
    const fSize = 30 + Math.random() * 20;
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fSize);
    grad.addColorStop(0, `rgba(255,255,200,${0.8 * flashAlpha})`);
    grad.addColorStop(0.4, `rgba(255,150,30,${0.5 * flashAlpha})`);
    grad.addColorStop(1, `rgba(255,100,0,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(fx - fSize, fy - fSize, fSize * 2, fSize * 2);
  }

  // Weapon HUD (bottom-right)
  if (currentWeapon) {
    const wx = CANVAS_W - 200;
    const wy = CANVAS_H - 60;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(wx - 10, wy - 5, 200, 50);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffaa44';
    ctx.textAlign = 'right';
    ctx.fillText(currentWeapon.name, CANVAS_W - 20, wy + 12);
    ctx.font = '20px monospace';
    ctx.fillStyle = currentWeapon.ammo < 10 ? '#ff4444' : '#fff';
    ctx.fillText(`${currentWeapon.ammo}`, CANVAS_W - 20, wy + 36);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('AMMO', CANVAS_W - 60, wy + 36);
    ctx.textAlign = 'left';
  }

  // --- HUD DOM updates ---
  hudMoney.textContent = `$${money.toLocaleString()}`;
  healthFill.style.width = `${health}%`;

  const stars = wantedLevel > 0
    ? Array(wantedLevel).fill('\u2605').join('') + Array(5 - wantedLevel).fill('\u2606').join('')
    : '';
  hudWanted.textContent = stars;
  hudWanted.style.color = wantedLevel >= 3 ? '#ff4444' : '#fff';

  if (inVehicle) {
    const speedMph = Math.abs(Math.round(inVehicle.speed * 0.3));
    hudVehicle.textContent = `${inVehicle.name}\n${speedMph} MPH`;
    hudVehicle.style.whiteSpace = 'pre-line';
  } else {
    hudVehicle.textContent = '';
  }

  hudFps.textContent = `FPS: ${displayFps}`;

  const obj = missionEngine.getActiveObjectiveText();
  if (obj) {
    missionTracker.textContent = `${obj.missionName} [${obj.progress}]\n${obj.objectiveText}`;
    missionTracker.style.whiteSpace = 'pre-line';
  } else {
    missionTracker.textContent = '';
  }
}

// --- Start ---
showNotification('Welcome to Unified City — Click to play');
requestAnimationFrame(gameLoop);
console.log('Unified — 3D raycaster loaded. WASD move, mouse look, F enter car, E interact, T ai creator, M marketplace.');
