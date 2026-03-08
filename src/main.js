// Main — wires engine, game, missions, and marketplace together

import { initInput, wasKeyPressed, clearJustPressed } from './engine/input.js';
import { aabbOverlap, resolveCollision } from './engine/physics.js';
import { Camera } from './engine/camera.js';
import { Renderer } from './engine/renderer.js';
import { Player } from './game/player.js';
import {
  generateWorld, TILE_SIZE, TILE_COLORS, getSolidRectsNear,
} from './game/world.js';
import { MissionEngine } from './missions/mission-engine.js';
import { SAMPLE_MISSIONS } from './missions/sample-missions.js';
import { Marketplace } from './marketplace/marketplace.js';

// --- Config ---
const CANVAS_W = Math.min(1280, window.innerWidth);
const CANVAS_H = Math.min(720, window.innerHeight);
const WORLD_COLS = 80;
const WORLD_ROWS = 60;
const WORLD_W = WORLD_COLS * TILE_SIZE;
const WORLD_H = WORLD_ROWS * TILE_SIZE;

// --- Init systems ---
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, CANVAS_W, CANVAS_H);
const camera = new Camera(CANVAS_W, CANVAS_H);
initInput();

// --- World ---
const worldMap = generateWorld(WORLD_COLS, WORLD_ROWS);

// --- Player (spawn at center) ---
const spawnX = Math.floor(WORLD_COLS / 2) * TILE_SIZE;
const spawnY = Math.floor(WORLD_ROWS / 2) * TILE_SIZE;
const player = new Player(spawnX, spawnY);

// --- Missions ---
const missionEngine = new MissionEngine();
missionEngine.loadMissions(SAMPLE_MISSIONS);

// --- Marketplace ---
const marketplace = new Marketplace(missionEngine);
// Pre-load some community missions into the marketplace catalog
marketplace.addToCatalog({
  id: 'community-treasure-hunt',
  name: 'The Great Treasure Hunt',
  author: 'CommunityDev',
  description: 'A community-created treasure hunt across the world!',
  version: '1.0',
  triggerZone: { x: 700, y: 500, radius: 45 },
  objectives: [
    { type: 'goto', description: 'Find the first clue', target: { x: 300, y: 300, radius: 35 } },
    { type: 'goto', description: 'Follow the trail', target: { x: 1100, y: 400, radius: 35 } },
    { type: 'collect', description: 'Dig up the treasure', target: { x: 1400, y: 700, radius: 30 }, item: 'Treasure Chest' },
  ],
  reward: { xp: 500, item: 'Pirate Hat' },
});
marketplace.addToCatalog({
  id: 'community-race',
  name: 'Speed Dash Challenge',
  author: 'SpeedRunner99',
  description: 'Race through checkpoints as fast as you can!',
  version: '1.0',
  triggerZone: { x: 600, y: 550, radius: 40 },
  objectives: [
    { type: 'goto', description: 'Checkpoint 1', target: { x: 900, y: 300, radius: 35 } },
    { type: 'goto', description: 'Checkpoint 2', target: { x: 1200, y: 800, radius: 35 } },
    { type: 'goto', description: 'Checkpoint 3', target: { x: 400, y: 700, radius: 35 } },
    { type: 'goto', description: 'Finish line!', target: { x: 600, y: 550, radius: 40 } },
  ],
  reward: { xp: 300 },
});

// --- HUD elements ---
const hudPos = document.getElementById('hud-pos');
const hudFps = document.getElementById('hud-fps');
const missionTracker = document.getElementById('mission-tracker');

// --- Interaction prompt ---
let interactPrompt = null;

// --- FPS tracking ---
let frameCount = 0;
let fpsTime = 0;
let displayFps = 0;

// --- Game Loop (fixed timestep) ---
const TICK_RATE = 1 / 60;
let lastTime = performance.now();
let accumulator = 0;

