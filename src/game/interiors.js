// Interior system — enter/exit buildings, indoor areas

export const INTERIOR_TYPES = {
  shop:     { name: 'Shop',      w: 8, h: 6, color: '#8B7355', floorColor: [60, 55, 48] },
  hideout:  { name: 'Hideout',   w: 10, h: 8, color: '#555555', floorColor: [40, 38, 36] },
  office:   { name: 'Office',    w: 12, h: 8, color: '#666677', floorColor: [55, 55, 60] },
  bar:      { name: 'Bar',       w: 10, h: 6, color: '#4a3728', floorColor: [38, 30, 24] },
  garage:   { name: 'Garage',    w: 14, h: 10, color: '#555555', floorColor: [45, 45, 48] },
};

export class InteriorSystem {
  constructor(tileSize) {
    this.tileSize = tileSize;
    this.doors = [];       // { x, y, interiorId, type }
    this.interiors = [];   // { id, type, tiles, entryX, entryY, ... }
    this.activeInterior = null; // currently inside an interior
    this.transitionTimer = 0;
    this.transitionState = 'none'; // none, entering, inside, exiting
  }

  // Place doors on certain building tiles near sidewalks
  placeDoors(map) {
    const rows = map.length;
    const cols = map[0].length;
    const ts = this.tileSize;
    let doorId = 0;

    // Find building tiles adjacent to sidewalks — these can have doors
    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        if (map[r][c] !== 2) continue; // BUILDING only

        // Check if adjacent to sidewalk
        let hasSidewalk = false;
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 1) {
            hasSidewalk = true;
          }
        }
        if (!hasSidewalk) continue;

        // Only ~5% of eligible buildings get doors (not too many)
        const hash = ((r * 374761393 + c * 668265263) & 0x7fffffff) / 0x7fffffff;
        if (hash > 0.05) continue;

        // Determine interior type based on hash
        const types = Object.keys(INTERIOR_TYPES);
        const typeIdx = Math.floor(((hash * 1000) % 1) * types.length);
        const intType = types[typeIdx];
        const def = INTERIOR_TYPES[intType];

        // Generate interior map (simple room)
        const interior = this._generateInterior(doorId, intType, def);

        this.doors.push({
          x: c * ts + ts / 2,
          y: r * ts + ts / 2,
          interiorId: doorId,
          type: intType,
          radius: 30,
        });
        this.interiors.push(interior);
        doorId++;
      }
    }
  }

  _generateInterior(id, type, def) {
    const tiles = [];
    // Simple rectangular room with walls around edges
    for (let r = 0; r < def.h; r++) {
      tiles[r] = [];
      for (let c = 0; c < def.w; c++) {
        if (r === 0 || r === def.h - 1 || c === 0 || c === def.w - 1) {
          tiles[r][c] = 5; // WALL
        } else {
          tiles[r][c] = 1; // SIDEWALK (walkable floor)
        }
      }
    }
    // Door in bottom wall center
    const doorC = Math.floor(def.w / 2);
    tiles[def.h - 1][doorC] = 1; // opening

    return {
      id,
      type,
      name: def.name,
      tiles,
      w: def.w,
      h: def.h,
      floorColor: def.floorColor,
      entryX: doorC * this.tileSize + this.tileSize / 2,
      entryY: (def.h - 2) * this.tileSize + this.tileSize / 2,
    };
  }

  // Check if player is near a door
  getNearbyDoor(playerX, playerY) {
    if (this.activeInterior) return null; // already inside
    for (const door of this.doors) {
      const dx = door.x - playerX;
      const dy = door.y - playerY;
      if (dx * dx + dy * dy < door.radius * door.radius) {
        return door;
      }
    }
    return null;
  }

  enterInterior(door) {
    const interior = this.interiors.find(i => i.id === door.interiorId);
    if (!interior) return null;
    this.activeInterior = interior;
    this.transitionState = 'entering';
    this.transitionTimer = 0.5;
    return interior;
  }

  exitInterior() {
    if (!this.activeInterior) return null;
    const door = this.doors.find(d => d.interiorId === this.activeInterior.id);
    this.transitionState = 'exiting';
    this.transitionTimer = 0.5;
    // Return the door location so main.js can teleport player
    return door;
  }

  update(dt) {
    if (this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        if (this.transitionState === 'entering') {
          this.transitionState = 'inside';
        } else if (this.transitionState === 'exiting') {
          this.transitionState = 'none';
          this.activeInterior = null;
        }
      }
    }
  }

  // Check if player walks to the exit of the interior
  isAtExit(playerX, playerY) {
    if (!this.activeInterior) return false;
    const int = this.activeInterior;
    const exitX = int.entryX;
    const exitY = (int.h - 1) * this.tileSize + this.tileSize / 2;
    const dx = playerX - exitX;
    const dy = playerY - exitY;
    return dx * dx + dy * dy < 25 * 25;
  }

  // Get markers for minimap/HUD
  getDoorMarkers() {
    return this.doors.map(d => ({
      x: d.x,
      y: d.y,
      type: 'door',
      label: INTERIOR_TYPES[d.type]?.name || 'Building',
    }));
  }

  // Draw transition overlay
  drawTransition(ctx, canvasW, canvasH) {
    if (this.transitionState === 'entering' || this.transitionState === 'exiting') {
      const progress = 1 - (this.transitionTimer / 0.5);
      const alpha = this.transitionState === 'entering' ? progress : (1 - progress);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // Interior name overlay when entering
    if (this.transitionState === 'inside' && this.activeInterior) {
      // Just entered — brief flash of name could be shown via notification
    }
  }
}
