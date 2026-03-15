// Minimap — renders a small overview of the world in a corner

import { TILE_COLORS, SOLID_TILES, TILE } from '../game/world.js';

export class Minimap {
  constructor(mapW, mapH, displaySize) {
    this.mapW = mapW;   // tile columns
    this.mapH = mapH;   // tile rows
    this.displayW = displaySize;
    this.displayH = Math.round(displaySize * (mapH / mapW));
    this.padding = 10;

    // Pre-render the map to an offscreen canvas (only once)
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.mapW;
    this.offscreen.height = this.mapH;
    this.offCtx = this.offscreen.getContext('2d');
    this.dirty = true;
  }

  // Bake the tile map into the offscreen canvas
  bake(tileMap) {
    for (let r = 0; r < this.mapH; r++) {
      for (let c = 0; c < this.mapW; c++) {
        const tile = tileMap[r][c];
        this.offCtx.fillStyle = TILE_COLORS[tile] || '#333';
        this.offCtx.fillRect(c, r, 1, 1);
      }
    }
    this.dirty = false;
  }

  // Draw the minimap onto the main canvas
  draw(ctx, canvasW, canvasH, player, tileSize, camera, markers) {
    const x = canvasW - this.displayW - this.padding;
    const y = canvasH - this.displayH - this.padding;

    // Background border
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 2, y - 2, this.displayW + 4, this.displayH + 4);

    // Draw the pre-rendered map
    ctx.drawImage(this.offscreen, x, y, this.displayW, this.displayH);

    // Camera viewport rectangle
    const scaleX = this.displayW / (this.mapW * tileSize);
    const scaleY = this.displayH / (this.mapH * tileSize);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + camera.x * scaleX,
      y + camera.y * scaleY,
      camera.viewW * scaleX,
      camera.viewH * scaleY
    );

    // Mission markers on minimap
    for (const m of markers) {
      const mx = x + m.x * scaleX;
      const my = y + m.y * scaleY;
      ctx.fillStyle = m.type === 'trigger' ? '#ffd700' : '#4fc3f7';
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player dot
    const px = x + (player.x + player.w / 2) * scaleX;
    const py = y + (player.y + player.h / 2) * scaleY;
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px monospace';
    ctx.fillText('MAP', x, y - 5);
  }
}
