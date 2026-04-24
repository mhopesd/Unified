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

// Gunshot (white noise burst + low thump)
export function playGunshot(type = 'single') {
  const ac = getCtx();
  const t = ac.currentTime;

  // Noise burst (using oscillator with fast frequency modulation for noise-like effect)
  const noiseOsc = ac.createOscillator();
  const noiseGain = ac.createGain();
  noiseOsc.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noiseOsc.type = 'sawtooth';
  noiseOsc.frequency.setValueAtTime(800, t);
  noiseOsc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  noiseGain.gain.setValueAtTime(type === 'auto' ? 0.12 : 0.18, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  noiseOsc.start(t);
  noiseOsc.stop(t + 0.12);

  // Low thump
  const thump = ac.createOscillator();
  const thumpGain = ac.createGain();
  thump.connect(thumpGain);
  thumpGain.connect(ac.destination);
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, t);
  thump.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  thumpGain.gain.setValueAtTime(0.2, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  thump.start(t);
  thump.stop(t + 0.18);

  // High crack
  const crack = ac.createOscillator();
  const crackGain = ac.createGain();
  crack.connect(crackGain);
  crackGain.connect(ac.destination);
  crack.type = 'square';
  crack.frequency.value = 2000 + Math.random() * 1000;
  crackGain.gain.setValueAtTime(0.06, t);
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  crack.start(t);
  crack.stop(t + 0.05);
}

// Engine loop (called each frame when in vehicle — creates short bursts)
let engineOsc = null;
let engineGain = null;
export function playEngineLoop(speed, maxSpeed) {
  const ac = getCtx();
  if (!engineOsc) {
    engineOsc = ac.createOscillator();
    engineGain = ac.createGain();
    engineOsc.connect(engineGain);
    engineGain.connect(ac.destination);
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain.gain.value = 0;
    engineOsc.start();
  }
  const rpm = Math.abs(speed) / maxSpeed;
  engineOsc.frequency.value = 40 + rpm * 120;
  engineGain.gain.value = Math.min(0.06, rpm * 0.08 + 0.01);
}

export function stopEngineLoop() {
  if (engineGain) {
    engineGain.gain.value = 0;
  }
}

// Car horn honk
export function playHonk() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.setValueAtTime(460, t + 0.12);
  gain.gain.setValueAtTime(0.09, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.start(t);
  osc.stop(t + 0.38);
}

// Police siren — continuous loop, updated each frame
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;

export function updateSiren(dt, wantedLevel) {
  const ac = getCtx();
  if (wantedLevel >= 3) {
    if (!sirenOsc) {
      sirenOsc = ac.createOscillator();
      sirenGain = ac.createGain();
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ac.destination);
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 900;
      sirenGain.gain.value = 0;
      sirenOsc.start();
    }
    sirenTimer += dt;
    // Wee-woo oscillation (0.5s per half-cycle)
    const phase = (sirenTimer % 1.0);
    sirenOsc.frequency.value = phase < 0.5 ? 900 : 700;
    sirenGain.gain.value = 0.035 * Math.min(1, (wantedLevel - 2) / 3);
  } else if (sirenGain) {
    sirenGain.gain.value = 0;
  }
}

export function stopSiren() {
  if (sirenGain) sirenGain.gain.value = 0;
}

// ─── Ambient city background ───────────────────────────────────────────────

let ambCityOsc = null;
let ambCityGain = null;
let ambCityOsc2 = null;
let ambCityGain2 = null;
let ambCityTimer = 0;

export function startAmbientCity() {
  const ac = getCtx();
  if (ambCityOsc) return; // already running

  // Subsonic city rumble (low traffic hum)
  ambCityOsc = ac.createOscillator();
  ambCityGain = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  ambCityOsc.connect(lp);
  lp.connect(ambCityGain);
  ambCityGain.connect(ac.destination);
  ambCityOsc.type = 'sawtooth';
  ambCityOsc.frequency.value = 48;
  ambCityGain.gain.value = 0;
  ambCityOsc.start();

  // Mid-range city texture (distant activity)
  ambCityOsc2 = ac.createOscillator();
  ambCityGain2 = ac.createGain();
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 380;
  bp.Q.value = 0.8;
  ambCityOsc2.connect(bp);
  bp.connect(ambCityGain2);
  ambCityGain2.connect(ac.destination);
  ambCityOsc2.type = 'sawtooth';
  ambCityOsc2.frequency.value = 115;
  ambCityGain2.gain.value = 0;
  ambCityOsc2.start();
}

