// NPC pedestrians — walk along sidewalks with basic AI

const NPC_COLORS = ['#e07040', '#40a0e0', '#e0e040', '#e040a0', '#40e080', '#c070d0', '#d09050'];
const NPC_NAMES = ['Pedestrian', 'Citizen', 'Tourist', 'Worker', 'Jogger'];

export class NPC {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vx = 0;
    this.vy = 0;
    this.speed = 60 + Math.random() * 40;
    this.color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    this.skinColor = `hsl(${25 + Math.random() * 20}, ${40 + Math.random() * 30}%, ${50 + Math.random() * 30}%)`;
    this.name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];

    // AI state
    this.dirChangeTimer = 0;
    this.direction = Math.floor(Math.random() * 4); // 0=up 1=right 2=down 3=left
    this.idleTimer = 0;
    this.fleeing = false;
    this.fleeTimer = 0;
  }

  update(dt, map, tileSize, playerX, playerY, playerInVehicle, playerSpeed) {
    // Flee from fast-moving vehicles nearby
    if (playerInVehicle && playerSpeed > 150) {
      const dx = this.x - playerX;
      const dy = this.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        this.fleeing = true;
        this.fleeTimer = 1.5;
        // Run away from player
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        this.vx = nx * this.speed * 3;
        this.vy = ny * this.speed * 3;
      }
    }

    if (this.fleeing) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.fleeing = false;
    }

    if (!this.fleeing) {
      // Idle pause
      if (this.idleTimer > 0) {
        this.idleTimer -= dt;
        this.vx = 0;
        this.vy = 0;
        return;
      }

      // Change direction periodically
      this.dirChangeTimer -= dt;
      if (this.dirChangeTimer <= 0) {
        this.direction = Math.floor(Math.random() * 4);
        this.dirChangeTimer = 2 + Math.random() * 4;

        // Occasionally stop
        if (Math.random() < 0.2) {
          this.idleTimer = 1 + Math.random() * 3;
          return;
        }
      }

      // Move in current direction
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = dirs[this.direction];
      this.vx = dx * this.speed;
      this.vy = dy * this.speed;

      // Check if next position is walkable (sidewalk, park, road)
      const nextX = this.x + this.vx * dt;
      const nextY = this.y + this.vy * dt;
      const col = Math.floor(nextX / tileSize);
      const row = Math.floor(nextY / tileSize);
      if (row >= 0 && col >= 0 && row < map.length && col < map[0].length) {
        const tile = map[row][col];
        // NPCs walk on sidewalks, parks, and sometimes roads
        if (tile !== 1 && tile !== 7 && tile !== 0 && tile !== 6) {
          // Hit a wall/building — turn
          this.direction = (this.direction + 1 + Math.floor(Math.random() * 2)) % 4;
          this.vx = 0;
          this.vy = 0;
        }
      }
    }

    // Apply movement
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Friction when fleeing
    if (this.fleeing) {
      this.vx *= 0.98;
      this.vy *= 0.98;
    }
  }
}

// Spawn NPCs on sidewalks
export function spawnNPCs(map, tileSize, count) {
  const npcs = [];
  const rows = map.length;
  const cols = map[0].length;
  let attempts = 0;

  while (npcs.length < count && attempts < count * 10) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);

    // Spawn on sidewalks (1) or parks (7)
    if (map[r][c] !== 1 && map[r][c] !== 7) continue;

    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;

    npcs.push(new NPC(wx, wy));
  }

  return npcs;
}
