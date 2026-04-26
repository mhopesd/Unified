// Particle system — lightweight 2D particles projected into the raycaster view
// Supports: tire smoke, muzzle sparks, dust kicks, blood splatter, rain

export class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity = 0, fadeRate = 1) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;     // [r, g, b]
    this.size = size;
    this.gravity = gravity;
    this.fadeRate = fadeRate;
    this.active = true;
  }
}

export class ParticleSystem {
  constructor(maxParticles = 300) {
    this.particles = [];
    this.max = maxParticles;
  }

  emit(x, y, vx, vy, life, color, size, gravity = 0, fadeRate = 1) {
    if (this.particles.length >= this.max) return;
    this.particles.push(new Particle(x, y, vx, vy, life, color, size, gravity, fadeRate));
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // --- Emitter presets ---

  emitTireSmoke(x, y, speed) {
    const count = Math.min(3, Math.floor(speed / 200));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 10 + Math.random() * 30;
      this.emit(
        x + (Math.random() - 0.5) * 10,
        y + (Math.random() - 0.5) * 10,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        0.6 + Math.random() * 0.4,
        [180 + Math.random() * 40, 175 + Math.random() * 40, 170 + Math.random() * 40],
        3 + Math.random() * 3,
        -15,    // float upward
        1.5
      );
    }
  }

  emitMuzzleSparks(x, y, angle) {
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const spd = 80 + Math.random() * 120;
      this.emit(
        x, y,
        Math.cos(angle + spread) * spd,
        Math.sin(angle + spread) * spd,
        0.1 + Math.random() * 0.15,
        [255, 200 + Math.random() * 55, 50 + Math.random() * 80],
        1.5 + Math.random() * 1.5,
        30,
        4
      );
    }
  }

  emitBlood(x, y) {
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 20 + Math.random() * 40;
      this.emit(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        0.4 + Math.random() * 0.3,
        [140 + Math.random() * 50, 10 + Math.random() * 20, 10 + Math.random() * 15],
        2 + Math.random() * 2,
        40,
        2
      );
    }
  }

  emitDustKick(x, y) {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 15;
      this.emit(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        0.3 + Math.random() * 0.3,
        [120 + Math.random() * 30, 110 + Math.random() * 30, 95 + Math.random() * 25],
        2 + Math.random() * 2,
        -8,
        2
      );
    }
  }

  emitPickupSparkle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    this.emit(
      x + (Math.random() - 0.5) * 12,
      y + (Math.random() - 0.5) * 12,
      Math.cos(angle) * 15,
      Math.sin(angle) * 15,
      0.3 + Math.random() * 0.2,
      [255, 255, 180 + Math.random() * 75],
      1.5,
      -20,
      3
    );
  }

  emitExplosion(x, y) {
    // Fire core — bright orange/yellow burst
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 130;
      this.emit(
        x + (Math.random() - 0.5) * 8,
        y + (Math.random() - 0.5) * 8,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        0.3 + Math.random() * 0.5,
        [240 + Math.random() * 15, 100 + Math.random() * 100, 10 + Math.random() * 30],
        4 + Math.random() * 5, 15, 3
      );
    }
    // Smoke — dark grey billowing outward
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 12 + Math.random() * 38;
      this.emit(
        x + (Math.random() - 0.5) * 16,
        y + (Math.random() - 0.5) * 16,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        0.8 + Math.random() * 0.9,
        [70 + Math.random() * 50, 65 + Math.random() * 45, 60 + Math.random() * 40],
        5 + Math.random() * 5, -22, 1.1
      );
    }
    // Debris — small fast chunks
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 90;
      this.emit(
        x, y,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        0.25 + Math.random() * 0.35,
        [160 + Math.random() * 50, 130 + Math.random() * 40, 80 + Math.random() * 30],
        1.5 + Math.random() * 1.5, 90, 2
      );
    }
  }

  emitPropDebris(x, y, propType) {
    const colors = {
      hydrant: [[50, 80, 180], [30, 60, 160], [200, 220, 255]], // blue water burst
      trash: [[80, 80, 80], [60, 50, 40], [100, 90, 70]],       // garbage
      bench: [[120, 80, 40], [90, 60, 30], [140, 100, 60]],     // wood splinters
    };
    const palette = colors[propType] || colors.trash;
    // Debris chunks
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 100;
      this.emit(
        x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        0.4 + Math.random() * 0.5,
        palette[Math.floor(Math.random() * palette.length)],
        2 + Math.random() * 3, 60, 2
      );
    }
    // Water geyser for hydrants
    if (propType === 'hydrant') {
      for (let i = 0; i < 8; i++) {
        this.emit(
          x + (Math.random() - 0.5) * 4, y,
          (Math.random() - 0.5) * 20, -80 - Math.random() * 60,
          0.6 + Math.random() * 0.5,
          [100 + Math.random() * 50, 150 + Math.random() * 50, 220 + Math.random() * 35],
          2 + Math.random() * 2, 120, 1.5
        );
      }
    }
  }

  emitSplash(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 20 + Math.random() * 40;
      this.emit(
        x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        0.3 + Math.random() * 0.3,
        [100 + Math.random() * 40, 150 + Math.random() * 40, 200 + Math.random() * 40],
        2 + Math.random() * 2, -30, 2
      );
    }
  }

  // Rain particles are special — they fall in screen space, handled separately
  emitRainDrop(worldW, worldH) {
    this.emit(
      Math.random() * worldW,
      Math.random() * worldH * 0.3,
      -20 - Math.random() * 10,   // slight wind
      200 + Math.random() * 150,   // falling fast
      1.5 + Math.random(),
      [140, 160, 200],
      1,
      0,
      0.5
    );
  }
}
