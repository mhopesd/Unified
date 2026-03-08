// Keyboard input manager — tracks which keys are currently held
const keys = {};
const justPressed = {};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) {
      justPressed[e.code] = true;
    }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
}

export function isKeyDown(code) {
  return !!keys[code];
}

export function wasKeyPressed(code) {
  return !!justPressed[code];
}

export function clearJustPressed() {
  for (const k in justPressed) {
    delete justPressed[k];
  }
}
