// Tile-based world — defines terrain, collisions, and world data

// Tile types
export const TILE = {
  GRASS: 0,
  DIRT: 1,
  WATER: 2,
  WALL: 3,
  SAND: 4,
  STONE: 5,
};

// Tile colors for rendering
export const TILE_COLORS = {
  [TILE.GRASS]: '#2d5a27',
  [TILE.DIRT]:  '#5c3d2e',
  [TILE.WATER]: '#1a3a5c',
  [TILE.WALL]:  '#555555',
  [TILE.SAND]:  '#c2b280',
  [TILE.STONE]: '#777777',
};

// Which tiles are solid (block movement)
export const SOLID_TILES = new Set([TILE.WALL, TILE.WATER]);

export const TILE_SIZE = 32;

// Generate a procedural world map
export function generateWorld(cols, rows) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      // Border walls
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) {
        row.push(TILE.WALL);
        continue;
      }
      // Simple procedural generation using noise-like patterns
      const nx = c / cols;
      const ny = r / rows;
      const val = pseudoNoise(c, r);

      if (val < 0.08) {
        row.push(TILE.WATER);
      } else if (val < 0.15) {
        row.push(TILE.SAND);
      } else if (val < 0.25) {
        row.push(TILE.DIRT);
      } else if (val > 0.92) {
        row.push(TILE.WALL); // scattered rocks/buildings
      } else if (val > 0.85) {
        row.push(TILE.STONE);
      } else {
        row.push(TILE.GRASS);
      }
    }
    map.push(row);
  }

  // Clear spawn area (center)
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);
  for (let r = midR - 3; r <= midR + 3; r++) {
    for (let c = midC - 3; c <= midC + 3; c++) {
      if (r > 0 && c > 0 && r < rows - 1 && c < cols - 1) {
        map[r][c] = TILE.GRASS;
      }
    }
  }

  return map;
}

// Cheap hash-based pseudo noise (deterministic, no dependencies)
function pseudoNoise(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n & 0x7fffffff) / 0x7fffffff;
}

// Get solids around a position for collision
export function getSolidRectsNear(map, x, y, radius) {
  const rects = [];
  const startCol = Math.max(0, Math.floor((x - radius) / TILE_SIZE));
  const endCol = Math.min(map[0].length - 1, Math.ceil((x + radius) / TILE_SIZE));
  const startRow = Math.max(0, Math.floor((y - radius) / TILE_SIZE));
  const endRow = Math.min(map.length - 1, Math.ceil((y + radius) / TILE_SIZE));

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      if (SOLID_TILES.has(map[r][c])) {
        rects.push({ x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
      }
    }
  }
  return rects;
}
