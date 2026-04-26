// Vehicle system — GTA-style cars you can enter/exit and drive
// Includes realistic drift physics with lateral velocity separation

import { isKeyDown } from '../engine/input.js';

const CAR_TYPES = [
  { name: 'Sedan',  w: 22, h: 40, speed: 500, accel: 800,  color: '#cc3333', turnSpeed: 3.5, grip: 0.91 },
  { name: 'Sports', w: 20, h: 38, speed: 700, accel: 1200, color: '#3366cc', turnSpeed: 4.0, grip: 0.88 },
  { name: 'Truck',  w: 26, h: 48, speed: 350, accel: 500,  color: '#666666', turnSpeed: 2.5, grip: 0.94 },
  { name: 'Taxi',   w: 22, h: 40, speed: 450, accel: 700,  color: '#ddcc33', turnSpeed: 3.5, grip: 0.91 },
  { name: 'SUV',    w: 24, h: 44, speed: 420, accel: 650,  color: '#2a2a2a', turnSpeed: 3.0, grip: 0.93 },
];

export class Vehicle {
  constructor(x, y, typeIndex) {
    const type = CAR_TYPES[typeIndex % CAR_TYPES.length];
    this.x = x;
    this.y = y;
    this.w = type.w;
    this.h = type.h;
    this.angle = 0;       // heading in radians
    this.velX = 0;        // world-space velocity X
    this.velY = 0;        // world-space velocity Y
    this.speed = 0;       // forward speed (for HUD/sounds, signed)
    this.maxSpeed = type.speed;
    this.baseMaxSpeed = type.speed;
    this.accel = type.accel;
    this.baseAccel = type.accel;
    this.turnSpeed = type.turnSpeed;
    this.baseGrip = type.grip;  // tire grip (0=slide, 1=perfect)
    this.color = type.color;
    this.originalColor = type.color;
    this.name = type.name;
    this.occupied = false;
    this.drifting = false;   // true when sliding sideways noticeably
    this.driftIntensity = 0; // 0–1 for particle/sound scaling

    // Damage system
    this.health = 100;
    this.maxHealth = 100;
    this.destroyed = false;
    this.damageLevel = 0;  // 0=pristine, 1=scratched, 2=dented, 3=smoking, 4=on fire
    this.fireTimer = 0;    // countdown to explosion when on fire
    this.smokeTimer = 0;   // smoke particle emission timer
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);

    const pct = this.health / this.maxHealth;
    if (pct > 0.75) this.damageLevel = 0;
    else if (pct > 0.50) this.damageLevel = 1;
    else if (pct > 0.25) this.damageLevel = 2;
    else if (pct > 0) this.damageLevel = 3;
    else { this.damageLevel = 4; this.fireTimer = 3.5; }

    // Performance degrades with damage
    const perfMul = 0.5 + pct * 0.5;
    this.maxSpeed = this.baseMaxSpeed * perfMul;
    this.accel = this.baseAccel * perfMul;
  }

  // Returns true if vehicle just exploded this frame
  updateDamage(dt) {
    if (this.destroyed) return false;
    if (this.damageLevel >= 3) this.smokeTimer -= dt;
    if (this.damageLevel >= 4) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.destroyed = true;
        this.occupied = false;
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (!this.occupied) return;

    // Forward/right unit vectors at current heading
    const fwdX =  Math.sin(this.angle);
    const fwdY = -Math.cos(this.angle);
    const latX = -fwdY;   // perpendicular right
    const latY =  fwdX;

    // Decompose world velocity into forward and lateral components
    let fwdV = this.velX * fwdX + this.velY * fwdY;
    let latV = this.velX * latX + this.velY * latY;

    // --- Accelerate / brake along forward axis ---
    if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) {
      fwdV += this.accel * dt;
    } else if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) {
      fwdV -= this.accel * 0.65 * dt;
    } else {
      fwdV *= 0.975; // engine coast friction
    }

    const handbrake = isKeyDown('Space');
    if (handbrake) {
      fwdV *= 0.93;
    }

    // Clamp forward speed
    fwdV = Math.max(-this.maxSpeed * 0.3, Math.min(fwdV, this.maxSpeed));
    if (Math.abs(fwdV) < 2) fwdV = 0;

    // --- Steering (scales with speed for realism) ---
    if (Math.abs(fwdV) > 10) {
      const steerFactor = Math.min(1, Math.abs(fwdV) / 200);
      if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) {
        this.angle -= this.turnSpeed * steerFactor * dt;
      }
      if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) {
        this.angle += this.turnSpeed * steerFactor * dt;
      }
    }

    // --- Tire grip / drift ---
    // At high speed + handbrake → slip. Normally tyres grip and kill lateral velocity.
    const speedFrac = Math.min(1, Math.abs(fwdV) / this.maxSpeed);
    let grip = this.baseGrip - speedFrac * 0.06; // less grip at high speed
    if (handbrake) grip -= 0.28; // handbrake breaks traction hard
    grip = Math.max(0.3, grip);

    latV *= grip; // lateral bleed-off

    // Reconstruct velocity using NEW heading (after steering this frame)
    const nfX =  Math.sin(this.angle);
    const nfY = -Math.cos(this.angle);
    const nlX = -nfY;
    const nlY =  nfX;

    this.velX = nfX * fwdV + nlX * latV;
    this.velY = nfY * fwdV + nlY * latV;

    // Advance position
    this.x += this.velX * dt;
    this.y += this.velY * dt;

    // Update scalar speed (signed forward component for HUD/sounds)
    this.speed = fwdV;

    // Drift state for particles + screech sound
    this.driftIntensity = Math.min(1, Math.abs(latV) / 150);
    this.drifting = this.driftIntensity > 0.25 && Math.abs(fwdV) > 80;
  }

  // Get AABB for collision (axis-aligned bounding box from rotated rect)
  getAABB() {
    const hw = this.w / 2 + 2;
    const hh = this.h / 2 + 2;
    return {
      x: this.x - hw,
      y: this.y - hh,
      w: hw * 2,
      h: hh * 2,
    };
  }
}

// Spawn parked cars along roads
export function spawnVehicles(map, tileSize, count) {
  const vehicles = [];
  const rows = map.length;
  const cols = map[0].length;
  let attempts = 0;

  while (vehicles.length < count && attempts < count * 10) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);

    if (map[r][c] !== 0) continue; // ROAD = 0

    // Check it's on a road edge (near sidewalk)
    let nearSidewalk = false;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < rows && nc < cols && map[nr][nc] === 1) {
        nearSidewalk = true;
      }
    }
    if (!nearSidewalk) continue;

    // Check not too close to other vehicles
    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;
    const tooClose = vehicles.some(v => {
      const dx = v.x - wx;
      const dy = v.y - wy;
      return Math.sqrt(dx * dx + dy * dy) < 80;
    });
    if (tooClose) continue;

    const typeIdx = Math.floor(Math.random() * CAR_TYPES.length);
    const v = new Vehicle(wx, wy, typeIdx);

    // Align to road direction
    const leftRoad = c > 0 && map[r][c - 1] === 0;
    const rightRoad = c < cols - 1 && map[r][c + 1] === 0;
    if (leftRoad && rightRoad) {
      v.angle = Math.PI / 2; // horizontal road
    }

    vehicles.push(v);
  }

  return vehicles;
}
