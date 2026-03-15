// Raycaster renderer — street-level 3D with variable wall heights,
// atmospheric fog, and gritty retro aesthetic.
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
const FOG_DIST    = 12;          // tighter fog for depth

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
  }

  get ctx() { return this._mainCtx; }
  setNightAlpha(a) { this.nightAlpha = a; }

  // ---- Wall height per tile (variable for depth) ----

  _wallHeight(tile, col, row) {
    if (tile === TILE.BUILDING) {
      // Buildings vary from 1.0 to 2.4 — creates a skyline
      return 1.0 + hash(col, row, 7) * 1.4;
    }
    if (tile === TILE.WALL) return 1.8; // border walls are tall
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

  renderScene(player, worldMap, tileSize, sprites, markers) {
    const px = this.px;
    const rows = worldMap.length;
    const cols = worldMap[0].length;
    const pmx = player.x / tileSize;
    const pmy = player.y / tileSize;

    const nightMul = 1 - this.nightAlpha * 0.5;
    const nightTint = this.nightAlpha * 22;

    // --- 1. Fill sky gradient ---
    const halfH = RENDER_H >> 1;
    for (let y = 0; y < halfH; y++) {
      const t = y / halfH;
      const sr = (SKY_TOP[0] + (SKY_HORIZON[0] - SKY_TOP[0]) * t) * nightMul;
      const sg = (SKY_TOP[1] + (SKY_HORIZON[1] - SKY_TOP[1]) * t) * nightMul;
      const sb = (SKY_TOP[2] + (SKY_HORIZON[2] - SKY_TOP[2]) * t) * nightMul + nightTint;
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

    // --- 4. Blit buffer → main canvas ---
    this.bufCtx.putImageData(this.img, 0, 0);
    this._mainCtx.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);

    // --- 5. Direction indicators for mission markers ---
    if (markers) this._drawMarkerHUD(player, markers);
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
      const hScale = sp.type === 'vehicle' ? 0.5 : 0.65;
      const wScale = sp.type === 'vehicle' ? 0.7 : 0.3;
      const sprH = Math.abs((RENDER_H / ty) * hScale) | 0;
      const sprW = Math.abs((RENDER_H / ty) * wScale) | 0;

      const y0 = Math.max(0, halfH - sprH / 2 | 0);
      const y1 = Math.min(RENDER_H - 1, halfH + sprH / 2 | 0);
      const x0 = Math.max(0, screenX - sprW / 2 | 0);
      const x1 = Math.min(RENDER_W - 1, screenX + sprW / 2 | 0);

      const dist = Math.sqrt(sp.dist2);
      const fog = Math.min(1, dist / FOG_DIST);
      const shade = 1 - fog;
      const [cr, cg, cb] = this._parseColor(sp.color);

      for (let x = x0; x <= x1; x++) {
        if (ty >= this.zBuf[x]) continue;
        for (let y = y0; y <= y1; y++) {
          let sr = cr, sg = cg, sb = cb;
          if (sp.type !== 'vehicle') {
            const ry = (y - y0) / (y1 - y0);
            if (ry < 0.22) {
              sr = 180; sg = 145; sb = 112; // head
            }
          }
          const i = (y * RENDER_W + x) << 2;
          px[i]     = (sr * shade + FOG_COLOR[0] * fog) * nightMul;
          px[i + 1] = (sg * shade + FOG_COLOR[1] * fog) * nightMul;
          px[i + 2] = (sb * shade + FOG_COLOR[2] * fog) * nightMul;
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
