// Cloud marketplace — share missions online via a simple REST API
// Uses localStorage as fallback when no backend is configured

const CLOUD_API_URL = localStorage.getItem('unified_cloud_api') || '';

export class CloudMarketplace {
  constructor() {
    this.localCache = this._loadCache();
    this.syncing = false;
    this.lastError = null;
  }

  _loadCache() {
    try {
      return JSON.parse(localStorage.getItem('unified_cloud_missions') || '[]');
    } catch { return []; }
  }

  _saveCache() {
    localStorage.setItem('unified_cloud_missions', JSON.stringify(this.localCache));
  }

  // Upload a mission to the cloud
  async upload(missionData) {
    const entry = {
      ...missionData,
      uploadedAt: new Date().toISOString(),
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      comments: [],
    };

    if (CLOUD_API_URL) {
      try {
        this.syncing = true;
        const res = await fetch(`${CLOUD_API_URL}/missions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        this.syncing = false;
        return { success: true, id: result.id };
      } catch (err) {
        this.lastError = err.message;
        this.syncing = false;
      }
    }

    // Fallback: save locally
    this.localCache.push(entry);
    this._saveCache();
    return { success: true, id: entry.id, local: true };
  }

  // Browse cloud missions
  async browse(page = 0, limit = 20) {
    if (CLOUD_API_URL) {
      try {
        this.syncing = true;
        const res = await fetch(`${CLOUD_API_URL}/missions?page=${page}&limit=${limit}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const missions = await res.json();
        this.syncing = false;
        return missions;
      } catch (err) {
        this.lastError = err.message;
        this.syncing = false;
      }
    }

    // Fallback: return local cache
    return this.localCache.slice(page * limit, (page + 1) * limit);
  }

  // Search missions
  async search(query) {
    if (CLOUD_API_URL) {
      try {
        const res = await fetch(`${CLOUD_API_URL}/missions/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        this.lastError = err.message;
      }
    }

    // Local fallback: simple text search
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

    if (CLOUD_API_URL) {
      try {
        await fetch(`${CLOUD_API_URL}/missions/${missionId}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stars }),
        });
      } catch (err) {
        this.lastError = err.message;
      }
    }

    // Local fallback
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

    if (CLOUD_API_URL) {
      try {
        await fetch(`${CLOUD_API_URL}/missions/${missionId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
      } catch (err) {
        this.lastError = err.message;
      }
    }

    // Local fallback
    const mission = this.localCache.find(m => m.id === missionId);
    if (mission) {
      if (!mission.comments) mission.comments = [];
      mission.comments.push(entry);
      this._saveCache();
    }
    return { success: true };
  }

  // Get total mission count
  getCount() {
    return this.localCache.length;
  }
}
