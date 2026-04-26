// Unified Marketplace API — Cloudflare Worker backed by D1.
//
// Endpoints (all JSON):
//   GET  /health
//   GET  /missions?page=0&limit=20&sort=rating|newest|price
//   POST /missions
//   GET  /missions/:id
//   GET  /missions/search?q=...&limit=20
//   POST /missions/:id/rate          { stars: 1-5 }
//   POST /missions/:id/comments      { author, text }
//   POST /missions/:id/install       (increments downloads + earnings)
//
// Client identifies itself via the X-Voter-Id header (random uuid stored
// in localStorage). It's not auth — just enough to dedupe ratings.

// --- Config ---
const MAX_LIMIT = 50;
const MAX_TEXT_LEN = 500;
const MAX_NAME_LEN = 60;
const MAX_AUTHOR_LEN = 60;
const MAX_DESC_LEN = 200;
const MAX_BODY_BYTES = 16 * 1024; // 16 KB cap on request bodies

// Per-(voter, action, hour) rate limits. Counters live in the rate_limits
// table; resets when the hour bucket rolls over.
const RATE_LIMITS = {
  upload:  { perHour: 5  },
  comment: { perHour: 20 },
  rate:    { perHour: 30 },
};

// --- CORS ---
// Allowed origins come from env.ALLOWED_ORIGINS (comma-separated). Default
// covers local dev + the Pages site. Use "*" to allow all (NOT recommended).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://unified-city.pages.dev',
];

