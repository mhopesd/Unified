// Visual mission editor — drag-and-drop waypoints on a map overview

export class VisualMissionEditor {
  constructor(worldMap, tileSize, marketplace) {
    this.worldMap = worldMap;
    this.tileSize = tileSize;
    this.marketplace = marketplace;
    this.worldW = worldMap[0].length * tileSize;
    this.worldH = worldMap.length * tileSize;
    this.isOpen = false;

    // Mission being edited
    this.missionName = '';
    this.missionAuthor = '';
    this.missionDesc = '';
    this.difficulty = 'medium';
    this.rewardCash = 1000;
    this.rewardXp = 200;
    this.triggerPoint = null;    // { x, y }
    this.waypoints = [];         // [ { x, y, type, description, radius } ]
    this.selectedWaypoint = -1;  // index of selected waypoint (-1 = none, -2 = trigger)
    this.dragging = false;

    // Canvas for the map overview
    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
    this._bakedMap = null;

    this._build();
  }

  _build() {
    // Overlay container
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100;
      display:none;flex-direction:row;font-family:monospace;
    `;

    // Left: map canvas
    const mapPanel = document.createElement('div');
    mapPanel.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:20px;';

    this.canvas = document.createElement('canvas');
    this.canvas.width = 600;
    this.canvas.height = 480;
    this.canvas.style.cssText = 'border:1px solid #444;cursor:crosshair;';
    this.ctx = this.canvas.getContext('2d');
    mapPanel.appendChild(this.canvas);
    this.overlay.appendChild(mapPanel);

    // Right: controls panel
    const panel = document.createElement('div');
    panel.style.cssText = 'width:280px;background:#111;border-left:1px solid #333;padding:16px;overflow-y:auto;color:#eee;';
    this.controlsPanel = panel;
    this.overlay.appendChild(panel);

    document.body.appendChild(this.overlay);

    // Canvas mouse events
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this._onMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this._onDoubleClick(e));
  }

  open() {
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this._bakeMap();
    this._buildControls();
    this._drawMap();
  }

  close() {
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _bakeMap() {
    if (this._bakedMap) return;
    // Pre-render a small overview of the world
    const mapCanvas = document.createElement('canvas');
    const scale = 600 / this.worldW;
    mapCanvas.width = 600;
    mapCanvas.height = Math.ceil(this.worldH * scale);
    const mctx = mapCanvas.getContext('2d');

    const colors = {
      0: '#3a3a3a', 1: '#888', 2: '#555', 3: '#2d5a27',
      4: '#1a3a5c', 5: '#444', 6: '#4a4a4a', 7: '#2a6b22',
    };

    const rows = this.worldMap.length;
    const cols = this.worldMap[0].length;
    const tw = this.tileSize * scale;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.worldMap[r][c];
        mctx.fillStyle = colors[tile] || '#333';
        mctx.fillRect(c * tw, r * tw, Math.ceil(tw), Math.ceil(tw));
      }
    }

    this._bakedMap = mapCanvas;
    this.mapScale = scale;
  }

  _worldToCanvas(wx, wy) {
    return {
      cx: wx * this.mapScale,
      cy: wy * this.mapScale,
    };
  }

  _canvasToWorld(cx, cy) {
    return {
      wx: cx / this.mapScale,
      wy: cy / this.mapScale,
    };
  }

  _drawMap() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw baked map
    if (this._bakedMap) {
      ctx.drawImage(this._bakedMap, 0, 0);
    }

    // Draw trigger point
    if (this.triggerPoint) {
      const { cx, cy } = this._worldToCanvas(this.triggerPoint.x, this.triggerPoint.y);
      ctx.fillStyle = this.selectedWaypoint === -2 ? '#ff0' : '#ffd700';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('T', cx, cy + 3);
    }

    // Draw waypoints with connecting lines
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const { cx, cy } = this._worldToCanvas(wp.x, wp.y);

      // Line from previous waypoint (or trigger)
      if (i === 0 && this.triggerPoint) {
        const prev = this._worldToCanvas(this.triggerPoint.x, this.triggerPoint.y);
        ctx.strokeStyle = 'rgba(255,215,0,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (i > 0) {
        const prev = this._worldToCanvas(this.waypoints[i - 1].x, this.waypoints[i - 1].y);
        ctx.strokeStyle = 'rgba(100,200,255,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Waypoint circle
      const isSelected = i === this.selectedWaypoint;
      const typeColors = {
        goto: '#4fc3f7', collect: '#66bb6a', interact: '#ffa726',
        escort: '#ab47bc', survive: '#ef5350', race: '#26c6da', stealth: '#78909c',
      };
      ctx.fillStyle = isSelected ? '#fff' : (typeColors[wp.type] || '#4fc3f7');
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Number label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, cx, cy + 3);

      // Radius circle
      if (isSelected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, (wp.radius || 40) * this.mapScale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Double-click: add waypoint  |  Drag: move  |  Right-click: set trigger', 8, this.canvas.height - 8);

    ctx.textAlign = 'left';
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Right-click: set trigger
    if (e.button === 2) {
      e.preventDefault();
      const { wx, wy } = this._canvasToWorld(cx, cy);
      this.triggerPoint = { x: Math.round(wx), y: Math.round(wy) };
      this.selectedWaypoint = -2;
      this._buildControls();
      this._drawMap();
      return;
    }

    // Check if clicking on existing waypoint
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const { cx: wcx, cy: wcy } = this._worldToCanvas(wp.x, wp.y);
      const dx = cx - wcx, dy = cy - wcy;
      if (dx * dx + dy * dy < 100) {
        this.selectedWaypoint = i;
        this.dragging = true;
        this._buildControls();
        this._drawMap();
        return;
      }
    }

    // Check trigger
    if (this.triggerPoint) {
      const { cx: tcx, cy: tcy } = this._worldToCanvas(this.triggerPoint.x, this.triggerPoint.y);
      const dx = cx - tcx, dy = cy - tcy;
      if (dx * dx + dy * dy < 100) {
        this.selectedWaypoint = -2;
        this.dragging = true;
        this._buildControls();
        this._drawMap();
        return;
      }
    }

    this.selectedWaypoint = -1;
    this._buildControls();
    this._drawMap();
  }

  _onMouseMove(e) {
    if (!this.dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { wx, wy } = this._canvasToWorld(cx, cy);

    if (this.selectedWaypoint === -2 && this.triggerPoint) {
      this.triggerPoint.x = Math.round(wx);
      this.triggerPoint.y = Math.round(wy);
    } else if (this.selectedWaypoint >= 0) {
      this.waypoints[this.selectedWaypoint].x = Math.round(wx);
      this.waypoints[this.selectedWaypoint].y = Math.round(wy);
    }
    this._drawMap();
  }

  _onMouseUp() {
    this.dragging = false;
    this._buildControls();
  }

  _onDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { wx, wy } = this._canvasToWorld(cx, cy);

    // If no trigger set, first double-click sets trigger
    if (!this.triggerPoint) {
      this.triggerPoint = { x: Math.round(wx), y: Math.round(wy) };
      this.selectedWaypoint = -2;
    } else {
      // Add waypoint
      this.waypoints.push({
        x: Math.round(wx), y: Math.round(wy),
        type: 'goto', description: `Objective ${this.waypoints.length + 1}`,
        radius: 40,
      });
      this.selectedWaypoint = this.waypoints.length - 1;
    }
    this._buildControls();
    this._drawMap();
  }

  _buildControls() {
    const panel = this.controlsPanel;
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    const style = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:11px;box-sizing:border-box;margin-bottom:6px;';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X Close';
    closeBtn.style.cssText = 'float:right;padding:3px 8px;background:#a33;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;';
    closeBtn.addEventListener('click', () => this.close());
    panel.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.textContent = 'Visual Editor';
    title.style.cssText = 'color:#ffd700;font-size:14px;margin-bottom:12px;';
    panel.appendChild(title);

    // Mission metadata
    const addField = (label, value, onChange) => {
      const lbl = document.createElement('label');
      lbl.textContent = label;
      lbl.style.cssText = 'display:block;font-size:10px;color:#888;margin-bottom:2px;';
      panel.appendChild(lbl);
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = value;
      inp.style.cssText = style;
      inp.addEventListener('input', () => onChange(inp.value));
      panel.appendChild(inp);
    };

    addField('Mission Name', this.missionName, v => this.missionName = v);
    addField('Author', this.missionAuthor, v => this.missionAuthor = v);
    addField('Description', this.missionDesc, v => this.missionDesc = v);

    // Waypoint list
    const wpTitle = document.createElement('div');
    wpTitle.textContent = `Waypoints (${this.waypoints.length})`;
    wpTitle.style.cssText = 'color:#4fc3f7;font-size:11px;margin:10px 0 6px;font-weight:bold;';
    panel.appendChild(wpTitle);

    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const isSelected = i === this.selectedWaypoint;
      const row = document.createElement('div');
      row.style.cssText = `padding:6px;border:1px solid ${isSelected ? '#4fc3f7' : '#333'};border-radius:4px;margin-bottom:4px;background:${isSelected ? '#1a2a3a' : '#1a1a1a'};cursor:pointer;`;
      row.addEventListener('click', () => {
        this.selectedWaypoint = i;
        this._buildControls();
        this._drawMap();
      });

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      const num = document.createElement('span');
      num.textContent = `#${i + 1} ${wp.type}`;
      num.style.cssText = 'color:#4fc3f7;font-size:10px;';
      header.appendChild(num);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.style.cssText = 'padding:1px 5px;background:#a33;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:9px;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.waypoints.splice(i, 1);
        this.selectedWaypoint = -1;
        this._buildControls();
        this._drawMap();
      });
      header.appendChild(delBtn);
      row.appendChild(header);

      if (isSelected) {
        // Type selector
        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = 'width:100%;padding:2px;background:#111;border:1px solid #333;color:#eee;border-radius:2px;font-size:10px;margin-top:4px;';
        for (const t of ['goto', 'collect', 'interact', 'escort', 'survive', 'race', 'stealth']) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          opt.selected = wp.type === t;
          typeSelect.appendChild(opt);
        }
        typeSelect.addEventListener('change', () => {
          wp.type = typeSelect.value;
          this._drawMap();
        });
        row.appendChild(typeSelect);

        // Description
        const descInp = document.createElement('input');
        descInp.type = 'text';
        descInp.value = wp.description;
        descInp.placeholder = 'Description';
        descInp.style.cssText = 'width:100%;padding:2px 4px;background:#111;border:1px solid #333;color:#eee;border-radius:2px;font-size:10px;margin-top:4px;box-sizing:border-box;';
        descInp.addEventListener('input', () => wp.description = descInp.value);
        row.appendChild(descInp);

        // Coordinates (read-only, drag to change)
        const coordSpan = document.createElement('span');
        coordSpan.textContent = `(${wp.x}, ${wp.y}) r=${wp.radius}`;
        coordSpan.style.cssText = 'display:block;font-size:9px;color:#666;margin-top:2px;';
        row.appendChild(coordSpan);
      }

      panel.appendChild(row);
    }

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit Mission';
    submitBtn.style.cssText = 'margin-top:12px;padding:8px 12px;background:#ffd700;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;width:100%;';
    submitBtn.addEventListener('click', () => this._submit());
    panel.appendChild(submitBtn);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'margin-top:8px;font-size:11px;min-height:16px;';
    panel.appendChild(this.statusEl);
  }

  _submit() {
    if (!this.triggerPoint) {
      this.statusEl.textContent = 'Set a trigger point first (double-click on map)';
      this.statusEl.style.color = '#f44';
      return;
    }
    if (this.waypoints.length === 0) {
      this.statusEl.textContent = 'Add at least one waypoint';
      this.statusEl.style.color = '#f44';
      return;
    }

    const missionData = {
      id: 'visual-' + Date.now(),
      name: this.missionName || 'Visual Mission',
      author: this.missionAuthor || 'Map Editor',
      description: this.missionDesc || '',
      difficulty: this.difficulty,
      triggerZone: { x: this.triggerPoint.x, y: this.triggerPoint.y, radius: 50 },
      objectives: this.waypoints.map(wp => ({
        type: wp.type || 'goto',
        description: wp.description || 'Reach target',
        target: { x: wp.x, y: wp.y, radius: wp.radius || 40 },
      })),
      reward: { cash: this.rewardCash, xp: this.rewardXp },
      fail_conditions: [{ type: 'player_death', message: 'Mission failed.' }],
    };

    const success = this.marketplace.addToCatalog(missionData);
    if (success) {
      this.statusEl.textContent = 'Mission created! Check marketplace.';
      this.statusEl.style.color = '#4f4';
      // Reset
      this.triggerPoint = null;
      this.waypoints = [];
      this.missionName = '';
      this.missionDesc = '';
      this.selectedWaypoint = -1;
      setTimeout(() => {
        this._buildControls();
        this._drawMap();
      }, 1500);
    } else {
      this.statusEl.textContent = 'Submission failed — invalid mission data';
      this.statusEl.style.color = '#f44';
    }
  }
}
