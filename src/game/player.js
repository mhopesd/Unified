// Player entity — WASD movement with physics
import { isKeyDown } from '../engine/input.js';
import { applyVelocity, applyFriction } from '../engine/physics.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 28;
    this.h = 28;
    this.vx = 0;
    this.vy = 0;
    this.speed = 400;
    this.color = '#4fc3f7';
  }

  update(dt) {
    // Input → acceleration
    let ax = 0, ay = 0;
    if (isKeyDown('KeyW') || isKeyDown('ArrowUp'))    ay = -1;
    if (isKeyDown('KeyS') || isKeyDown('ArrowDown'))   ay =  1;
    if (isKeyDown('KeyA') || isKeyDown('ArrowLeft'))    ax = -1;
    if (isKeyDown('KeyD') || isKeyDown('ArrowRight'))   ax =  1;

    // Normalize diagonal movement
    if (ax !== 0 && ay !== 0) {
      const inv = 1 / Math.SQRT2;
      ax *= inv;
      ay *= inv;
    }

    this.vx += ax * this.speed * 4 * dt;
    this.vy += ay * this.speed * 4 * dt;

    // Cap velocity
    const maxV = this.speed;
    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > maxV) {
      this.vx = (this.vx / spd) * maxV;
      this.vy = (this.vy / spd) * maxV;
    }

    applyFriction(this, 0.001, dt); // heavy friction for responsive feel
    applyVelocity(this, dt);
  }
}
