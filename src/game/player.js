// Player entity — first-person movement with angle
import { isKeyDown } from '../engine/input.js';
import { applyVelocity, applyFriction } from '../engine/physics.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 20;
    this.h = 20;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0; // radians, 0 = east, PI/2 = south
    this.speed = 300;
    this.turnSpeed = 2.5; // rad/sec for keyboard turning
    this.mouseSensitivity = 0.002;
  }

  update(dt) {
    // Keyboard turning (arrow keys)
    if (isKeyDown('ArrowLeft'))  this.angle -= this.turnSpeed * dt;
    if (isKeyDown('ArrowRight')) this.angle += this.turnSpeed * dt;

    // Forward / backward / strafe
    let fwd = 0, strafe = 0;
    if (isKeyDown('KeyW') || isKeyDown('ArrowUp'))    fwd =  1;
    if (isKeyDown('KeyS') || isKeyDown('ArrowDown'))   fwd = -1;
    if (isKeyDown('KeyA')) strafe = -1;
    if (isKeyDown('KeyD')) strafe =  1;

    if (fwd !== 0 && strafe !== 0) {
      const inv = 1 / Math.SQRT2;
      fwd *= inv;
      strafe *= inv;
    }

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const mx = (cos * fwd - sin * strafe) * this.speed;
    const my = (sin * fwd + cos * strafe) * this.speed;

    this.vx += mx * 4 * dt;
    this.vy += my * 4 * dt;

    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > this.speed) {
      this.vx = (this.vx / spd) * this.speed;
      this.vy = (this.vy / spd) * this.speed;
    }

    applyFriction(this, 0.001, dt);
    applyVelocity(this, dt);
  }
}
