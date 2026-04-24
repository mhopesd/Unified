// Raycaster renderer — street-level 3D with variable wall heights,
// atmospheric fog, weather, particles, and gritty retro aesthetic.
// Renders to a low-res buffer then upscales for pixelated look.

import { TILE, SOLID_TILES } from '../game/world.js';

const RENDER_W = 480;
const RENDER_H = 300;
const FOV = Math.PI / 3;       // 60 degrees
const HALF_FOV = FOV / 2;
const TEX_SIZE = 64;

// --- Color palettes (darker, grittier) ---
const SKY_TOP     = [32, 34, 42];
const SKY_HORIZON = [72, 68, 66];
const FOG_COLOR   = [52, 50, 55];
const FOG_DIST    = 18;          // wider visibility for bigger world

// Day sky palette
const DAY_SKY_TOP     = [60, 120, 200];
const DAY_SKY_HORIZON = [140, 170, 210];
const SUNSET_SKY      = [180, 80, 40];
const NIGHT_SKY_TOP   = [8, 8, 18];
const NIGHT_SKY_HORIZON = [18, 16, 28];

const FLOOR_COLORS = {
  [TILE.ROAD]:     [32, 32, 36],
  [TILE.SIDEWALK]: [68, 66, 62],
  [TILE.GRASS]:    [22, 42, 16],
  [TILE.WATER]:    [18, 38, 58],
  [TILE.PARKING]:  [40, 40, 44],
  [TILE.PARK]:     [26, 50, 20],
  [TILE.BUILDING]: [48, 46, 44],
  [TILE.WALL]:     [34, 34, 34],
};

// --- Deterministic hash ---
function hash(x, y, seed) {
  let n = x * 374761393 + y * 668265263 + (seed | 0) * 1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n & 0x7fffffff) / 0x7fffffff;
}

// --- Renderer class ---

