// Mobile touch controls — virtual joystick and action buttons

export class MobileControls {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.joystick = { x: 0, y: 0, active: false, touchId: null, baseX: 0, baseY: 0 };
    this.lookTouch = { touchId: null, lastX: 0, lastY: 0, dx: 0 };
    this.buttons = {
      fire: { pressed: false, x: 0, y: 0, r: 32, label: 'FIRE' },
      interact: { pressed: false, x: 0, y: 0, r: 28, label: 'E' },
      vehicle: { pressed: false, x: 0, y: 0, r: 28, label: 'F' },
      sprint: { pressed: false, x: 0, y: 0, r: 24, label: 'RUN' },
      weapon: { pressed: false, x: 0, y: 0, r: 22, label: 'WPN' },
    };
    this.justPressed = {};
    this._resize();
    this._setupListeners();
  }

  // Check if device supports touch
  static shouldActivate() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  activate() {
    this.active = true;
    this._resize();
  }

  _resize() {
    const w = this.canvas.width || window.innerWidth;
    const h = this.canvas.height || window.innerHeight;

    // Joystick in bottom-left
    this.joystickRegion = { x: 0, y: h * 0.5, w: w * 0.4, h: h * 0.5 };
    this.joystick.baseX = 100;
    this.joystick.baseY = h - 120;

    // Buttons in bottom-right
    const bx = w - 80;
    const by = h - 100;
    this.buttons.fire.x = bx;
    this.buttons.fire.y = by - 60;
    this.buttons.interact.x = bx - 70;
    this.buttons.interact.y = by;
    this.buttons.vehicle.x = bx;
    this.buttons.vehicle.y = by;
    this.buttons.sprint.x = bx - 70;
    this.buttons.sprint.y = by - 60;
    this.buttons.weapon.x = bx - 35;
    this.buttons.weapon.y = by - 120;
  }

  _setupListeners() {
    const opts = { passive: false };

    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.active) return;
      e.preventDefault();
      for (const touch of e.changedTouches) {
        this._handleTouchStart(touch);
      }
    }, opts);

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.active) return;
      e.preventDefault();
      for (const touch of e.changedTouches) {
        this._handleTouchMove(touch);
      }
    }, opts);

    this.canvas.addEventListener('touchend', (e) => {
      if (!this.active) return;
      e.preventDefault();
      for (const touch of e.changedTouches) {
        this._handleTouchEnd(touch);
      }
    }, opts);

    this.canvas.addEventListener('touchcancel', (e) => {
      if (!this.active) return;
      for (const touch of e.changedTouches) {
        this._handleTouchEnd(touch);
      }
    }, opts);

    window.addEventListener('resize', () => this._resize());
  }

  _handleTouchStart(touch) {
    const x = touch.clientX;
    const y = touch.clientY;

    // Check joystick region (left side)
    const jr = this.joystickRegion;
    if (x < jr.x + jr.w && y > jr.y && !this.joystick.active) {
      this.joystick.active = true;
      this.joystick.touchId = touch.identifier;
      this.joystick.baseX = x;
      this.joystick.baseY = y;
      this.joystick.x = 0;
      this.joystick.y = 0;
      return;
    }

    // Check buttons
    for (const [name, btn] of Object.entries(this.buttons)) {
      const dx = x - btn.x;
      const dy = y - btn.y;
      if (dx * dx + dy * dy < (btn.r + 15) * (btn.r + 15)) {
        btn.pressed = true;
        btn._touchId = touch.identifier;
        this.justPressed[name] = true;
        return;
      }
    }

    // Right side = look (camera rotation)
    if (x > this.canvas.width * 0.4) {
      this.lookTouch.touchId = touch.identifier;
      this.lookTouch.lastX = x;
      this.lookTouch.lastY = y;
      this.lookTouch.dx = 0;
    }
  }

  _handleTouchMove(touch) {
    // Joystick
    if (touch.identifier === this.joystick.touchId) {
      const dx = touch.clientX - this.joystick.baseX;
      const dy = touch.clientY - this.joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 50;
      if (dist > maxDist) {
        this.joystick.x = (dx / dist) * maxDist;
        this.joystick.y = (dy / dist) * maxDist;
      } else {
        this.joystick.x = dx;
        this.joystick.y = dy;
      }
    }

    // Look
    if (touch.identifier === this.lookTouch.touchId) {
      this.lookTouch.dx = touch.clientX - this.lookTouch.lastX;
      this.lookTouch.lastX = touch.clientX;
      this.lookTouch.lastY = touch.clientY;
    }
  }

  _handleTouchEnd(touch) {
    if (touch.identifier === this.joystick.touchId) {
      this.joystick.active = false;
      this.joystick.touchId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
    }

    if (touch.identifier === this.lookTouch.touchId) {
      this.lookTouch.touchId = null;
      this.lookTouch.dx = 0;
    }

    for (const btn of Object.values(this.buttons)) {
      if (btn._touchId === touch.identifier) {
        btn.pressed = false;
        btn._touchId = null;
      }
    }
  }

  // Get normalized joystick values (-1 to 1)
  getMovement() {
    if (!this.joystick.active) return { x: 0, y: 0 };
    return {
      x: this.joystick.x / 50,
      y: this.joystick.y / 50,
    };
  }

  // Get look delta (camera rotation)
  consumeLookDX() {
    const dx = this.lookTouch.dx;
    this.lookTouch.dx = 0;
    return dx * 0.003; // sensitivity
  }

  wasJustPressed(name) {
    return !!this.justPressed[name];
  }

  clearJustPressed() {
    this.justPressed = {};
  }

  draw(ctx, canvasW, canvasH) {
    if (!this.active) return;

    ctx.save();
    ctx.globalAlpha = 0.35;

    // Joystick base
    if (this.joystick.active) {
      ctx.beginPath();
      ctx.arc(this.joystick.baseX, this.joystick.baseY, 50, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Joystick knob
      ctx.beginPath();
      ctx.arc(
        this.joystick.baseX + this.joystick.x,
        this.joystick.baseY + this.joystick.y,
        22, 0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    } else {
      // Static hint
      ctx.beginPath();
      ctx.arc(100, canvasH - 120, 40, 0, Math.PI * 2);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE', 100, canvasH - 117);
    }

    // Buttons
    for (const [name, btn] of Object.entries(this.buttons)) {
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
      ctx.fillStyle = btn.pressed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = btn.pressed ? '#fff' : '#888';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = btn.pressed ? '#fff' : '#aaa';
      ctx.font = `bold ${btn.r > 28 ? 12 : 10}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x, btn.y);
    }

    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
}
