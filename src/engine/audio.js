// Audio — synthesized sound effects using Web Audio API (no files needed)

let ctx = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
}

// Ensure audio context is resumed (browser autoplay policy)
export function unlockAudio() {
  const resume = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('keydown', resume, { once: true });
  window.addEventListener('click', resume, { once: true });
}

// Play a short blip sound (mission accept, objective complete, etc.)
export function playBlip(freq = 600, duration = 0.1) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

// Rising chime (mission accepted)
export function playAccept() {
  playBlip(440, 0.08);
  setTimeout(() => playBlip(660, 0.08), 80);
  setTimeout(() => playBlip(880, 0.12), 160);
}

// Ding (objective complete)
export function playObjectiveComplete() {
  playBlip(800, 0.15);
  setTimeout(() => playBlip(1000, 0.2), 100);
}

// Fanfare (mission complete)
export function playMissionComplete() {
  playBlip(523, 0.1);
  setTimeout(() => playBlip(659, 0.1), 100);
  setTimeout(() => playBlip(784, 0.1), 200);
  setTimeout(() => playBlip(1047, 0.25), 300);
}

// Click (UI interaction)
export function playClick() {
  playBlip(1200, 0.04);
}

// Error buzz
export function playError() {
  playBlip(150, 0.2);
}

// Footstep (subtle)
export function playStep() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'triangle';
  osc.frequency.value = 80 + Math.random() * 40;
  gain.gain.setValueAtTime(0.04, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.05);
}