export function updateAmbientCity(dt, timeOfDay, rainIntensity) {
  const ac = getCtx();
  ambCityTimer += dt;
  if (!ambCityGain || !ambCityGain2) return;

  // Day is louder with city activity; night is quieter
  const isDaytime = timeOfDay > 0.2 && timeOfDay < 0.8;
  const baseVol = isDaytime ? 0.022 : 0.010;

  // Slow breathing variation
  const breathe = 1 + Math.sin(ambCityTimer * 0.18) * 0.18;
  // Rain dampens city sounds slightly (people indoors)
  const rainMul = 1 - rainIntensity * 0.3;
  ambCityGain.gain.setTargetAtTime(baseVol * breathe * rainMul, ac.currentTime, 1.2);
  ambCityGain2.gain.setTargetAtTime(baseVol * 0.45 * breathe * rainMul, ac.currentTime, 1.2);
}

export function stopAmbientCity() {
  if (ambCityGain) ambCityGain.gain.setTargetAtTime(0, getCtx().currentTime, 0.5);
  if (ambCityGain2) ambCityGain2.gain.setTargetAtTime(0, getCtx().currentTime, 0.5);
}

// ─── NPC voice chirp ─────────────────────────────────────────────────────────

export function playNPCVoice() {
  const ac = getCtx();
  const t = ac.currentTime;
  // Two-tone voice chirp (like a cartoon speech sound)
  const base = 260 + Math.random() * 180;
  const pitches = [base, base * 0.82, base * 1.18];
  for (let i = 0; i < 3; i++) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = 'sine';
    const d = i * 0.07;
    osc.frequency.setValueAtTime(pitches[i], t + d);
    osc.frequency.exponentialRampToValueAtTime(pitches[i] * 0.9, t + d + 0.06);
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.038, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.08);
    osc.start(t + d);
    osc.stop(t + d + 0.1);
  }
}

// ─── Rain sound ─────────────────────────────────────────────────────────────

let rainNode = null;
let rainGainNode = null;

export function updateRainSound(rainIntensity) {
  const ac = getCtx();
  if (rainIntensity > 0.05) {
    if (!rainNode) {
      rainNode = ac.createOscillator();
      rainGainNode = ac.createGain();
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      rainNode.connect(hp);
      hp.connect(rainGainNode);
      rainGainNode.connect(ac.destination);
      rainNode.type = 'sawtooth';
      rainNode.frequency.value = 3800;
      rainGainNode.gain.value = 0;
      rainNode.start();
    }
    rainGainNode.gain.setTargetAtTime(rainIntensity * 0.028, ac.currentTime, 0.6);
  } else if (rainGainNode) {
    rainGainNode.gain.setTargetAtTime(0, ac.currentTime, 2.0);
  }
}

// ─── Bird chirp (daytime ambient) ───────────────────────────────────────────

export function playBirdChirp() {
  const ac = getCtx();
  const t = ac.currentTime;
  const base = 1400 + Math.random() * 900;
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = 'sine';
    const d = i * (0.05 + Math.random() * 0.05);
    osc.frequency.setValueAtTime(base + Math.random() * 300, t + d);
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + d + 0.045);
    osc.frequency.exponentialRampToValueAtTime(base * 0.92, t + d + 0.1);
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.028, t + d + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.13);
    osc.start(t + d);
    osc.stop(t + d + 0.15);
  }
}

// ─── Tire screech (drifting) ─────────────────────────────────────────────────

let screechOsc = null;
let screechGain = null;

