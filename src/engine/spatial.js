// Spatial partitioning — grid-based for fast entity queries

export class SpatialGrid {
  constructor(cellSize, worldW, worldH) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize);
    this.rows = Math.ceil(worldH / cellSize);
    this.cells = new Array(this.cols * this.rows);
    this.clear();
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  _cellIndex(x, y) {
    const c = Math.floor(x / this.cellSize);
    const r = Math.floor(y / this.cellSize);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  insert(entity) {
    const idx = this._cellIndex(entity.x, entity.y);
    if (idx >= 0) this.cells[idx].push(entity);
  }

  // Query all entities within radius of (x, y)
  queryRadius(x, y, radius) {
    const results = [];
    const r2 = radius * radius;
    const minC = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxC = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minR = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxR = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          const dx = e.x - x;
          const dy = e.y - y;
          if (dx * dx + dy * dy <= r2) {
            results.push(e);
          }
        }
      }
    }
    return results;
  }

  // Query AABB region
  queryAABB(x, y, w, h) {
    const results = [];
    const minC = Math.max(0, Math.floor(x / this.cellSize));
    const maxC = Math.min(this.cols - 1, Math.floor((x + w) / this.cellSize));
    const minR = Math.max(0, Math.floor(y / this.cellSize));
    const maxR = Math.min(this.rows - 1, Math.floor((y + h) / this.cellSize));

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          results.push(cell[i]);
        }
      }
    }
    return results;
  }
}