export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this._mainCtx = canvas.getContext('2d');
    this.canvas.width = width;
    this.canvas.height = height;
    this._mainCtx.imageSmoothingEnabled = false;

    // Low-res offscreen buffer
    this.buf = document.createElement('canvas');
    this.buf.width = RENDER_W;
    this.buf.height = RENDER_H;
    this.bufCtx = this.buf.getContext('2d');
    this.img = this.bufCtx.createImageData(RENDER_W, RENDER_H);
    this.px = this.img.data;

    // Z-buffer for sprite clipping
    this.zBuf = new Float32Array(RENDER_W);

    // Wall textures
    this.tex = {};
    this._genTextures();

    this.nightAlpha = 0;
    this.timeOfDay = 0.25;
    this.weather = null;     // set by main.js
    this.screenShake = 0;
    this.damageFlash = 0;
    this.speedLineAlpha = 0;
  }

  get ctx() { return this._mainCtx; }
  setNightAlpha(a) { this.nightAlpha = a; }
  setTimeOfDay(t) { this.timeOfDay = t; }
  setWeather(w) { this.weather = w; }

  // Screen effects
  triggerScreenShake(intensity = 1) { this.screenShake = Math.min(this.screenShake + intensity, 5); }
  triggerDamageFlash(intensity = 0.6) { this.damageFlash = Math.max(this.damageFlash, intensity); }
  setSpeedLines(alpha) { this.speedLineAlpha = alpha; }

  // ---- Wall height per tile (variable for depth) ----

  _wallHeight(tile, col, row) {
    if (tile === TILE.BUILDING) {
      // Buildings vary from 1.5 to 4.0 — towering skyline
      return 1.5 + hash(col, row, 7) * 2.5;
    }
    if (tile === TILE.WALL) return 2.5; // border walls tall
    if (tile === TILE.WATER) return 0.3; // low canal edge
    return 1.0;
  }

  // ---- Texture generation ----

  _genTextures() {
    // Brick wall (warm brown-red)
    this.tex.brick = this._makeTex((x, y) => {
      const bH = 8, bW = 16;
      const row = Math.floor(y / bH);
      const lx = (x + (row & 1) * (bW >> 1)) % bW;
      const ly = y % bH;
      if (lx < 1 || ly < 1) return [82, 76, 70]; // mortar
      const n = hash(x, y, 42) * 22;
      return [100 + n, 48 + n * 0.4, 35 + n * 0.3];
    });

    // Dark brick variant (smaller bricks)
    this.tex.darkBrick = this._makeTex((x, y) => {
      const bH = 6, bW = 12;
      const row = Math.floor(y / bH);
      const lx = (x + (row & 1) * (bW >> 1)) % bW;
      const ly = y % bH;
      if (lx < 1 || ly < 1) return [55, 52, 48];
      const n = hash(x, y, 77) * 14;
      return [62 + n, 44 + n * 0.5, 36 + n * 0.4];
    });

    // Window wall (concrete + dark glass windows in grid)
    this.tex.windowWall = this._makeTex((x, y) => {
      const wy = y % 16;
      const wx = x % 20;
      const isWindow = wx > 3 && wx < 16 && wy > 2 && wy < 11;
      if (isWindow) {
        const n = hash(x, y, 55) * 8;
        // Some windows are lit (warm glow)
        const lit = hash(Math.floor(x / 20), Math.floor(y / 16), 88) < 0.25;
        if (lit) return [65 + n, 55 + n, 30 + n]; // warm yellow glow
        return [28 + n, 38 + n, 52 + n]; // dark glass
      }
      const n = hash(x, y, 33) * 6;
      return [78 + n, 75 + n, 72 + n]; // concrete facade
    });

    // Concrete / cinder block (for WALL tiles)
    this.tex.concrete = this._makeTex((x, y) => {
      const bline = (y % 16 < 1 || x % 32 < 1) ? -10 : 0;
      const n = hash(x, y, 99) * 10;
      return [52 + n + bline, 50 + n + bline, 48 + n + bline];
    });

    // Water wall (canal edge)
    this.tex.water = this._makeTex((x, y) => {
      const n = hash(x, y, 55) * 16;
      return [22 + n * 0.3, 40 + n * 0.5, 62 + n];
    });

    // Shop front — colored awning band at top, glass/metal below
    this.tex.shopFront = this._makeTex((x, y) => {
      if (y < 12) {
        // Awning — striped color
        const stripe = (x % 8) < 4;
        const n = hash(x, y, 66) * 8;
        return stripe ? [120 + n, 40 + n, 30 + n] : [100 + n, 35 + n, 25 + n];
      }
      if (y < 16) return [45, 42, 40]; // awning edge shadow
      // Glass/metal storefront
      const n = hash(x, y, 22) * 6;
      if (x > 8 && x < 56 && y > 20 && y < 54) {
        // Glass pane
        return [32 + n, 42 + n, 50 + n];
      }
      return [60 + n, 58 + n, 55 + n]; // metal frame
    });

    // Stucco / plaster (smooth with cracks)
    this.tex.stucco = this._makeTex((x, y) => {
      const n = hash(x, y, 111) * 10;
      // Occasional crack lines
      const crack = hash(x, y, 222) < 0.03 ? -18 : 0;
      // Stain drips from top
      const stain = y < 8 && hash(x, 0, 333) < 0.15 ? -10 : 0;
      return [75 + n + crack + stain, 72 + n + crack + stain, 65 + n + crack + stain];
    });

    // Metal / corrugated garage door
    this.tex.metal = this._makeTex((x, y) => {
      const ridge = (y % 4 < 1) ? 12 : 0;
      const n = hash(x, y, 44) * 6;
      return [50 + n + ridge, 52 + n + ridge, 55 + n + ridge];
    });
  }

  _makeTex(fn) {
    const d = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 3);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const [r, g, b] = fn(x, y);
        const i = (y * TEX_SIZE + x) * 3;
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    return d;
  }

  _wallTex(tile, col, row) {
    if (tile === TILE.BUILDING) {
      const h = hash(col, row, 0);
      if (h < 0.2) return this.tex.brick;
      if (h < 0.38) return this.tex.darkBrick;
      if (h < 0.52) return this.tex.windowWall;
      if (h < 0.65) return this.tex.shopFront;
      if (h < 0.78) return this.tex.stucco;
      if (h < 0.88) return this.tex.metal;
      return this.tex.concrete;
    }
    if (tile === TILE.WALL) return this.tex.concrete;
    if (tile === TILE.WATER) return this.tex.water;
    return this.tex.concrete;
  }

  _sampleTex(tex, u, v) {
    const tx = (Math.floor(u * TEX_SIZE)) & (TEX_SIZE - 1);
    const ty = (Math.floor(v * TEX_SIZE)) & (TEX_SIZE - 1);
    const i = (ty * TEX_SIZE + tx) * 3;
    return [tex[i], tex[i + 1], tex[i + 2]];
  }

  // ---- Main render ----

  renderScene(player, worldMap, tileSize, sprites, markers, headBob = 0, particles = null) {
    const px = this.px;
    const rows = worldMap.length;
    const cols = worldMap[0].length;
    const pmx = player.x / tileSize;
    const pmy = player.y / tileSize;

    const nightMul = 1 - this.nightAlpha * 0.5;
    const nightTint = this.nightAlpha * 22;

    // Screen shake offset
    let shakeX = 0, shakeY = 0;
    if (this.screenShake > 0.05) {
      shakeX = (Math.random() - 0.5) * this.screenShake * 2;
      shakeY = (Math.random() - 0.5) * this.screenShake * 2;
      this.screenShake *= 0.85;
    } else {
      this.screenShake = 0;
    }

    // --- Dynamic sky colors based on time of day ---
    const tod = this.timeOfDay;
    let skyTop, skyHor;
    if (tod > 0.25 && tod < 0.75) {
      // Day
      const dayT = (tod - 0.25) / 0.5; // 0 at sunrise, 1 at sunset
      const sunsetBlend = dayT > 0.7 ? (dayT - 0.7) / 0.3 : (dayT < 0.15 ? 1 - dayT / 0.15 : 0);
      skyTop = [
        DAY_SKY_TOP[0] * (1 - sunsetBlend) + SUNSET_SKY[0] * sunsetBlend,
        DAY_SKY_TOP[1] * (1 - sunsetBlend) + SUNSET_SKY[1] * sunsetBlend * 0.5,
        DAY_SKY_TOP[2] * (1 - sunsetBlend) + SUNSET_SKY[2] * sunsetBlend * 0.3,
      ];
      skyHor = [
        DAY_SKY_HORIZON[0] * (1 - sunsetBlend) + SUNSET_SKY[0] * sunsetBlend,
        DAY_SKY_HORIZON[1] * (1 - sunsetBlend) + SUNSET_SKY[1] * sunsetBlend,
        DAY_SKY_HORIZON[2] * (1 - sunsetBlend) + SUNSET_SKY[2] * sunsetBlend * 0.6,
      ];
    } else {
      // Night
      skyTop = NIGHT_SKY_TOP;
      skyHor = NIGHT_SKY_HORIZON;
    }

    // --- 1. Fill sky gradient ---
    const halfH = (RENDER_H >> 1) + Math.round(headBob + shakeY);
    for (let y = 0; y < halfH; y++) {
      const t = y / halfH;
      const sr = skyTop[0] + (skyHor[0] - skyTop[0]) * t;
      const sg = skyTop[1] + (skyHor[1] - skyTop[1]) * t;
      const sb = skyTop[2] + (skyHor[2] - skyTop[2]) * t;
      for (let x = 0; x < RENDER_W; x++) {
        const i = (y * RENDER_W + x) << 2;
        px[i] = sr; px[i + 1] = sg; px[i + 2] = sb; px[i + 3] = 255;
      }
    }
    // Fill bottom half with dark base
    for (let y = halfH; y < RENDER_H; y++) {
      for (let x = 0; x < RENDER_W; x++) {
        const i = (y * RENDER_W + x) << 2;
        px[i] = 24; px[i + 1] = 24; px[i + 2] = 26; px[i + 3] = 255;
      }
    }

    // --- Stars at night ---
    if (this.weather && this.nightAlpha > 0.3) {
      const starAlpha = Math.min(1, (this.nightAlpha - 0.3) / 0.4);
      const now = Date.now() * 0.001;
      for (const star of this.weather.stars) {
        const sx = (star.screenX * RENDER_W + player.angle * 30) % RENDER_W;
        const sy = star.screenY * halfH;
        if (sx < 0 || sx >= RENDER_W || sy < 0 || sy >= halfH) continue;
        const twinkle = 0.5 + 0.5 * Math.sin(now * star.twinkleSpeed + star.twinklePhase);
        const bright = star.brightness * twinkle * starAlpha * 255;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const pi = (iy * RENDER_W + ix) << 2;
        px[pi] = Math.min(255, px[pi] + bright);
        px[pi + 1] = Math.min(255, px[pi + 1] + bright * 0.95);
        px[pi + 2] = Math.min(255, px[pi + 2] + bright);
        if (star.size > 1 && ix + 1 < RENDER_W) {
          const pi2 = pi + 4;
          px[pi2] = Math.min(255, px[pi2] + bright * 0.5);
          px[pi2 + 1] = Math.min(255, px[pi2 + 1] + bright * 0.5);
          px[pi2 + 2] = Math.min(255, px[pi2 + 2] + bright * 0.5);
        }
      }
    }

    // --- Clouds ---
    if (this.weather) {
      for (const cloud of this.weather.clouds) {
        const cx = Math.floor(cloud.x * RENDER_W) % RENDER_W;
        const cy = Math.floor(cloud.y * halfH);
        const cw = Math.floor(cloud.w * RENDER_W);
        const ch = Math.floor(cloud.h * halfH);
        const rainDarken = this.weather.rainIntensity * 0.5;
        const baseAlpha = (cloud.opacity - rainDarken * 0.3) * (this.nightAlpha > 0.5 ? 0.3 : 1);
        if (baseAlpha <= 0) continue;

        for (let dy = 0; dy < ch; dy++) {
          const py = cy + dy;
          if (py < 0 || py >= halfH) continue;
          const yFade = 1 - Math.abs(dy / ch - 0.5) * 2;
          for (let dx = 0; dx < cw; dx++) {
            const cpx = (cx + dx) % RENDER_W;
            if (cpx < 0) continue;
            const xFade = 1 - Math.abs(dx / cw - 0.5) * 2;
            const alpha = baseAlpha * xFade * yFade;
            if (alpha < 0.02) continue;
            const pi = (py * RENDER_W + cpx) << 2;
            const cloudBright = this.weather.rainIntensity > 0.3 ? 100 : 210;
            px[pi] = px[pi] * (1 - alpha) + cloudBright * alpha;
            px[pi + 1] = px[pi + 1] * (1 - alpha) + (cloudBright - 5) * alpha;
            px[pi + 2] = px[pi + 2] * (1 - alpha) + (cloudBright + 5) * alpha;
          }
        }
      }
    }

    // --- Sun/Moon glow ---
    if (this.weather) {
      const arc = this.weather.getSunMoonArc(this.timeOfDay);
      if (arc.visible) {
        const sunX = Math.floor(arc.x * RENDER_W);
        const sunY = Math.floor(arc.y * halfH);
        const glowR = arc.isDay ? 25 : 12;
        const sunColor = arc.isDay ? [255, 230, 160] : [200, 210, 240];
        for (let dy = -glowR; dy <= glowR; dy++) {
          for (let dx = -glowR; dx <= glowR; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > glowR) continue;
            const gx = sunX + dx;
            const gy = sunY + dy;
            if (gx < 0 || gx >= RENDER_W || gy < 0 || gy >= halfH) continue;
            const intensity = (1 - dist / glowR);
            const alpha = intensity * intensity * 0.8;
            const pi = (gy * RENDER_W + gx) << 2;
            px[pi] = Math.min(255, px[pi] + sunColor[0] * alpha);
            px[pi + 1] = Math.min(255, px[pi + 1] + sunColor[1] * alpha);
            px[pi + 2] = Math.min(255, px[pi + 2] + sunColor[2] * alpha);
          }
        }
      }
    }

    // --- 2. Raycast walls + floor ---
    for (let col = 0; col < RENDER_W; col++) {
      const rayAngle = player.angle - HALF_FOV + (col / RENDER_W) * FOV;
      const rdx = Math.cos(rayAngle);
      const rdy = Math.sin(rayAngle);

      // DDA init
      let mapX = Math.floor(pmx);
      let mapY = Math.floor(pmy);
      const ddx = Math.abs(1 / rdx);
      const ddy = Math.abs(1 / rdy);

      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (pmx - mapX) * ddx; }
      else          { stepX =  1; sdx = (mapX + 1 - pmx) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (pmy - mapY) * ddy; }
      else          { stepY =  1; sdy = (mapY + 1 - pmy) * ddy; }

      let side = 0, hitTile = TILE.WALL;
      for (let s = 0; s < 64; s++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
        else            { sdy += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapX >= cols || mapY < 0 || mapY >= rows) { hitTile = TILE.WALL; break; }
        if (SOLID_TILES.has(worldMap[mapY][mapX])) { hitTile = worldMap[mapY][mapX]; break; }
      }

      // Perpendicular distance (fisheye fix)
      const perpDist = side === 0
        ? (mapX - pmx + (1 - stepX) / 2) / rdx
        : (mapY - pmy + (1 - stepY) / 2) / rdy;

      this.zBuf[col] = perpDist;

      // --- Variable wall height ---
      const hFactor = this._wallHeight(hitTile, mapX, mapY);
      const baseWH = RENDER_H / perpDist; // standard 1-unit wall in pixels
      const wallBottom = Math.min(RENDER_H - 1, (halfH + baseWH / 2) | 0);
      const wallTop    = Math.max(0, (wallBottom - baseWH * hFactor) | 0);

      // Texture U coordinate
      let wallU = side === 0
        ? pmy + perpDist * rdy
        : pmx + perpDist * rdx;
      wallU -= Math.floor(wallU);

      const tex = this._wallTex(hitTile, mapX, mapY);
      const fog = Math.min(1, perpDist / FOG_DIST);
      const sideDim = side === 1 ? 0.65 : 1.0;

      // Ambient occlusion: darken near wall base
      const wallPixelH = wallBottom - wallTop;

      // Draw wall column
      for (let y = wallTop; y <= wallBottom; y++) {
        const v = (y - wallTop) / (wallPixelH || 1);
        const [tr, tg, tb] = this._sampleTex(tex, wallU, v * hFactor);

        // AO: darken bottom 15% of wall
        const baseAO = v > 0.85 ? 1 - (v - 0.85) * 3 : 1;
        const shade = sideDim * (1 - fog) * baseAO;

        const i = (y * RENDER_W + col) << 2;
        px[i]     = (tr * shade + FOG_COLOR[0] * fog) * nightMul;
        px[i + 1] = (tg * shade + FOG_COLOR[1] * fog) * nightMul;
        px[i + 2] = (tb * shade + FOG_COLOR[2] * fog) * nightMul + nightTint * 0.5;
      }

      // Floor casting (below wall)
      let floorWX, floorWY;
      if (side === 0) {
        floorWX = rdx > 0 ? mapX : mapX + 1;
        floorWY = pmy + perpDist * rdy;
      } else {
        floorWX = pmx + perpDist * rdx;
        floorWY = rdy > 0 ? mapY : mapY + 1;
      }

      for (let y = wallBottom + 1; y < RENDER_H; y++) {
        const curDist = RENDER_H / (2.0 * y - RENDER_H);
        const weight = curDist / perpDist;
        const fx = weight * floorWX + (1 - weight) * pmx;
        const fy = weight * floorWY + (1 - weight) * pmy;

        const tx = Math.floor(fx);
        const ty = Math.floor(fy);

        let fc;
        if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) {
          fc = FLOOR_COLORS[worldMap[ty][tx]] || FLOOR_COLORS[TILE.GRASS];
        } else {
          fc = FLOOR_COLORS[TILE.GRASS];
        }

        const ff = Math.min(1, curDist / FOG_DIST);
        let r = fc[0] * (1 - ff) + FOG_COLOR[0] * ff;
        let g = fc[1] * (1 - ff) + FOG_COLOR[1] * ff;
        let b = fc[2] * (1 - ff) + FOG_COLOR[2] * ff;

        // Road detail
        const tileType = (tx >= 0 && tx < cols && ty >= 0 && ty < rows) ? worldMap[ty][tx] : -1;
        if (tileType === TILE.ROAD) {
          // Center lane marking (dashed yellow line)
          const fracX = fx - tx;
          const fracY = fy - ty;
          const onCenterX = fracX > 0.44 && fracX < 0.56;
          const onCenterY = fracY > 0.44 && fracY < 0.56;
          const dashPhase = (Math.floor(fx * 3) + Math.floor(fy * 3)) & 1;
          if ((onCenterX || onCenterY) && dashPhase) {
            r += 30; g += 25; b += 5; // yellow-ish marking
          }

          // Wet road reflection at distance
          if (ff > 0.12) {
            const wet = ff * 18;
            r += wet; g += wet; b += wet * 1.1;
          }
        }

        // Subtle floor texture grain
        const noise = hash(Math.floor(fx * 4), Math.floor(fy * 4), 33) * 5;
        r += noise; g += noise; b += noise;

        // Sidewalk curb line (bright edge where sidewalk meets road)
        if (tileType === TILE.SIDEWALK) {
          const fracX = fx - tx;
          const fracY = fy - ty;
          if (fracX < 0.08 || fracX > 0.92 || fracY < 0.08 || fracY > 0.92) {
            r += 8; g += 8; b += 7;
          }
        }

        const i = (y * RENDER_W + col) << 2;
        px[i]     = r * nightMul;
        px[i + 1] = g * nightMul;
        px[i + 2] = b * nightMul + nightTint * 0.3;
      }
    }

    // --- 3. Sprites ---
    this._drawSprites(player, sprites, pmx, pmy, tileSize);

    // --- 3b. Particles in world space ---
    if (particles && particles.length) {
      this._drawParticles(player, particles, tileSize);
    }

    // --- 3c. Rain streaks (screen-space) ---
    if (this.weather && this.weather.rainIntensity > 0.05) {
      this._drawRain();
    }

    // --- 4. Blit buffer → main canvas ---
    this.bufCtx.putImageData(this.img, 0, 0);
    const ctx = this._mainCtx;
    ctx.save();
    if (this.screenShake > 0.1) {
      ctx.translate(shakeX * 3, shakeY * 3);
    }
    ctx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // --- 5. Screen effects on main canvas ---
    this._drawScreenEffects(ctx);

    // --- 6. Direction indicators for mission markers ---
    if (markers) this._drawMarkerHUD(player, markers);
  }

  // ---- Particle rendering (world-space → projected) ----
  _drawParticles(player, particles, tileSize) {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * Math.tan(HALF_FOV);
    const planeY =  dirX * Math.tan(HALF_FOV);
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const pmx = player.x / tileSize;
    const pmy = player.y / tileSize;
    const halfH = RENDER_H >> 1;
    const px = this.px;

    for (const p of particles) {
      const dx = p.x / tileSize - pmx;
      const dy = p.y / tileSize - pmy;
      const tx = invDet * (dirY * dx - dirX * dy);
      const ty = invDet * (-planeY * dx + planeX * dy);
      if (ty <= 0.1) continue;

      const screenX = (RENDER_W / 2) * (1 + tx / ty) | 0;
      const screenY = halfH | 0;
      const sprSize = Math.max(1, Math.abs((RENDER_H / ty) * (p.size / tileSize)) | 0);
      const alpha = Math.min(1, p.life / p.maxLife);
      const [cr, cg, cb] = p.color;

      const x0 = Math.max(0, screenX - sprSize);
      const x1 = Math.min(RENDER_W - 1, screenX + sprSize);
      const y0 = Math.max(0, screenY - sprSize);
      const y1 = Math.min(RENDER_H - 1, screenY + sprSize);

      for (let x = x0; x <= x1; x++) {
        if (ty >= this.zBuf[x]) continue;
        for (let y = y0; y <= y1; y++) {
          const pi = (y * RENDER_W + x) << 2;
          px[pi] = Math.min(255, px[pi] * (1 - alpha * 0.6) + cr * alpha * 0.6);
          px[pi + 1] = Math.min(255, px[pi + 1] * (1 - alpha * 0.6) + cg * alpha * 0.6);
          px[pi + 2] = Math.min(255, px[pi + 2] * (1 - alpha * 0.6) + cb * alpha * 0.6);
        }
      }
    }
  }

  // ---- Rain streaks (screen-space pixel buffer) ----
  _drawRain() {
    const intensity = this.weather.rainIntensity;
    const count = Math.floor(intensity * 120);
    const px = this.px;
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      // Deterministic rain positions that shift over time
      const seed = i * 7919;
      const phase = (now * 0.003 + seed) % 1;
      const x = ((seed * 13) % RENDER_W + (now * 0.05 * ((seed % 3) + 1))) % RENDER_W | 0;
      const startY = (phase * RENDER_H * 1.3 - RENDER_H * 0.3) | 0;
      const len = 3 + (seed % 4);
      const bright = 120 + (seed % 60);

      for (let dy = 0; dy < len; dy++) {
        const ry = startY + dy;
        const rx = x - dy; // slight angle
        if (rx < 0 || rx >= RENDER_W || ry < 0 || ry >= RENDER_H) continue;
        const pi = (ry * RENDER_W + rx) << 2;
        const a = 0.3 * intensity;
        px[pi] = Math.min(255, px[pi] + bright * a * 0.5);
        px[pi + 1] = Math.min(255, px[pi + 1] + bright * a * 0.6);
        px[pi + 2] = Math.min(255, px[pi + 2] + bright * a);
      }
    }

    // Darken scene slightly during rain
    if (intensity > 0.3) {
      const darken = (intensity - 0.3) * 0.08;
      for (let i = 0; i < RENDER_W * RENDER_H * 4; i += 4) {
        px[i] *= (1 - darken);
        px[i + 1] *= (1 - darken);
        px[i + 2] *= (1 - darken * 0.5);
      }
    }
  }

  // ---- Screen effects (drawn on main canvas after upscale) ----
  _drawScreenEffects(ctx) {
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Damage vignette (red edges)
    if (this.damageFlash > 0.01) {
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, cw * 0.25, cw / 2, ch / 2, cw * 0.7);
      grad.addColorStop(0, `rgba(180,0,0,0)`);
      grad.addColorStop(0.6, `rgba(140,0,0,${this.damageFlash * 0.3})`);
      grad.addColorStop(1, `rgba(100,0,0,${this.damageFlash * 0.7})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      this.damageFlash *= 0.92;
      if (this.damageFlash < 0.01) this.damageFlash = 0;
    }

    // Speed lines (when driving fast)
    if (this.speedLineAlpha > 0.02) {
      const lineCount = 16;
      ctx.strokeStyle = `rgba(255,255,255,${this.speedLineAlpha * 0.2})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < lineCount; i++) {
        const angle = (i / lineCount) * Math.PI * 2;
        const innerR = cw * 0.35;
        const outerR = cw * 0.55 + Math.random() * cw * 0.1;
        ctx.beginPath();
        ctx.moveTo(cw / 2 + Math.cos(angle) * innerR, ch / 2 + Math.sin(angle) * innerR);
        ctx.lineTo(cw / 2 + Math.cos(angle) * outerR, ch / 2 + Math.sin(angle) * outerR);
        ctx.stroke();
      }
    }

    // Rain on screen (droplets on camera)
    if (this.weather && this.weather.rainIntensity > 0.4) {
      const dropCount = Math.floor(this.weather.rainIntensity * 8);
      ctx.fillStyle = `rgba(150,170,200,${this.weather.rainIntensity * 0.12})`;
      for (let i = 0; i < dropCount; i++) {
        const seed = (Date.now() * 0.001 + i * 137) % 100;
        const dx = (Math.sin(seed * 7.3) * 0.5 + 0.5) * cw;
        const dy = (Math.sin(seed * 11.7) * 0.5 + 0.5) * ch;
        ctx.beginPath();
        ctx.ellipse(dx, dy, 2, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Sprite rendering ----

  _drawSprites(player, sprites, pmx, pmy, tileSize) {
    if (!sprites || !sprites.length) return;

    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * Math.tan(HALF_FOV);
    const planeY =  dirX * Math.tan(HALF_FOV);
    const invDet = 1 / (planeX * dirY - dirX * planeY);

    // Sort far → near
    const sorted = [];
    for (const s of sprites) {
      const dx = s.x / tileSize - pmx;
      const dy = s.y / tileSize - pmy;
      sorted.push({ ...s, dx, dy, dist2: dx * dx + dy * dy });
    }
    sorted.sort((a, b) => b.dist2 - a.dist2);

    const px = this.px;
    const halfH = RENDER_H >> 1;
    const nightMul = 1 - this.nightAlpha * 0.5;

    for (const sp of sorted) {
      const tx = invDet * ( dirY * sp.dx - dirX * sp.dy);
      const ty = invDet * (-planeY * sp.dx + planeX * sp.dy);
      if (ty <= 0.15) continue;

      const screenX = (RENDER_W / 2) * (1 + tx / ty) | 0;

      // Size based on type
      let hScale, wScale;
      switch (sp.type) {
        case 'vehicle':     hScale = 0.5;  wScale = 0.7;  break;
        case 'pickup':      hScale = 0.2;  wScale = 0.2;  break;
        case 'streetlight': hScale = 1.2;  wScale = 0.12; break;
        case 'trafficlight': hScale = 1.1; wScale = 0.22; break;
        case 'prop':
          if (sp.propType === 'hydrant') { hScale = 0.22; wScale = 0.18; }
          else if (sp.propType === 'bench') { hScale = 0.18; wScale = 0.55; }
          else { hScale = 0.28; wScale = 0.22; } // trash
          break;
        default:            hScale = 0.65; wScale = 0.3;  break; // npc
      }

      const sprH = Math.abs((RENDER_H / ty) * hScale) | 0;
      const sprW = Math.abs((RENDER_H / ty) * wScale) | 0;

      // Pickups float above ground
      const yOffset = sp.type === 'pickup' ? -(sprH * 0.3) | 0 : 0;

      const y0 = Math.max(0, (halfH - sprH / 2 + yOffset) | 0);
      const y1 = Math.min(RENDER_H - 1, (halfH + sprH / 2 + yOffset) | 0);
      const x0 = Math.max(0, screenX - sprW / 2 | 0);
      const x1 = Math.min(RENDER_W - 1, screenX + sprW / 2 | 0);

      const dist = Math.sqrt(sp.dist2);
      const fog = Math.min(1, dist / FOG_DIST);
      const shade = 1 - fog;
      const [cr, cg, cb] = this._parseColor(sp.color);

      for (let x = x0; x <= x1; x++) {
        if (ty >= this.zBuf[x]) continue;
        for (let y = y0; y <= y1; y++) {
          const ry = (y - y0) / ((y1 - y0) || 1);
          const rx = (x - x0) / ((x1 - x0) || 1);
          let sr = cr, sg = cg, sb = cb;

          if (sp.type === 'npc') {
            // Detailed NPC: hat, head, torso, legs with variety
            const skin = sp.skinTone || [200, 165, 130];
            const hair = sp.hairColor || [40, 30, 25];
            const pants = sp.pantsColor || [cr * 0.4, cg * 0.4, cb * 0.4];
            const hat = sp.hat || 'none';
            const hatCol = sp.hatColorRGB || [80, 80, 80];

            if (hat !== 'none' && ry < 0.06) {
              // Hat
              sr = hatCol[0]; sg = hatCol[1]; sb = hatCol[2];
              // Cap brim extends wider
              if (hat === 'cap' && ry > 0.03 && (rx < 0.15 || rx > 0.85)) continue;
              if (hat === 'cowboy' && ry > 0.03) {
                // Wide brim
                sr *= 0.85; sg *= 0.85; sb *= 0.85;
              }
              if (hat === 'beanie') {
                sr *= 0.9; sg *= 0.9; sb *= 0.9;
              }
            } else if (ry < 0.18) {
              // Head — skin tone
              sr = skin[0]; sg = skin[1]; sb = skin[2];
              // Hair on top (if no hat)
              if (hat === 'none' && ry < 0.08) {
                sr = hair[0]; sg = hair[1]; sb = hair[2];
              }
              // Eyes
              if (ry > 0.10 && ry < 0.13 && (rx > 0.3 && rx < 0.42 || rx > 0.58 && rx < 0.7)) {
                sr = 20; sg = 20; sb = 30;
              }
            } else if (ry < 0.22) {
              // Neck
              sr = skin[0] * 0.9; sg = skin[1] * 0.9; sb = skin[2] * 0.9;
            } else if (ry < 0.55) {
              // Torso — shirt color with shading
              const tShade = 1 - Math.abs(rx - 0.5) * 0.4;
              sr *= tShade; sg *= tShade; sb *= tShade;
              // Collar detail
              if (ry < 0.26 && rx > 0.35 && rx < 0.65) {
                sr *= 0.8; sg *= 0.8; sb *= 0.8;
              }
            } else if (ry < 0.6) {
              // Belt
              sr = 30; sg = 28; sb = 25;
              // Belt buckle
              if (rx > 0.43 && rx < 0.57) {
                sr = 120; sg = 100; sb = 40;
              }
            } else {
              // Legs — pants color
              sr = pants[0]; sg = pants[1]; sb = pants[2];
              // Shoes at very bottom
              if (ry > 0.92) {
                sr = 25; sg = 22; sb = 20;
              }
              // Gap between legs
              if (rx > 0.42 && rx < 0.58 && ry > 0.75) {
                continue;
              }
            }
          } else if (sp.type === 'vehicle') {
            // Vehicle detail
            if (ry < 0.15) {
              // Roof — slightly darker
              sr *= 0.7; sg *= 0.7; sb *= 0.7;
            } else if (ry > 0.25 && ry < 0.45 && rx > 0.15 && rx < 0.85) {
              // Windshield
              sr = 60; sg = 80; sb = 110;
            } else if (ry > 0.85) {
              // Wheels — dark
              sr = 25; sg = 25; sb = 28;
            } else {
              // Body panels — subtle highlight on sides
              const panelShade = 1 - Math.abs(rx - 0.5) * 0.5;
              sr *= panelShade; sg *= panelShade; sb *= panelShade;
            }
          } else if (sp.type === 'trafficlight') {
            // Traffic light — pole with 3-color signal head at top
            const phase = sp.phase || 'red';
            if (ry < 0.22) {
              // Signal housing box (slightly wider than pole)
              // Frame/case: dark gray
              sr = 28; sg = 28; sb = 28;
              // Inner lights — three zones stacked vertically within housing
              const innerRx = (rx - 0.15) / 0.7; // normalize inner area
              if (innerRx >= 0 && innerRx <= 1 && rx > 0.15 && rx < 0.85) {
                const lightZone = ry / 0.22; // 0=top, 1=bottom
                if (lightZone < 0.33) {
                  // Red zone (top)
                  if (phase === 'red') { sr = 255; sg = 40; sb = 40; }
                  else { sr = 55; sg = 12; sb = 12; }
                } else if (lightZone < 0.66) {
                  // Yellow zone (mid)
                  if (phase === 'yellow') { sr = 255; sg = 210; sb = 30; }
                  else { sr = 55; sg = 45; sb = 8; }
                } else {
                  // Green zone (bottom)
                  if (phase === 'green') { sr = 40; sg = 230; sb = 60; }
                  else { sr = 10; sg = 50; sb = 18; }
                }
                // Circular light lens (skip corners)
                const lx = innerRx - 0.5;
                const lz = (lightZone % 0.333) / 0.333 - 0.5;
                if (lx * lx + lz * lz > 0.2) { sr = 28; sg = 28; sb = 28; }
              }
            } else {
              // Pole — narrow dark metal
              sr = 72; sg = 70; sb = 68;
              if (rx < 0.38 || rx > 0.62) continue;
            }
          } else if (sp.type === 'streetlight') {
            // Pole
            sr = 90; sg = 88; sb = 85;
            if (ry < 0.15) {
              // Lamp head — glow at night
              sr = 200; sg = 190; sb = 140;
              if (this.nightAlpha > 0.3) {
                sr = 255; sg = 240; sb = 180;
              }
            }
            // Narrow pole
            if (rx < 0.2 || rx > 0.8) continue;
          } else if (sp.type === 'pickup') {
            // Glowing pickup
            const pulse = 0.7 + Math.sin(Date.now() * 0.005) * 0.3;
            sr *= pulse; sg *= pulse; sb *= pulse;
            // Cross/plus shape for health, rectangle for ammo
            if (sp.pickupType === 'health') {
              const isCross = (rx > 0.3 && rx < 0.7) || (ry > 0.3 && ry < 0.7);
              if (!isCross) continue;
            }
          } else if (sp.type === 'prop') {
            if (sp.propType === 'hydrant') {
              // Fire hydrant — red squat cylinder
              // Body: oval shape
              const cx = rx - 0.5, cy = ry - 0.5;
              if (cx * cx / 0.09 + cy * cy / 0.16 > 1) continue; // oval cutout
              // Top dome darker
              if (ry < 0.25) { sr = 160; sg = 20; sb = 20; }
              else { sr = 200; sg = 30; sb = 30; }
              // Side bolt details
              if ((rx > 0.1 && rx < 0.18 || rx > 0.82 && rx < 0.9) && ry > 0.35 && ry < 0.6) {
                sr = 120; sg = 120; sb = 80;
              }
              // Top cap
              if (ry < 0.18 && rx > 0.35 && rx < 0.65) { sr = 80; sg = 80; sb = 80; }
            } else if (sp.propType === 'bench') {
              // Bench — horizontal seat + two legs
              if (ry < 0.3) continue; // empty above
              if (ry < 0.45) {
                // Seat slats
                const slat = Math.floor(rx * 5) % 2 === 0;
                sr = slat ? 100 : 80; sg = slat ? 70 : 55; sb = slat ? 45 : 35;
              } else if (ry < 0.55) {
                // Seat underframe
                sr = 60; sg = 45; sb = 30;
              } else {
                // Legs — only at sides
                if (rx > 0.15 && rx < 0.3 || rx > 0.7 && rx < 0.85) {
                  sr = 70; sg = 55; sb = 40;
                } else continue;
              }
            } else {
              // Trash can — dark cylindrical bin
              const cx = rx - 0.5;
              if (Math.abs(cx) > 0.35 && ry > 0.1) continue; // can sides
              if (ry < 0.12) {
                // Lid — slightly wider
                sr = 50; sg = 50; sb = 50;
              } else {
                // Body with horizontal bands
                const band = Math.floor(ry * 8) % 3 === 0;
                sr = band ? 55 : 40; sg = band ? 55 : 40; sb = band ? 55 : 42;
              }
            }
          }

          const i = (y * RENDER_W + x) << 2;
          px[i]     = (sr * shade + FOG_COLOR[0] * fog) * nightMul;
          px[i + 1] = (sg * shade + FOG_COLOR[1] * fog) * nightMul;
          px[i + 2] = (sb * shade + FOG_COLOR[2] * fog) * nightMul;
        }
      }

      // Streetlight glow at night (light pool on ground)
      if (sp.type === 'streetlight' && this.nightAlpha > 0.3 && ty < 6) {
        const glowR = Math.abs((RENDER_H / ty) * 0.4) | 0;
        const gx0 = Math.max(0, screenX - glowR);
        const gx1 = Math.min(RENDER_W - 1, screenX + glowR);
        const gy0 = Math.max(halfH, halfH + sprH / 3 | 0);
        const gy1 = Math.min(RENDER_H - 1, gy0 + glowR);
        const glowStr = this.nightAlpha * 0.15;

        for (let gx = gx0; gx <= gx1; gx++) {
          if (ty >= this.zBuf[gx]) continue;
          for (let gy = gy0; gy <= gy1; gy++) {
            const gdx = (gx - screenX) / glowR;
            const gdy = (gy - gy0) / (gy1 - gy0 || 1);
            const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
            if (gDist > 1) continue;
            const intensity = (1 - gDist) * glowStr;
            const gi = (gy * RENDER_W + gx) << 2;
            px[gi]     = Math.min(255, px[gi] + 200 * intensity);
            px[gi + 1] = Math.min(255, px[gi + 1] + 180 * intensity);
            px[gi + 2] = Math.min(255, px[gi + 2] + 120 * intensity);
          }
        }
      }
    }
  }

  _parseColor(hex) {
    if (!hex || hex[0] !== '#') return [160, 160, 160];
    if (hex.length === 4) {
      return [
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        parseInt(hex[3] + hex[3], 16),
      ];
    }
    return [
      parseInt(hex.slice(1, 3), 16) || 0,
      parseInt(hex.slice(3, 5), 16) || 0,
      parseInt(hex.slice(5, 7), 16) || 0,
    ];
  }

  // ---- HUD: mission direction indicators ----

  _drawMarkerHUD(player, markers) {
    const ctx = this._mainCtx;
    const cw = this.canvas.width;
    const markerY = 55;

    for (const m of markers) {
      const dx = m.x - player.x;
      const dy = m.y - player.y;
      const toTarget = Math.atan2(dy, dx);
      let rel = toTarget - player.angle;
      rel = ((rel + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

      const screenX = cw / 2 + (rel / HALF_FOV) * (cw / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distLabel = dist > 100 ? `${Math.floor(dist / 32)}m` : 'NEAR';
      const color = m.type === 'trigger' ? '#ffd700' : '#4fc3f7';

      ctx.font = '11px monospace';
      ctx.textAlign = 'center';

      if (screenX > 20 && screenX < cw - 20) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(screenX, markerY - 7);
        ctx.lineTo(screenX + 5, markerY);
        ctx.lineTo(screenX, markerY + 7);
        ctx.lineTo(screenX - 5, markerY);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(m.label || '', screenX, markerY - 11);
        ctx.font = '10px monospace';
        ctx.fillText(distLabel, screenX, markerY + 18);
      } else {
        const edge = rel < 0 ? 24 : cw - 24;
        ctx.fillStyle = color;
        ctx.font = '16px monospace';
        ctx.fillText(rel < 0 ? '\u25C0' : '\u25B6', edge, markerY);
        ctx.font = '10px monospace';
        ctx.fillText(distLabel, edge, markerY + 14);
      }
      ctx.textAlign = 'left';
    }
  }
}
