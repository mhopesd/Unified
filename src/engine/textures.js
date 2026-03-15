// Pre-rendered procedural textures for hyper-realistic rendering
// Each texture is baked to an offscreen canvas once, then tiled

// Seeded random for deterministic textures
function seededRand(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Generate Perlin-like value noise on a canvas
function valueNoise(width, height, scale, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const rand = seededRand(seed);

  // Generate grid of random values
  const gridW = Math.ceil(width / scale) + 2;
  const gridH = Math.ceil(height / scale) + 2;
  const grid = [];
  for (let i = 0; i < gridW * gridH; i++) grid[i] = rand();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;

      // Smoothstep
      const u = fx * fx * (3 - 2 * fx);
      const v = fy * fy * (3 - 2 * fy);

      const a = grid[iy * gridW + ix] || 0;
      const b = grid[iy * gridW + ix + 1] || 0;
      const c = grid[(iy + 1) * gridW + ix] || 0;
      const d = grid[(iy + 1) * gridW + ix + 1] || 0;

      const val = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      const idx = (y * width + x) * 4;
      const byte = Math.floor(val * 255);
      img.data[idx] = byte;
      img.data[idx + 1] = byte;
      img.data[idx + 2] = byte;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Create asphalt texture — dark gray with fine grain and occasional aggregate
export function createAsphaltTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base dark gray
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(0, 0, size, size);

  // Layer 1: coarse noise (aggregate variation)
  const coarse = valueNoise(size, size, 8, 42);
  ctx.globalAlpha = 0.12;
  ctx.drawImage(coarse, 0, 0);

  // Layer 2: fine grain
  const fine = valueNoise(size, size, 2, 137);
  ctx.globalAlpha = 0.08;
  ctx.drawImage(fine, 0, 0);

  // Layer 3: individual aggregate specks
  ctx.globalAlpha = 1;
  const rand = seededRand(999);
  for (let i = 0; i < size * 3; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const brightness = 25 + rand() * 35;
    const a = 0.15 + rand() * 0.15;
    ctx.fillStyle = `rgba(${brightness},${brightness},${brightness + 5},${a})`;
    ctx.fillRect(x, y, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }

  // Layer 4: very subtle warm/cool variation patches
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 6; i++) {
    const px = rand() * size;
    const py = rand() * size;
    const pr = 10 + rand() * 20;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    const warm = rand() > 0.5;
    grad.addColorStop(0, warm ? 'rgba(60,45,35,1)' : 'rgba(35,40,55,1)');
    grad.addColorStop(1, 'rgba(44,44,44,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  ctx.globalAlpha = 1;
  return canvas;
}

// Create concrete/sidewalk texture
export function createConcreteTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base warm gray
  ctx.fillStyle = '#a8a098';
  ctx.fillRect(0, 0, size, size);

  // Noise layers
  const coarse = valueNoise(size, size, 10, 77);
  ctx.globalAlpha = 0.08;
  ctx.drawImage(coarse, 0, 0);

  const fine = valueNoise(size, size, 3, 211);
  ctx.globalAlpha = 0.06;
  ctx.drawImage(fine, 0, 0);

  // Subtle surface imperfections
  ctx.globalAlpha = 1;
  const rand = seededRand(555);
  for (let i = 0; i < size; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillStyle = `rgba(${80 + rand() * 40},${75 + rand() * 40},${70 + rand() * 35},${0.08 + rand() * 0.06})`;
    ctx.fillRect(x, y, 1, 1);
  }

  return canvas;
}

// Create grass texture
export function createGrassTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base green
  ctx.fillStyle = '#3a6b25';
  ctx.fillRect(0, 0, size, size);

  // Color variation
  const noise = valueNoise(size, size, 12, 303);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.15;
  ctx.drawImage(noise, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Individual grass blades
  const rand = seededRand(777);
  for (let i = 0; i < size * 6; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const h = 2 + rand() * 5;
    const lean = (rand() - 0.5) * 3;
    const g = 70 + rand() * 80;
    const r = 30 + rand() * 40;
    ctx.strokeStyle = `rgba(${r},${g},${15 + rand() * 25},${0.3 + rand() * 0.4})`;
    ctx.lineWidth = 0.5 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
  }

  // Occasional dark patches (soil showing through)
  for (let i = 0; i < 4; i++) {
    const px = rand() * size;
    const py = rand() * size;
    ctx.fillStyle = `rgba(40,30,20,${0.05 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(px, py, 3 + rand() * 6, 2 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// Create dirt/soil texture
export function createDirtTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6b5340';
  ctx.fillRect(0, 0, size, size);

  const noise = valueNoise(size, size, 6, 888);
  ctx.globalAlpha = 0.15;
  ctx.drawImage(noise, 0, 0);
  ctx.globalAlpha = 1;

  const rand = seededRand(444);
  // Small stones and pebbles
  for (let i = 0; i < size * 2; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.5 + rand() * 2;
    const b = 80 + rand() * 60;
    ctx.fillStyle = `rgba(${b},${b - 10},${b - 20},${0.2 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// Create water texture
export function createWaterTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a3550';
  ctx.fillRect(0, 0, size, size);

  const noise = valueNoise(size, size, 10, 601);
  ctx.globalAlpha = 0.12;
  ctx.drawImage(noise, 0, 0);

  const fine = valueNoise(size, size, 4, 602);
  ctx.globalAlpha = 0.06;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(fine, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Caustic-like highlights
  const rand = seededRand(603);
  for (let i = 0; i < size * 2; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillStyle = `rgba(80,140,180,${0.03 + rand() * 0.05})`;
    ctx.fillRect(x, y, 2 + rand() * 4, 0.5 + rand());
  }

  return canvas;
}

// Create parking lot texture
export function createParkingTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#363636';
  ctx.fillRect(0, 0, size, size);

  const noise = valueNoise(size, size, 6, 500);
  ctx.globalAlpha = 0.1;
  ctx.drawImage(noise, 0, 0);
  ctx.globalAlpha = 1;

  // Oil stains
  const rand = seededRand(501);
  for (let i = 0; i < 3; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 4 + rand() * 6);
    grad.addColorStop(0, `rgba(20,18,15,${0.15 + rand() * 0.1})`);
    grad.addColorStop(1, 'rgba(20,18,15,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 10, y - 10, 20, 20);
  }

  return canvas;
}

// Create building roof texture (top-down)
export function createBuildingTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, size, size);

  const noise = valueNoise(size, size, 8, 700);
  ctx.globalAlpha = 0.08;
  ctx.drawImage(noise, 0, 0);
  ctx.globalAlpha = 1;

  return canvas;
}

// Create park texture (lush grass with flowers)
export function createParkTexture(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Richer green base
  ctx.fillStyle = '#2d7a1e';
  ctx.fillRect(0, 0, size, size);

  const noise = valueNoise(size, size, 14, 350);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.12;
  ctx.drawImage(noise, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // Dense grass blades
  const rand = seededRand(351);
  for (let i = 0; i < size * 8; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const h = 2 + rand() * 6;
    const lean = (rand() - 0.5) * 2.5;
    const g = 80 + rand() * 90;
    const r = 20 + rand() * 35;
    ctx.strokeStyle = `rgba(${r},${g},${10 + rand() * 20},${0.25 + rand() * 0.35})`;
    ctx.lineWidth = 0.4 + rand() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
  }

  // Wildflowers
  for (let i = 0; i < 12; i++) {
    const fx = rand() * size;
    const fy = rand() * size;
    const colors = ['#e8e855', '#d45d79', '#fff', '#cc66ff', '#ff8844'];
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = 0.6 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(fx, fy, 1 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return canvas;
}