// Call each frame with intensity 0–1. Will create/ramp the oscillator.
export function updateTireScreech(intensity) {
  const ac = getCtx();
  if (intensity > 0.05) {
    if (!screechOsc) {
      screechOsc = ac.createOscillator();
      screechGain = ac.createGain();
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      screechOsc.connect(hp);
      hp.connect(screechGain);
      screechGain.connect(ac.destination);
      screechOsc.type = 'sawtooth';
      screechOsc.frequency.value = 1600;
      screechGain.gain.value = 0;
      screechOsc.start();
    }
    const targetVol = intensity * 0.055;
    screechGain.gain.setTargetAtTime(targetVol, ac.currentTime, 0.08);
    // Pitch rises with intensity
    screechOsc.frequency.setTargetAtTime(1200 + intensity * 600, ac.currentTime, 0.1);
  } else if (screechGain) {
    screechGain.gain.setTargetAtTime(0, ac.currentTime, 0.12);
  }
}

// ─── Melee hit thud ──────────────────────────────────────────────────────────

export function playMeleeHit() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.start(t);
  osc.stop(t + 0.16);
  // Thwack crunch
  const crack = ac.createOscillator();
  const cg = ac.createGain();
  crack.connect(cg);
  cg.connect(ac.destination);
  crack.type = 'square';
  crack.frequency.value = 400 + Math.random() * 200;
  cg.gain.setValueAtTime(0.12, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  crack.start(t);
  crack.stop(t + 0.06);
}

// ─── Explosion boom ──────────────────────────────────────────────────────────

export function playExplosion() {
  const ac = getCtx();
  const t = ac.currentTime;

  // Low thunderous boom
  const boom = ac.createOscillator();
  const bGain = ac.createGain();
  boom.connect(bGain);
  bGain.connect(ac.destination);
  boom.type = 'sine';
  boom.frequency.setValueAtTime(80, t);
  boom.frequency.exponentialRampToValueAtTime(18, t + 0.55);
  bGain.gain.setValueAtTime(0.55, t);
  bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  boom.start(t); boom.stop(t + 0.7);

  // Mid crunch/blast
  const crunch = ac.createOscillator();
  const cGain = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 600;
  crunch.connect(lp); lp.connect(cGain); cGain.connect(ac.destination);
  crunch.type = 'sawtooth';
  crunch.frequency.setValueAtTime(220, t);
  crunch.frequency.exponentialRampToValueAtTime(55, t + 0.22);
  cGain.gain.setValueAtTime(0.22, t);
  cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  crunch.start(t); crunch.stop(t + 0.35);

  // Initial sharp snap
  const snap = ac.createOscillator();
  const sGain = ac.createGain();
  snap.connect(sGain); sGain.connect(ac.destination);
  snap.type = 'square';
  snap.frequency.value = 900 + Math.random() * 400;
  sGain.gain.setValueAtTime(0.18, t);
  sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
  snap.start(t); snap.stop(t + 0.07);
}

// ─── Distant crowd murmur ────────────────────────────────────────────────────

// ─── Cash register (shop purchase) ──────────────────────────────────────────

export function playCashRegister() {
  const ac = getCtx();
  const t = ac.currentTime;
  // Cha-ching!
  playBlip(1200, 0.06);
  setTimeout(() => playBlip(1600, 0.06), 60);
  setTimeout(() => playBlip(2000, 0.1), 120);
}

// ─── Vehicle crash/crunch ──────────────────────────────────────────────────

export function playCarCrash() {
  const ac = getCtx();
  const t = ac.currentTime;
  // Metal crunch
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.connect(g); g.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.start(t); osc.stop(t + 0.28);
  // Glass shatter
  const glass = ac.createOscillator();
  const gg = ac.createGain();
  glass.connect(gg); gg.connect(ac.destination);
  glass.type = 'square';
  glass.frequency.value = 3000 + Math.random() * 1500;
  gg.gain.setValueAtTime(0.08, t + 0.05);
  gg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  glass.start(t + 0.05); glass.stop(t + 0.15);
}

