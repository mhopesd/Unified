// Save/Load system — persists game state to localStorage

const SAVE_KEY = 'unified-save';

export function saveGame(player, missionEngine) {
  const data = {
    version: 1,
    timestamp: Date.now(),
    player: {
      x: player.x,
      y: player.y,
    },
    completedMissions: [...missionEngine.completedIds],
    activeMissions: missionEngine.activeMissions.map(m => ({
      id: m.data.id,
      currentObjective: m.currentObjective,
    })),
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
