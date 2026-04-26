// traffic.js — AI-driven traffic vehicles and police pursuit

const TRAFFIC_TYPES = [
  { name: 'Sedan', w: 20, h: 36, maxSpeed: 200, accel: 350, color: '#cc8833' },
  { name: 'Taxi',  w: 20, h: 36, maxSpeed: 170, accel: 300, color: '#ddcc33' },
  { name: 'Van',   w: 24, h: 42, maxSpeed: 140, accel: 260, color: '#7788aa' },
  { name: 'Coupe', w: 19, h: 34, maxSpeed: 260, accel: 450, color: '#3366cc' },
  { name: 'Bus',   w: 26, h: 52, maxSpeed: 110, accel: 170, color: '#dd7722' },
];

// Direction table: index → { angle (radians), tile step dr/dc }
// angle 0 = north (up), π/2 = east, π = south, -π/2 = west
const DIRS = [
  { angle: 0,             dr: -1, dc: 0 },  // North
  { angle: Math.PI / 2,  dr: 0,  dc: 1 },  // East
  { angle: Math.PI,      dr: 1,  dc: 0 },  // South
  { angle: -Math.PI / 2, dr: 0,  dc: -1 }, // West
];

export class TrafficVehicle {
  constructor(x, y, typeIndex, dirIndex) {
    const type = TRAFFIC_TYPES[typeIndex % TRAFFIC_TYPES.length];
    this.x = x;
    this.y = y;
    this.w = type.w;
    this.h = type.h;
    this.dirIndex = dirIndex;
    this.angle = DIRS[dirIndex].angle;
    this.speed = type.maxSpeed * (0.4 + Math.random() * 0.6);
    this.maxSpeed = type.maxSpeed;
    this.accel = type.accel;
    this.color = type.color;
    this.name = type.name;
    this.occupied = false;
    this.alive = true;
    this.stopTimer = 0;
    this.honkCooldown = 2 + Math.random() * 4;
    this.lookAheadDist = 56; // pixels ahead to check for road continuation
  }

  // Returns true if should honk
  update(dt, map, tileSize, playerX, playerY, otherTraffic, trafficLights = []) {
    const rows = map.length;
    const cols = map[0].length;

    // Look ahead in current direction
    const lookX = this.x + Math.sin(this.angle) * this.lookAheadDist;
    const lookY = this.y - Math.cos(this.angle) * this.lookAheadDist;
    const tileC = Math.floor(lookX / tileSize);
    const tileR = Math.floor(lookY / tileSize);

    let roadAhead = false;
    if (tileC >= 0 && tileR >= 0 && tileC < cols && tileR < rows) {
      const t = map[tileR][tileC];
      roadAhead = (t === 0 || t === 6); // ROAD or PARKING
    }

    // Check for traffic vehicle directly ahead (simple follow distance)
    let carAhead = false;
    for (const other of otherTraffic) {
      if (other === this || !other.alive) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      // Dot product along our forward direction
      const fwdX = Math.sin(this.angle);
      const fwdY = -Math.cos(this.angle);
      const dot = dx * fwdX + dy * fwdY;
      if (dot > 0 && dot < this.lookAheadDist + 40) {
        // Perpendicular distance check (lateral offset)
        const perp = Math.abs(dx * (-fwdY) - dy * fwdX);
        if (perp < 22) {
          carAhead = true;
          break;
        }
      }
    }

    // Check for red/yellow traffic light ahead — stop without rerouting
    let redLightAhead = false;
    if (roadAhead && !carAhead) {
      const fwdX = Math.sin(this.angle);
      const fwdY = -Math.cos(this.angle);
      for (const tl of trafficLights) {
        if (tl.phase === 'green') continue;
        const dx = tl.x - this.x;
        const dy = tl.y - this.y;
        const dot = dx * fwdX + dy * fwdY;
        if (dot > 8 && dot < this.lookAheadDist + 24) {
          const perp = Math.abs(dx * (-fwdY) - dy * fwdX);
          if (perp < 40) { redLightAhead = true; break; }
        }
      }
    }

    if (!roadAhead || carAhead) {
      // Decelerate
      this.speed = Math.max(0, this.speed - this.accel * 3 * dt);

      if (this.speed < 5) {
        this.stopTimer += dt;

        // After waiting, try to turn to find a valid road
        if (this.stopTimer > 0.6) {
          const cx = Math.floor(this.x / tileSize);
          const cy = Math.floor(this.y / tileSize);
          const reverseDir = (this.dirIndex + 2) % 4;
          const options = [];

          for (let d = 0; d < 4; d++) {
            if (d === reverseDir) continue;
            const nd = DIRS[d];
            const nr = cy + nd.dr;
            const nc = cx + nd.dc;
            if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) {
              if (map[nr][nc] === 0 || map[nr][nc] === 6) {
                options.push(d);
              }
            }
          }

          if (options.length > 0) {
            this.dirIndex = options[Math.floor(Math.random() * options.length)];
          } else {
            this.dirIndex = reverseDir; // reverse if no options
          }
          this.angle = DIRS[this.dirIndex].angle;
          this.stopTimer = 0;
        }
      }
    } else if (redLightAhead) {
      // Stop for red light — decelerate but don't reroute
      this.speed = Math.max(0, this.speed - this.accel * 2.5 * dt);
      this.stopTimer = 0;
    } else {
      this.stopTimer = 0;
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
    }

    // Move forward
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y -= Math.cos(this.angle) * this.speed * dt;

    // Cull if out of world bounds
    const margin = 80;
    if (
      this.x < margin || this.y < margin ||
      this.x > cols * tileSize - margin ||
      this.y > rows * tileSize - margin
    ) {
      this.alive = false;
    }

