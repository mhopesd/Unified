// City world — GTA-style grid with roads, buildings, sidewalks, parks

export const TILE = {
  ROAD: 0,
  SIDEWALK: 1,
  BUILDING: 2,
  GRASS: 3,
  WATER: 4,
  WALL: 5,
  PARKING: 6,
  PARK: 7,
};

export const TILE_COLORS = {
  [TILE.ROAD]:     '#3a3a3a',
  [TILE.SIDEWALK]: '#888888',
  [TILE.BUILDING]: '#555555',
  [TILE.GRASS]:    '#2d5a27',
  [TILE.WATER]:    '#1a3a5c',
  [TILE.WALL]:     '#444444',
  [TILE.PARKING]:  '#4a4a4a',
  [TILE.PARK]:     '#2a6b22',
};

export const SOLID_TILES = new Set([TILE.BUILDING, TILE.WALL, TILE.WATER]);

export const TILE_SIZE = 32;

function hash2d(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n & 0x7fffffff) / 0x7fffffff;
}

// Generate a GTA-style city grid
export function generateWorld(cols, rows) {
  const map = [];
  for (let r = 0; r < rows; r++) {
    map[r] = [];
    for (let c = 0; c < cols; c++) {
      map[r][c] = TILE.GRASS;
    }
  }

  // Border walls
  for (let r = 0; r < rows; r++) {
    map[r][0] = TILE.WALL;
    map[r][cols - 1] = TILE.WALL;
  }
  for (let c = 0; c < cols; c++) {
    map[0][c] = TILE.WALL;
    map[rows - 1][c] = TILE.WALL;
  }

  // City grid — narrow streets, dense blocks
  const blockW = 5;  // tiles between roads (tight blocks)
  const blockH = 4;
  const roadWidth = 1; // narrow single-tile streets

  // Lay down horizontal roads
  for (let r = 4; r < rows - 3; r += blockH + roadWidth) {
    for (let rr = 0; rr < roadWidth && r + rr < rows - 1; rr++) {
      for (let c = 1; c < cols - 1; c++) {
        map[r + rr][c] = TILE.ROAD;
      }
    }
  }

  // Lay down vertical roads
  for (let c = 4; c < cols - 3; c += blockW + roadWidth) {
    for (let cc = 0; cc < roadWidth && c + cc < cols - 1; cc++) {
      for (let r = 1; r < rows - 1; r++) {
        map[r][c + cc] = TILE.ROAD;
      }
    }
  }

  // Random alleys — cut narrow passages through some blocks
  for (let r = 5; r < rows - 5; r += blockH + roadWidth) {
    for (let c = 5; c < cols - 5; c += blockW + roadWidth) {
      if (hash2d(c, r + 99) < 0.3) {
        // Horizontal alley through this block
        const ay = r + Math.floor(blockH / 2);
        for (let dc = 0; dc < blockW; dc++) {
          if (ay > 0 && ay < rows - 1 && c + dc > 0 && c + dc < cols - 1) {
            map[ay][c + dc] = TILE.ROAD;
          }
        }
      }
      if (hash2d(c + 77, r) < 0.25) {
        // Vertical alley
        const ax = c + Math.floor(blockW / 2);
        for (let dr = 0; dr < blockH; dr++) {
          if (r + dr > 0 && r + dr < rows - 1 && ax > 0 && ax < cols - 1) {
            map[r + dr][ax] = TILE.ROAD;
          }
        }
      }
    }
  }

  // Add sidewalks adjacent to roads
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (map[r][c] !== TILE.ROAD) continue;
      // Check neighbors — add sidewalk if neighbor is not road
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr > 0 && nc > 0 && nr < rows - 1 && nc < cols - 1) {
          if (map[nr][nc] !== TILE.ROAD && map[nr][nc] !== TILE.WALL) {
            map[nr][nc] = TILE.SIDEWALK;
          }
        }
      }
    }
  }

  // Fill city blocks with buildings
  for (let r = 2; r < rows - 2; r++) {
    for (let c = 2; c < cols - 2; c++) {
      if (map[r][c] === TILE.GRASS) {
        // Check if inside a city block (surrounded by sidewalks/roads)
        const nearRoad = isNearTile(map, r, c, TILE.SIDEWALK, 2, rows, cols);
        if (nearRoad) {
          const h = hash2d(c, r);
          if (h < 0.82) {
            map[r][c] = TILE.BUILDING;
          } else if (h < 0.92) {
            map[r][c] = TILE.PARKING;
          } else {
            map[r][c] = TILE.SIDEWALK; // small courtyard/gap
          }
        }
      }
    }
  }

  // Add a few parks (replace some building blocks)
  const parkLocations = [
    { r: Math.floor(rows * 0.3), c: Math.floor(cols * 0.3) },
    { r: Math.floor(rows * 0.7), c: Math.floor(cols * 0.6) },
  ];
  for (const pl of parkLocations) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const pr = pl.r + dr;
        const pc = pl.c + dc;
        if (pr > 1 && pc > 1 && pr < rows - 2 && pc < cols - 2) {
          if (map[pr][pc] === TILE.BUILDING || map[pr][pc] === TILE.PARKING || map[pr][pc] === TILE.GRASS) {
            map[pr][pc] = TILE.PARK;
          }
        }
      }
    }
  }

  // Add water feature (river along one edge)
  const riverCol = Math.floor(cols * 0.85);
  for (let r = 1; r < rows - 1; r++) {
    for (let dc = 0; dc < 4; dc++) {
      const c = riverCol + dc;
      if (c > 0 && c < cols - 1) {
        map[r][c] = TILE.WATER;
      }
    }
    // Sidewalk along river
    if (riverCol - 1 > 0) map[r][riverCol - 1] = TILE.SIDEWALK;
  }

  // Clear spawn area — ensure the nearest road intersection to center has open space
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);
  // Find nearest road tile to center and clear buildings around it
  let spawnR = midR, spawnC = midC;
  outer: for (let radius = 0; radius < 15; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
        const r = midR + dr, c = midC + dc;
        if (r > 1 && c > 1 && r < rows - 1 && c < cols - 1 && map[r][c] === TILE.ROAD) {
          spawnR = r; spawnC = c;
          break outer;
        }
      }
    }
  }
  // Clear buildings in a wider area around spawn road
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const sr = spawnR + dr;
      const sc = spawnC + dc;
      if (sr > 0 && sc > 0 && sr < rows - 1 && sc < cols - 1) {
        if (map[sr][sc] === TILE.BUILDING) {
          map[sr][sc] = TILE.SIDEWALK;
        }
      }
    }
  }

  return map;
}

function isNearTile(map, r, c, tileType, dist, rows, cols) {
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) {
        if (map[nr][nc] === tileType) return true;
      }
    }
  }
  return false;
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

// Find nearest road tile to a position (for spawning vehicles)
export function findNearestRoad(map, worldX, worldY) {
  const col = Math.floor(worldX / TILE_SIZE);
  const row = Math.floor(worldY / TILE_SIZE);
  for (let dist = 0; dist < 20; dist++) {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && c >= 0 && r < map.length && c < map[0].length) {
          if (map[r][c] === TILE.ROAD) {
            return { x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 };
          }
        }
      }
    }
  }
  return { x: worldX, y: worldY };
}
