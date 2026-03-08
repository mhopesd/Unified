// Canvas 2D renderer — draws tiles, entities, and UI relative to camera

export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear(color = '#1a1a2e') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Draw a tile grid relative to camera
  drawTiles(tileMap, tileSize, camera, tileColors) {
    const startCol = Math.floor(camera.x / tileSize);
    const startRow = Math.floor(camera.y / tileSize);
    const endCol = startCol + Math.ceil(this.canvas.width / tileSize) + 1;
    const endRow = startRow + Math.ceil(this.canvas.height / tileSize) + 1;

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (row < 0 || col < 0 || row >= tileMap.length || col >= tileMap[0].length) continue;
        const tile = tileMap[row][col];
        const color = tileColors[tile] || '#333';
        const sx = col * tileSize - camera.x;
        const sy = row * tileSize - camera.y;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(sx, sy, tileSize, tileSize);
        // Grid lines
        this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.ctx.strokeRect(sx, sy, tileSize, tileSize);
      }
    }
  }

  // Draw a rectangle entity relative to camera
  drawEntity(entity, camera, color = '#4fc3f7') {
    const s = camera.worldToScreen(entity.x, entity.y);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(s.x, s.y, entity.w, entity.h);
  }

  // Draw a circle (for triggers/zones) relative to camera
  drawCircle(cx, cy, radius, camera, color = 'rgba(255,215,0,0.2)') {
    const s = camera.worldToScreen(cx, cy);
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  // Draw text at a world position
  drawWorldText(text, wx, wy, camera, color = '#fff', size = 12) {
    const s = camera.worldToScreen(wx, wy);
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px monospace`;
    this.ctx.fillText(text, s.x, s.y);
  }
}
