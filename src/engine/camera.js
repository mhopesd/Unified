// Camera follows a target entity, with smooth lerp

export class Camera {
  constructor(viewW, viewH) {
    this.x = 0;
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
    this.smoothing = 8; // higher = snappier
  }

  follow(target, dt) {
    const targetX = target.x + target.w / 2 - this.viewW / 2;
    const targetY = target.y + target.h / 2 - this.viewH / 2;
    const t = 1 - Math.exp(-this.smoothing * dt);
    this.x += (targetX - this.x) * t;
    this.y += (targetY - this.y) * t;
  }

  // Clamp camera to world bounds
  clamp(worldW, worldH) {
    this.x = Math.max(0, Math.min(this.x, worldW - this.viewW));
    this.y = Math.max(0, Math.min(this.y, worldH - this.viewH));
  }

  // Convert world coords to screen coords
  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }
}