    // Honk when close to player
    this.honkCooldown -= dt;
    const pdx = this.x - playerX;
    const pdy = this.y - playerY;
    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (playerDist < 70 && this.speed > 40 && this.honkCooldown <= 0) {
      this.honkCooldown = 4 + Math.random() * 3;
      return true; // caller should play honk
    }
    return false;
  }
}

export class CopVehicle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 44;
    this.angle = 0;
    this.speed = 0;
    this.maxSpeed = 380;
    this.accel = 700;
    this.color = '#2255dd';
    this.sirenColor = '#ff3333';
    this.name = 'Police';
    this.occupied = false;
    this.alive = true;
    this.sirenPhase = 0;
    this.ramCooldown = 0;
  }

  // Returns distance to player
  update(dt, playerX, playerY) {
    this.sirenPhase += dt * 5;
    this.sirenColor = Math.floor(this.sirenPhase) % 2 === 0 ? '#ff3333' : '#2244ff';

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 20) {
      const targetAngle = Math.atan2(dx, -dy);
      let angleDiff = targetAngle - this.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Sharper turning at low speed
      const turnRate = dt * (this.speed < 100 ? 5 : 2.5);
      this.angle += angleDiff * Math.min(1, turnRate);

      const urgency = Math.min(1, dist / 300);
      this.speed = Math.min(this.maxSpeed * (0.3 + urgency * 0.7), this.speed + this.accel * dt);
    } else {
      this.speed *= Math.max(0, 1 - dt * 5);
    }

    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y -= Math.cos(this.angle) * this.speed * dt;

    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    return dist;
  }
}

export function spawnTraffic(map, tileSize, count) {
  const vehicles = [];
  const rows = map.length;
  const cols = map[0].length;
  let attempts = 0;

  while (vehicles.length < count && attempts < count * 30) {
    attempts++;
    const r = 2 + Math.floor(Math.random() * (rows - 4));
    const c = 2 + Math.floor(Math.random() * (cols - 4));

    if (map[r][c] !== 0) continue; // must be on a road tile

    // Find which directions have road tiles next to this one
    const validDirs = [];
    for (let d = 0; d < 4; d++) {
      const nd = DIRS[d];
      const nr = r + nd.dr;
      const nc = c + nd.dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 0) {
        validDirs.push(d);
      }
    }
    if (validDirs.length === 0) continue;

    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;

    // Spacing check
    const tooClose = vehicles.some(v => {
      const dx = v.x - wx;
      const dy = v.y - wy;
      return dx * dx + dy * dy < 220 * 220;
    });
    if (tooClose) continue;

    const dirIndex = validDirs[Math.floor(Math.random() * validDirs.length)];
    const typeIdx = Math.floor(Math.random() * TRAFFIC_TYPES.length);
    vehicles.push(new TrafficVehicle(wx, wy, typeIdx, dirIndex));
  }

  return vehicles;
}

// Spawn a cop vehicle near the player (off-screen)
export function spawnCopNear(playerX, playerY, worldW, worldH) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 300;
  const x = Math.max(60, Math.min(worldW - 60, playerX + Math.cos(angle) * dist));
  const y = Math.max(60, Math.min(worldH - 60, playerY + Math.sin(angle) * dist));
  return new CopVehicle(x, y);
}

// Police helicopter — circles player at wanted level 5
export class PoliceHelicopter {
  constructor(playerX, playerY) {
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.orbitRadius = 250;
    this.orbitSpeed = 0.8;
    this.x = playerX + Math.cos(this.orbitAngle) * this.orbitRadius;
    this.y = playerY + Math.sin(this.orbitAngle) * this.orbitRadius;
    this.spotlightAngle = 0;
    this.active = true;
    this.bladeAngle = 0;
    this.shootCooldown = 3;
  }

  update(dt, playerX, playerY) {
    this.orbitAngle += this.orbitSpeed * dt;
    this.x = playerX + Math.cos(this.orbitAngle) * this.orbitRadius;
    this.y = playerY + Math.sin(this.orbitAngle) * this.orbitRadius;
    this.bladeAngle += dt * 25;
    this.spotlightAngle = Math.atan2(playerY - this.y, playerX - this.x);

    // Helicopter shoots at player periodically
    this.shootCooldown -= dt;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = 2.5 + Math.random() * 2;
      return { // return shot info
        fromX: this.x,
        fromY: this.y,
        angle: this.spotlightAngle,
        damage: 5,
        range: 300,
      };
    }
    return null;
  }
}

// Roadblock — placed ahead of player at wanted level 4+
export class Roadblock {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.w = 80;
    this.h = 12;
    this.active = true;
    this.cops = [];
  }
}

export function spawnRoadblock(playerX, playerY, playerAngle, map, tileSize, worldW, worldH) {
  const dist = 400 + Math.random() * 200;
  const bx = playerX + Math.cos(playerAngle) * dist;
  const by = playerY + Math.sin(playerAngle) * dist;

  const col = Math.floor(bx / tileSize);
  const row = Math.floor(by / tileSize);
  if (row < 0 || row >= map.length || col < 0 || col >= map[0].length) return null;
  if (map[row][col] !== 0) return null;

  const block = new Roadblock(bx, by, playerAngle + Math.PI / 2);

  for (let i = 0; i < 2; i++) {
    const offset = (i - 0.5) * 50;
    const cop = new CopVehicle(
      Math.max(60, Math.min(worldW - 60, bx + Math.cos(block.angle) * offset)),
      Math.max(60, Math.min(worldH - 60, by + Math.sin(block.angle) * offset))
    );
    cop.speed = 0;
    block.cops.push(cop);
  }

  return block;
}
