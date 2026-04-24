// Weather & sky system — clouds, stars, sun/moon, rain state

export class WeatherSystem {
  constructor() {
    // Sky
    this.stars = [];
    this._genStars(80);
    this.cloudPhase = 0;

    // Weather state
    this.raining = false;
    this.rainIntensity = 0;     // 0-1 lerps in/out
    this.rainTimer = 0;
    this.nextRainCheck = 30 + Math.random() * 60; // seconds until next weather check

    // Cloud layer (simple horizontal bands)
    this.clouds = [];
    this._genClouds(12);
  }

  _genStars(count) {
    for (let i = 0; i < count; i++) {
      this.stars.push({
        screenX: Math.random(),   // 0-1 normalized screen X
        screenY: Math.random() * 0.6,  // upper portion of sky
        brightness: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 1 + Math.random() * 3,
        twinklePhase: Math.random() * Math.PI * 2,
        size: Math.random() < 0.15 ? 2 : 1,
      });
    }
  }

  _genClouds(count) {
    for (let i = 0; i < count; i++) {
      this.clouds.push({
        x: Math.random(),          // 0-1 wrapping position
        y: 0.05 + Math.random() * 0.35,
        w: 0.08 + Math.random() * 0.15,
        h: 0.02 + Math.random() * 0.04,
        speed: 0.002 + Math.random() * 0.004,
        opacity: 0.12 + Math.random() * 0.18,
      });
    }
  }

  update(dt, timeOfDay) {
    // Cloud drift
    this.cloudPhase += dt;
    for (const c of this.clouds) {
      c.x = (c.x + c.speed * dt) % 1.3;  // wrap with margin
      if (c.x > 1.2) c.x = -c.w;
    }

    // Weather transitions
    this.nextRainCheck -= dt;
    if (this.nextRainCheck <= 0) {
      this.nextRainCheck = 40 + Math.random() * 80;
      // 20% chance of rain toggling
      if (Math.random() < 0.2) {
        this.raining = !this.raining;
        this.rainTimer = this.raining ? (15 + Math.random() * 30) : 0;
      }
    }

    if (this.raining) {
      this.rainIntensity = Math.min(1, this.rainIntensity + dt * 0.5);
      this.rainTimer -= dt;
      if (this.rainTimer <= 0) {
        this.raining = false;
      }
    } else {
      this.rainIntensity = Math.max(0, this.rainIntensity - dt * 0.3);
    }
  }

  // Get sun/moon position (0-1 arc across sky based on timeOfDay)
  getSunMoonArc(timeOfDay) {
    // timeOfDay 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    const sunAngle = (timeOfDay - 0.25) * Math.PI; // 0 at sunrise, PI at sunset
    const isDay = timeOfDay > 0.2 && timeOfDay < 0.8;
    return {
      x: Math.cos(sunAngle) * 0.5 + 0.5,  // 0-1 screen X
      y: Math.max(0.02, 0.5 - Math.sin(sunAngle) * 0.45), // arc height
      isDay,
      visible: (isDay && sunAngle > 0 && sunAngle < Math.PI) ||
               (!isDay),
    };
  }
}