function gameLoop(now) {
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frameDt;

  // FPS counter
  fpsTime += frameDt;
  frameCount++;
  if (fpsTime >= 1) {
    displayFps = frameCount;
    frameCount = 0;
    fpsTime = 0;
  }

  // --- Input checks (once per frame) ---
  if (wasKeyPressed('KeyM')) {
    marketplace.toggle();
  }
  if (wasKeyPressed('Escape')) {
    marketplace.close();
  }

  // --- Fixed timestep updates ---
  while (accumulator >= TICK_RATE) {
    update(TICK_RATE);
    accumulator -= TICK_RATE;
  }

  // --- Render ---
  render();

  clearJustPressed();
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  // Player movement
  player.update(dt);

  // Collision with solid tiles
  const solids = getSolidRectsNear(worldMap, player.x + player.w / 2, player.y + player.h / 2, 80);
  for (const solid of solids) {
    if (aabbOverlap(player, solid)) {
      resolveCollision(player, solid);
    }
  }

  // Clamp player to world
  player.x = Math.max(0, Math.min(player.x, WORLD_W - player.w));
  player.y = Math.max(0, Math.min(player.y, WORLD_H - player.h));

  // Camera
  camera.follow(player, dt);
  camera.clamp(WORLD_W, WORLD_H);

  // Mission proximity check
  const playerCX = player.x + player.w / 2;
  const playerCY = player.y + player.h / 2;
  const nearMission = missionEngine.getAvailableMissionNear(playerCX, playerCY);
  interactPrompt = nearMission ? `Press E: ${nearMission.data.name}` : null;

  // Accept mission on E press
  if (nearMission && wasKeyPressed('KeyE')) {
    missionEngine.acceptMission(nearMission);
    interactPrompt = null;
  }

  // Update mission objectives
  missionEngine.update(playerCX, playerCY);
}

function render() {
  renderer.clear('#1a1a2e');

  // Tiles
  renderer.drawTiles(worldMap, TILE_SIZE, camera, TILE_COLORS);

  // Mission markers
  const markers = missionEngine.getMarkers();
  for (const m of markers) {
    const color = m.type === 'trigger'
      ? 'rgba(255,215,0,0.25)'
      : 'rgba(0,200,255,0.3)';
    renderer.drawCircle(m.x, m.y, m.radius, camera, color);

    // Label
    const labelColor = m.type === 'trigger' ? '#ffd700' : '#4fc3f7';
    renderer.drawWorldText(m.label, m.x - 40, m.y - m.radius - 8, camera, labelColor, 11);

    // Pulsing ring for objectives
    if (m.type === 'objective') {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
      renderer.drawCircle(m.x, m.y, m.radius + 5 * pulse, camera, `rgba(0,200,255,${0.1 * pulse})`);
    }
  }

  // Player
  renderer.drawEntity(player, camera, player.color);
  // Player direction indicator (small dot)
  const s = camera.worldToScreen(player.x + player.w / 2, player.y + player.h / 2);
  renderer.ctx.fillStyle = '#fff';
  renderer.ctx.beginPath();
  renderer.ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
  renderer.ctx.fill();

  // Interact prompt
  if (interactPrompt) {
    const ps = camera.worldToScreen(player.x + player.w / 2, player.y - 16);
    renderer.ctx.fillStyle = '#ffd700';
    renderer.ctx.font = '13px monospace';
    renderer.ctx.textAlign = 'center';
    renderer.ctx.fillText(interactPrompt, ps.x, ps.y);
    renderer.ctx.textAlign = 'left';
  }

  // HUD
  hudPos.textContent = `X: ${Math.round(player.x)}  Y: ${Math.round(player.y)}`;
  hudFps.textContent = `FPS: ${displayFps}`;

  // Mission tracker
  const obj = missionEngine.getActiveObjectiveText();
  if (obj) {
    missionTracker.textContent = `${obj.missionName} [${obj.progress}]\n${obj.objectiveText}`;
    missionTracker.style.whiteSpace = 'pre-line';
  } else {
    missionTracker.textContent = '';
  }
}

// --- Start ---
requestAnimationFrame(gameLoop);
console.log('Unified — Open World MVP loaded. WASD to move, E to interact, M for marketplace.');
