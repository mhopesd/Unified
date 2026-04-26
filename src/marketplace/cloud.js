// Cloud marketplace — share missions online via a simple REST API
// Uses localStorage as fallback when no backend is configured

export const CLOUD_API_STORAGE = 'unified_cloud_api';
export const VOTER_ID_STORAGE = 'unified_voter_id';

function getApiUrl() {
  return (localStorage.getItem(CLOUD_API_STORAGE) || '').trim().replace(/\/+$/, '');
}

function getVoterId() {
  let id = localStorage.getItem(VOTER_ID_STORAGE);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    localStorage.setItem(VOTER_ID_STORAGE, id);
  }
  return id;
}

async function api(method, path, body) {
  const base = getApiUrl();
  if (!base) throw new Error('No API URL configured');
  const headers = { 'x-voter-id': getVoterId() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch {}
    throw new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`);
  }
  return res.json();
}

export class CloudMarketplace {
  constructor() {
    this.localCache = this._loadCache();
    this.syncing = false;
    this.lastError = null;
  }

  isOnline() {
    return !!getApiUrl();
  }

  _loadCache() {
    try {
      return JSON.parse(localStorage.getItem('unified_cloud_missions') || '[]');
    } catch { return []; }
  }

  _saveCache() {
    localStorage.setItem('unified_cloud_missions', JSON.stringify(this.localCache));
  }

  // Upload a mission to the cloud (also caches locally so it survives offline)
  async upload(missionData) {
    const entry = {
      ...missionData,
      uploadedAt: missionData.uploadedAt || new Date().toISOString(),
      downloads: missionData.downloads || 0,
      rating: missionData.rating || 0,
      ratingCount: missionData.ratingCount || 0,
      comments: missionData.comments || [],
    };

    // Always cache locally first so offline-created missions persist.
    if (!this.localCache.find(m => m.id === entry.id)) {
      this.localCache.push(entry);
      this._saveCache();
    }

    if (this.isOnline()) {
      try {
        this.syncing = true;
        const result = await api('POST', '/missions', missionData);
        this.syncing = false;
        return { success: true, id: result.id };
      } catch (err) {
        this.lastError = err.message;
        this.syncing = false;
        return { success: true, id: entry.id, local: true, warn: err.message };
      }
    }

    return { success: true, id: entry.id, local: true };
  }

  // Browse cloud missions (or fall back to local cache when offline)
  async browse(page = 0, limit = 20) {
    if (this.isOnline()) {
      try {
        this.syncing = true;
        const missions = await api('GET', `/missions?page=${page}&limit=${limit}`);
        this.syncing = false;
        return missions;
      } catch (err) {
        this.lastError = err.message;
        this.syncing = false;
      }
    }
    return this.localCache.slice(page * limit, (page + 1) * limit);
  }

  // Search missions
  async search(query) {
    if (this.isOnline()) {
      try {
        return await api('GET', `/missions/search?q=${encodeURIComponent(query)}`);
      } catch (err) {
        this.lastError = err.message;
      }
    }
    const q = query.toLowerCase();
    return this.localCache.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.author || '').toLowerCase().includes(q)
    );
  }

  // Rate a mission
  async rate(missionId, stars) {
    stars = Math.max(1, Math.min(5, Math.round(stars)));
    if (this.isOnline()) {
      try { await api('POST', `/missions/${encodeURIComponent(missionId)}/rate`, { stars }); }
      catch (err) { this.lastError = err.message; }
    }
    const mission = this.localCache.find(m => m.id === missionId);
    if (mission) {
      mission.ratingCount = (mission.ratingCount || 0) + 1;
      mission.rating = ((mission.rating || 0) * (mission.ratingCount - 1) + stars) / mission.ratingCount;
      this._saveCache();
    }
    return { success: true };
  }

  // Comment on a mission
  async comment(missionId, author, text) {
    const entry = { author, text, date: new Date().toISOString() };
    if (this.isOnline()) {
      try { await api('POST', `/missions/${encodeURIComponent(missionId)}/comments`, { author, text }); }
      catch (err) { this.lastError = err.message; }
    }
    const mission = this.localCache.find(m => m.id === missionId);
    if (mission) {
      if (!mission.comments) mission.comments = [];
      mission.comments.push(entry);
      this._saveCache();
    }
    return { success: true };
  }

  // Track an install (downloads + earnings counter on the server)
  async trackInstall(missionId) {
    if (!this.isOnline()) return;
    try { await api('POST', `/missions/${encodeURIComponent(missionId)}/install`); }
    catch (err) { this.lastError = err.message; }
  }

  // Quick health check — returns { ok, latencyMs, error? }
  async ping() {
    if (!this.isOnline()) return { ok: false, error: 'No URL configured' };
    const start = performance.now();
    try {
      await api('GET', '/health');
      return { ok: true, latencyMs: Math.round(performance.now() - start) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getCount() { return this.localCache.length; }
}
