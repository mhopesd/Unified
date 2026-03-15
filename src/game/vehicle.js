// Vehicle system — GTA-style cars you can enter/exit and drive

import { isKeyDown } from '../engine/input.js';

const CAR_TYPES = [
  { name: 'Sedan', w: 22, h: 40, speed: 500, accel: 800, color: '#cc3333', turnSpeed: 3.5 },
  { name: 'Sports', w: 20, h: 38, speed: 700, accel: 1200, color: '#3366cc', turnSpeed: 4.0 },
  { name: 'Truck', w: 26, h: 48, speed: 350, accel: 500, color: '#666666', turnSpeed: 2.5 },
  { name: 'Taxi', w: 22, h: 40, speed: 450, accel: 700, color: '#ddcc33', turnSpeed: 3.5 },
  { name: 'SUV', w: 24, h: 44, speed: 420, accel: 650, color: '#2a2a2a', turnSpeed: 3.0 },
];

export class Vehicle {
  constructor(x, y, typeIndex) {
    const type = CAR_TYPES[typeIndex % CAR_TYPES.length];
    this.x = x;
    this.y = y;
    this.w = type.w;
    this.h = type.h;
    this.angle = 0; // radians
    this.speed = 0; // current speed
    this.maxSpeed = type.speed;
    this.accel = type.accel;
    this.turnSpeed = type.turnSpeed;
    this.color = type.color;
    this.name = type.name;
    this.occupied = false;
    this.friction = 0.97;
    this.braking = 0.92;
  }

  update(dt) {
    if (!this.occupied) return;

    // Accelerate / brake
    if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) {
      this.speed += this.accel * dt;
    } else if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) {
      this.speed -= this.accel * 0.6 * dt;
    } else {
      // Coast / friction
      this.speed *= this.friction;
    }

    // Brake
    if (isKeyDown('Space')) {
      this.speed *= this.braking;
    }

    // Clamp speed
    this.speed = Math.max(-this.maxSpeed * 0.3, Math.min(this.speed, this.maxSpeed));

    // Stop tiny speeds
    if (Math.abs(this.speed) < 2) this.speed = 0;

    // Steering (only when moving)
    if (Math.abs(this.speed) > 10) {
      const steerFactor = Math.min(1, Math.abs(this.speed) / 200);
      if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) {
        this.angle -= this.turnSpeed * steerFactor * dt;
      }
      if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) {
        this.angle += this.turnSpeed * steerFactor * dt;
      }
    }

    // Apply movement
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y -= Math.cos(this.angle) * this.speed * dt;
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
    // Check if road runs horizontal or vertical
    const leftRoad = c > 0 && map[r][c - 1] === 0;
    const rightRoad = c < cols - 1 && map[r][c + 1] === 0;
    if (leftRoad && rightRoad) {
      v.angle = Math.PI / 2; // horizontal road
    }
    // Otherwise default angle (0) = vertical

    vehicles.push(v);
  }

  return vehicles;
}