// ─── Door open/close ───────────────────────────────────────────────────────

export function playDoorOpen() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.connect(g); g.connect(ac.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(350, t + 0.15);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.start(t); osc.stop(t + 0.22);
}

// ─── Weapon switch click ───────────────────────────────────────────────────

export function playWeaponSwitch() {
  const ac = getCtx();
  const t = ac.currentTime;
  playBlip(600, 0.03);
  setTimeout(() => playBlip(800, 0.04), 40);
}

// ─── Enemy gunshot (slightly different pitch) ──────────────────────────────

export function playEnemyGunshot() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.connect(g); g.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.06);
  g.gain.setValueAtTime(0.10, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.start(t); osc.stop(t + 0.1);
}

// Helicopter rotor — continuous low thwack sound
let heliOsc = null;
let heliGain = null;
export function updateHelicopterSound(active) {
  const ac = getCtx();
  if (active && !heliOsc) {
    heliOsc = ac.createOscillator();
    heliGain = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    heliOsc.connect(lp);
    lp.connect(heliGain);
    heliGain.connect(ac.destination);
    heliOsc.type = 'sawtooth';
    heliOsc.frequency.value = 22;
    heliGain.gain.value = 0.06;
    heliOsc.start();
  } else if (!active && heliOsc) {
    heliOsc.stop();
    heliOsc.disconnect();
    heliGain.disconnect();
    heliOsc = null;
    heliGain = null;
  }
}

// Punch combo hit — slightly different pitch per combo count
export function playComboHit(comboCount) {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.connect(g);
  g.connect(ac.destination);
  osc.type = 'square';
  osc.frequency.value = 120 + comboCount * 30;
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.start(t);
  osc.stop(t + 0.12);
  // Impact bass thud
  const osc2 = ac.createOscillator();
  const g2 = ac.createGain();
  osc2.connect(g2);
  g2.connect(ac.destination);
  osc2.type = 'sine';
  osc2.frequency.value = 60 + comboCount * 10;
  g2.gain.setValueAtTime(0.15, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc2.start(t);
  osc2.stop(t + 0.16);
}

// Property purchase jingle
export function playPropertyBuy() {
  const ac = getCtx();
  const t = ac.currentTime;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = t + i * 0.12;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.12, start + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

// Helicopter spotlight whoosh
export function playSpotlightSweep() {
  const ac = getCtx();
  const t = ac.currentTime;
  const noise = ac.createOscillator();
  const g = ac.createGain();
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 800;
  bp.Q.value = 1;
  noise.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  noise.type = 'sawtooth';
  noise.frequency.value = 40;
  g.gain.setValueAtTime(0.02, t);
  g.gain.linearRampToValueAtTime(0.04, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  noise.start(t);
  noise.stop(t + 0.9);
}

// Water splash sound
export function playWaterSplash() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const bp = ac.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 600;
  osc.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.start(t);
  osc.stop(t + 0.45);
}

// Prop breaking sound
export function playPropBreak(propType) {
  const ac = getCtx();
  const t = ac.currentTime;
  if (propType === 'hydrant') {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.linearRampToValueAtTime(400, t + 0.5);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.start(t);
    osc.stop(t + 0.75);
  } else {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.connect(g);
    g.connect(ac.destination);
    osc.type = 'square';
    osc.frequency.value = 120 + Math.random() * 80;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.18);
  }
}

// Swimming stroke sound
export function playSwimStroke() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const bp = ac.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 400;
  osc.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  osc.type = 'triangle';
  osc.frequency.value = 100 + Math.random() * 60;
  g.gain.setValueAtTime(0.04, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.start(t);
  osc.stop(t + 0.35);
}

export function playCrowdMurmur() {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 220 + Math.random() * 220;
  bp.Q.value = 2.5;
  osc.connect(bp);
  bp.connect(g);
  g.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.value = 75 + Math.random() * 55;
  g.gain.setValueAtTime(0.009, t);
  g.gain.linearRampToValueAtTime(0.016, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  osc.start(t);
  osc.stop(t + 1.7);
}
