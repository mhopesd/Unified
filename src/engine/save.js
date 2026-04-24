// Save/Load system — persists game state to localStorage

const SAVE_VERSION = 2;
const SLOT_COUNT = 3;

function slotKey(slot) {
  return `unified-save-slot${slot}`;
}

// Save to a specific slot (0-2). Accepts extended gameState object.
export function saveGame(player, missionEngine, gameState = {}, slot = 0) {
  const data = {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    player: { x: player.x, y: player.y },
    completedMissions: [...missionEngine.completedIds],
    activeMissions: missionEngine.activeMissions.map(m => ({
      id: m.data.id,
      currentObjective: m.currentObjective,
    })),
    money:   gameState.money   ?? 0,
    health:  gameState.health  ?? 100,
    armor:   gameState.armor   ?? 0,
    weapons: gameState.weapons ?? [],  // array of { type, ammo }
    wantedLevel: gameState.wantedLevel ?? 0,
  };

  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Load from a specific slot (0-2). Returns null if no save or wrong version.
export function loadGame(slot = 0) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

// Returns metadata for all slots: [{ slot, timestamp, money, district } | null, ...]
export function listSaves() {
  const result = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    try {
      const raw = localStorage.getItem(slotKey(s));
      if (!raw) { result.push(null); continue; }
      const data = JSON.parse(raw);
      if (data.version !== SAVE_VERSION) { result.push(null); continue; }
      result.push({
        slot: s,
        timestamp: data.timestamp,
        money: data.money ?? 0,
        health: data.health ?? 100,
        completedCount: (data.completedMissions || []).length,
      });
    } catch {
      result.push(null);
    }
  }
  return result;
}

export function hasSave(slot = 0) {
  return localStorage.getItem(slotKey(slot)) !== null;
}

export function deleteSave(slot = 0) {
  localStorage.removeItem(slotKey(slot));
}

// Legacy: migrate old single-slot save to slot 0 if present
export function migrateLegacySave() {
  const legacy = localStorage.getItem('unified-save');
  if (!legacy) return;
  if (!localStorage.getItem(slotKey(0))) {
    // Convert version 1 save to version 2 format
    try {
      const old = JSON.parse(legacy);
      old.version = SAVE_VERSION;
      old.money = old.money ?? 0;
      old.health = old.health ?? 100;
      old.armor = old.armor ?? 0;
      old.weapons = old.weapons ?? [];
      old.wantedLevel = old.wantedLevel ?? 0;
      localStorage.setItem(slotKey(0), JSON.stringify(old));
    } catch {}
  }
  localStorage.removeItem('unified-save');
}
