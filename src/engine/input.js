// Keyboard + mouse input manager
const keys = {};
const justPressed = {};
let mouseDX = 0;
let mouseClicked = false;
let mouseHeld = false;

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Mouse look (only when pointer is locked)
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      mouseDX += e.movementX;
    }
  });

  // Mouse click (for shooting)
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement && e.button === 0) {
      mouseClicked = true;
      mouseHeld = true;
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseHeld = false;
  });
}

export function requestPointerLock(el) {
  el.requestPointerLock();
}

export function isPointerLocked() {
  return !!document.pointerLockElement;
}

export function consumeMouseDX() {
  const dx = mouseDX;
  mouseDX = 0;
  return dx;
}

export function isKeyDown(code) { return !!keys[code]; }
export function wasKeyPressed(code) { return !!justPressed[code]; }
export function wasMouseClicked() { return mouseClicked; }
export function isMouseHeld() { return mouseHeld; }
export function clearJustPressed() { for (const k in justPressed) delete justPressed[k]; mouseClicked = false; }