function getAllowedOrigins(env) {
  const raw = (env && env.ALLOWED_ORIGINS) || '';
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeadersFor(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const allowAll = allowed.includes('*');
  const ok = allowAll || allowed.includes(origin);
  if (!ok) return null; // caller treats null as "reject"
  return {
    'access-control-allow-origin': allowAll ? '*' : origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-voter-id',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// Re-emit a response with CORS headers merged in. Pure pass-through for body.
function withCors(response, cors) {
  if (!cors) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// --- Server-side mission validation (defense in depth) ---
// The full validator lives in the client (src/missions/schema.js).
// Here we enforce only the bits that protect the database.

const OBJECTIVE_TYPES = new Set(['goto', 'collect', 'deliver', 'eliminate', 'escort', 'survive', 'interact']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const WORLD_W = 3200;
const WORLD_H = 2560;

function isStr(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}
function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateMission(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['Mission must be an object'];

  if (!isStr(m.id, 128)) errs.push('id required');
  if (!isStr(m.name, MAX_NAME_LEN)) errs.push(`name required (max ${MAX_NAME_LEN})`);
  if (!isStr(m.author, MAX_AUTHOR_LEN)) errs.push(`author required (max ${MAX_AUTHOR_LEN})`);
  if (m.description != null && !isStr(m.description, MAX_DESC_LEN)) errs.push(`description max ${MAX_DESC_LEN}`);
  if (m.difficulty != null && !DIFFICULTIES.has(m.difficulty)) errs.push('invalid difficulty');
  if (m.price != null && !isInt(m.price, 0, 5000)) errs.push('price must be 0-5000');

  if (!m.triggerZone || !isNum(m.triggerZone.x) || !isNum(m.triggerZone.y)) {
    errs.push('triggerZone.x/y required');
  } else if (m.triggerZone.x < 0 || m.triggerZone.x > WORLD_W || m.triggerZone.y < 0 || m.triggerZone.y > WORLD_H) {
    errs.push('triggerZone out of bounds');
  }

  if (!Array.isArray(m.objectives) || m.objectives.length < 1 || m.objectives.length > 6) {
    errs.push('objectives must be 1-6');
  } else {
    m.objectives.forEach((o, i) => {
      if (!OBJECTIVE_TYPES.has(o.type)) errs.push(`objective ${i + 1}: invalid type`);
      if (!isStr(o.description, 120)) errs.push(`objective ${i + 1}: description required`);
      if (!o.target || !isNum(o.target.x) || !isNum(o.target.y)) errs.push(`objective ${i + 1}: target.x/y required`);
    });
  }
  return errs;
}

// --- Routing helpers ---

function uuid() {
  return crypto.randomUUID();
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

function getVoterId(request) {
  // Accept client-supplied voter id; if missing, fall back to the IP. Both
  // are easily faked — this is throttle bookkeeping, not auth.
  const v = request.headers.get('x-voter-id');
  if (v && /^[a-zA-Z0-9_-]{8,64}$/.test(v)) return v;
  return 'ip-' + (request.headers.get('cf-connecting-ip') || 'unknown');
}

// Per-(voter, action, hour) rate limiter. Atomically increments via D1
// upsert and returns the new count. If we're over the limit, return 429.
// Hour bucket = floor(unixSec / 3600); old buckets get rolled over naturally
// because the primary key is (voter, action, bucket).
async function checkRateLimit(env, voter, action) {
  const config = RATE_LIMITS[action];
  if (!config) return null; // no limit configured
  const bucket = Math.floor(Date.now() / 3600000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (voter_id, action, window_start, count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(voter_id, action, window_start) DO UPDATE SET count = count + 1
     RETURNING count`
  ).bind(voter, action, String(bucket)).first();
  if (row && row.count > config.perHour) {
    const retryAfter = 3600 - Math.floor((Date.now() % 3600000) / 1000);
    return new Response(
      JSON.stringify({ error: `Rate limit: ${config.perHour}/hour for ${action}. Try again in ${retryAfter}s.` }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) } }
    );
  }
  return null;
}

// Reject oversized request bodies before parsing.
function bodyTooLarge(request) {
  const cl = request.headers.get('content-length');
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return err(`Request body exceeds ${MAX_BODY_BYTES} bytes`, 413);
  }
  return null;
}

// --- Handlers ---

async function listMissions(env, url) {
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const sort = url.searchParams.get('sort') || 'rating';
  const offset = page * limit;

  let orderBy;
  switch (sort) {
    case 'newest': orderBy = 'uploaded_at DESC'; break;
    case 'price':  orderBy = 'price DESC, rating DESC'; break;
    case 'downloads': orderBy = 'downloads DESC'; break;
    case 'rating':
    default: orderBy = 'rating DESC, rating_count DESC';
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, author, description, difficulty, price, data, uploaded_at,
            downloads, rating, rating_count, earnings
     FROM missions
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return json(results.map(rowToMission));
}

async function searchMissions(env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json([]);
  const limit = Math.min(MAX_LIMIT, parseInt(url.searchParams.get('limit') || '20', 10));
  const like = '%' + q.replace(/[%_]/g, '\\$&') + '%';

  const { results } = await env.DB.prepare(
    `SELECT id, name, author, description, difficulty, price, data, uploaded_at,
            downloads, rating, rating_count, earnings
     FROM missions
     WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\'
     ORDER BY rating DESC
     LIMIT ?`
  ).bind(like, like, like, limit).all();

  return json(results.map(rowToMission));
}

async function getMission(env, id) {
  const row = await env.DB.prepare(
    `SELECT id, name, author, description, difficulty, price, data, uploaded_at,
            downloads, rating, rating_count, earnings
     FROM missions WHERE id = ?`
  ).bind(id).first();
  if (!row) return err('Mission not found', 404);

  const { results: comments } = await env.DB.prepare(
    `SELECT author, text, created_at FROM comments WHERE mission_id = ? ORDER BY created_at DESC LIMIT 100`
  ).bind(id).all();

  const mission = rowToMission(row);
  mission.comments = comments.map(c => ({ author: c.author, text: c.text, date: c.created_at }));
  return json(mission);
}

async function uploadMission(env, body) {
  if (!body) return err('Invalid JSON');
  const errs = validateMission(body);
  if (errs.length) return err('Validation failed: ' + errs.join('; '));

  // De-duplicate: client-provided id wins. If a mission with this id already
  // exists, return the existing record rather than creating a duplicate.
  const existing = await env.DB.prepare('SELECT id FROM missions WHERE id = ?').bind(body.id).first();
  if (existing) {
    return json({ success: true, id: body.id, existed: true });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO missions (id, name, author, description, difficulty, price, data, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    body.id,
    body.name,
    body.author,
    body.description || '',
    body.difficulty || null,
    Number.isInteger(body.price) ? body.price : 0,
    JSON.stringify(body),
    now,
  ).run();

  return json({ success: true, id: body.id });
}

async function rateMission(env, id, body, voterId) {
  if (!body || !isInt(body.stars, 1, 5)) return err('stars must be 1-5');

  const mission = await env.DB.prepare('SELECT id FROM missions WHERE id = ?').bind(id).first();
  if (!mission) return err('Mission not found', 404);

  const now = new Date().toISOString();
  // Upsert the vote (one per voter per mission)
  await env.DB.prepare(
    `INSERT INTO ratings (mission_id, voter, stars, rated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(mission_id, voter) DO UPDATE SET stars = excluded.stars, rated_at = excluded.rated_at`
  ).bind(id, voterId, body.stars, now).run();

  // Recompute aggregate
  const agg = await env.DB.prepare(
    `SELECT AVG(stars) AS avg, COUNT(*) AS count FROM ratings WHERE mission_id = ?`
  ).bind(id).first();

  await env.DB.prepare(
    `UPDATE missions SET rating = ?, rating_count = ? WHERE id = ?`
  ).bind(agg.avg || 0, agg.count || 0, id).run();

  return json({ success: true, rating: agg.avg, ratingCount: agg.count });
}

async function commentMission(env, id, body) {
  if (!body || !isStr(body.text, MAX_TEXT_LEN)) return err(`text required (max ${MAX_TEXT_LEN})`);
  const author = isStr(body.author, MAX_AUTHOR_LEN) ? body.author : 'Anonymous';

  const mission = await env.DB.prepare('SELECT id FROM missions WHERE id = ?').bind(id).first();
  if (!mission) return err('Mission not found', 404);

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO comments (mission_id, author, text, created_at) VALUES (?, ?, ?, ?)`
  ).bind(id, author, body.text, now).run();

  return json({ success: true });
}

async function trackInstall(env, id) {
  const row = await env.DB.prepare('SELECT price FROM missions WHERE id = ?').bind(id).first();
  if (!row) return err('Mission not found', 404);
  await env.DB.prepare(
    `UPDATE missions SET downloads = downloads + 1, earnings = earnings + ? WHERE id = ?`
  ).bind(row.price || 0, id).run();
  return json({ success: true });
}

function rowToMission(row) {
  let mission;
  try { mission = JSON.parse(row.data); }
  catch { mission = {}; }
  // Overlay live aggregates so we don't ship stale numbers from the JSON blob.
  mission.id = row.id;
  mission.name = row.name;
  mission.author = row.author;
  mission.description = row.description;
  mission.difficulty = row.difficulty;
  mission.price = row.price;
  mission.uploadedAt = row.uploaded_at;
  mission.downloads = row.downloads;
  mission.rating = row.rating;
  mission.ratingCount = row.rating_count;
  mission.earnings = row.earnings;
  return mission;
}

// --- Worker entry ---

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // Body size cap for any POST
  if (method === 'POST') {
    const tooBig = bodyTooLarge(request);
    if (tooBig) return tooBig;
  }

  if (method === 'GET' && path === '/health') {
    return json({ ok: true, time: new Date().toISOString() });
  }

  if (method === 'GET' && path === '/missions') {
    return await listMissions(env, url);
  }

  if (method === 'POST' && path === '/missions') {
    const limit = await checkRateLimit(env, getVoterId(request), 'upload');
    if (limit) return limit;
    return await uploadMission(env, await readJson(request));
  }

  if (method === 'GET' && path === '/missions/search') {
    return await searchMissions(env, url);
  }

  // /missions/:id and /missions/:id/{rate,comments,install}
  const match = path.match(/^\/missions\/([^\/]+)(?:\/(rate|comments|install))?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const sub = match[2];
    const voter = getVoterId(request);
    if (!sub && method === 'GET') return await getMission(env, id);
    if (sub === 'rate' && method === 'POST') {
      const limit = await checkRateLimit(env, voter, 'rate');
      if (limit) return limit;
      return await rateMission(env, id, await readJson(request), voter);
    }
    if (sub === 'comments' && method === 'POST') {
      const limit = await checkRateLimit(env, voter, 'comment');
      if (limit) return limit;
      return await commentMission(env, id, await readJson(request));
    }
    if (sub === 'install' && method === 'POST') return await trackInstall(env, id);
  }

  return err('Not found', 404);
}

export default {
  async fetch(request, env) {
    const cors = corsHeadersFor(request, env);

    // Preflight: only succeed for allowed origins
    if (request.method === 'OPTIONS') {
      if (!cors) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    // Block disallowed origins for state-changing methods. GET requests
    // from any origin are fine (and curl/server-to-server has no Origin
    // header at all, which we allow so the worker stays scriptable).
    if (!cors && request.method === 'POST') {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    try {
      const response = await route(request, env);
      return withCors(response, cors);
    } catch (e) {
      console.error('Worker error:', e?.stack || e);
      return withCors(err('Internal error: ' + (e?.message || 'unknown'), 500), cors);
    }
  },
};
