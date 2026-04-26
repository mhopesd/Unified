// Marketplace — UI for browsing, installing, rating, and commenting on missions

import { validateMission } from '../missions/schema.js';
import { CloudMarketplace } from './cloud.js';

export class Marketplace {
  constructor(missionEngine) {
    this.missionEngine = missionEngine;
    this.panel = document.getElementById('marketplace-panel');
    this.listEl = document.getElementById('mp-list');
    this.isOpen = false;

    // Catalog: missions available in the marketplace (not yet installed)
    this.catalog = [];
    // Installed mission IDs — persisted so the "Installed" badge survives reloads
    this.installedIds = new Set(this._loadPersisted('unified_mp_installed', []));
    // Cloud backend
    this.cloud = new CloudMarketplace();
    // Search
    this.searchQuery = '';
    // User ratings (prevent double-rating) — persisted
    this.userRatings = this._loadPersisted('unified_mp_ratings', {});
    // Hydration state
    this.hydrated = false;
    this.hydrating = false;

    // Wallet hooks — set by main.js via setWallet(). Let installs charge the player.
    this._getMoney = () => Infinity;
    this._spendMoney = () => true;
    this._notify = () => {};

    // Kick off hydration immediately so the catalog is ready before first open
    this._hydrate();
  }

  setWallet({ getMoney, spendMoney, notify }) {
    if (typeof getMoney === 'function') this._getMoney = getMoney;
    if (typeof spendMoney === 'function') this._spendMoney = spendMoney;
    if (typeof notify === 'function') this._notify = notify;
  }

  _loadPersisted(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(fallback) ? parsed : parsed;
    } catch {
      return fallback;
    }
  }

  _savePersisted() {
    try {
      localStorage.setItem('unified_mp_installed', JSON.stringify([...this.installedIds]));
      localStorage.setItem('unified_mp_ratings', JSON.stringify(this.userRatings));
    } catch {}
  }

  // Pull cached/cloud missions into the catalog, merging by id so duplicates don't stack up.
  async _hydrate() {
    if (this.hydrating || this.hydrated) return;
    this.hydrating = true;
    try {
      const cloudMissions = await this.cloud.browse(0, 100);
      const byId = new Map(this.catalog.map(m => [m.id, m]));
      for (const m of cloudMissions) {
        if (!m || !m.id) continue;
        const { valid } = validateMission(m);
        if (!valid) continue;
        if (byId.has(m.id)) continue;
        this.catalog.push(m);
        byId.set(m.id, m);
      }
      this.hydrated = true;
    } catch (e) {
      console.warn('Marketplace hydration failed:', e);
    } finally {
      this.hydrating = false;
      if (this.isOpen) this.render();
    }
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      // Re-hydrate if we haven't yet (handles first-open before constructor promise resolved)
      if (!this.hydrated && !this.hydrating) this._hydrate();
      this.render();
    }
  }

  close() {
    this.isOpen = false;
    this.panel.classList.remove('open');
  }

  // Add a mission to the marketplace catalog
  addToCatalog(missionData) {
    const { valid, errors } = validateMission(missionData);
    if (!valid) {
      console.warn('Invalid mission rejected:', errors);
      return false;
    }
    // Initialize rating fields
    if (missionData.rating === undefined) missionData.rating = 0;
    if (missionData.ratingCount === undefined) missionData.ratingCount = 0;
    if (!missionData.comments) missionData.comments = [];
    this.catalog.push(missionData);
    // Also upload to cloud
    this.cloud.upload(missionData);
    return true;
  }

  // Install a mission from catalog into the game world.
  // Returns { success, reason } — reason is a user-facing string on failure.
  install(missionId) {
    const mission = this.catalog.find(m => m.id === missionId);
    if (!mission) return { success: false, reason: 'Mission not found' };
    if (this.installedIds.has(missionId)) return { success: false, reason: 'Already installed' };

    const price = Number.isInteger(mission.price) ? mission.price : 0;
    if (price > 0) {
      const balance = this._getMoney();
      if (balance < price) {
        this._notify(`Need $${price} — you have $${balance}`);
        this.render();
        return { success: false, reason: 'insufficient_funds' };
      }
      const spent = this._spendMoney(price);
      if (!spent) {
        this._notify('Payment failed');
        return { success: false, reason: 'payment_failed' };
      }
      mission.earnings = (mission.earnings || 0) + price;
      this._notify(`Purchased "${mission.name}" — $${price}`);
    }

    this.missionEngine.loadMission(mission);
    this.installedIds.add(missionId);
    this._savePersisted();
    this.render();
    return { success: true };
  }

  // Rate a mission
  rateMission(missionId, stars) {
    if (this.userRatings[missionId]) return;
    this.userRatings[missionId] = stars;
    const mission = this.catalog.find(m => m.id === missionId);
    if (mission) {
      mission.ratingCount = (mission.ratingCount || 0) + 1;
      mission.rating = ((mission.rating || 0) * (mission.ratingCount - 1) + stars) / mission.ratingCount;
    }
    this.cloud.rate(missionId, stars);
    this._savePersisted();
    this.render();
  }

  // Comment on a mission
  addComment(missionId, author, text) {
    const mission = this.catalog.find(m => m.id === missionId);
    if (mission) {
      if (!mission.comments) mission.comments = [];
      mission.comments.push({ author, text, date: new Date().toISOString() });
    }
    this.cloud.comment(missionId, author, text);
    this.render();
  }

  // Submit a new creator mission (from JSON)
  submitMission(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const { valid, errors } = validateMission(data);
      if (!valid) return { success: false, errors };

      this.addToCatalog(data);
      return { success: true };
    } catch (e) {
      return { success: false, errors: ['Invalid JSON: ' + e.message] };
    }
  }

  _renderStars(rating, missionId) {
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:4px;';
    const rated = this.userRatings[missionId];
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.textContent = i <= Math.round(rating) ? '\u2605' : '\u2606';
      star.style.cssText = `cursor:pointer;font-size:16px;color:${i <= Math.round(rating) ? '#ffd700' : '#555'};margin-right:1px;`;
      if (!rated) {
        star.addEventListener('click', (e) => {
          e.stopPropagation();
          this.rateMission(missionId, i);
        });
      }
      div.appendChild(star);
    }
    const countSpan = document.createElement('span');
    countSpan.style.cssText = 'font-size:10px;color:#666;margin-left:6px;';
    const m = this.catalog.find(c => c.id === missionId);
    countSpan.textContent = `(${m?.ratingCount || 0})`;
    div.appendChild(countSpan);
    return div;
  }

  render() {
    while (this.listEl.firstChild) {
      this.listEl.removeChild(this.listEl.firstChild);
    }

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:8px 16px;border-bottom:1px solid #333;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search missions...';
    searchInput.value = this.searchQuery;
    searchInput.style.cssText = 'width:100%;padding:6px 8px;background:#222;border:1px solid #444;color:#eee;border-radius:4px;font-size:12px;box-sizing:border-box;';
    searchInput.addEventListener('keydown', (e) => e.stopPropagation());
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.render();
    });
    searchWrap.appendChild(searchInput);

    // Catalog stats + hydration state
    const stats = document.createElement('div');
    stats.style.cssText = 'margin-top:6px;font-size:10px;color:#888;display:flex;justify-content:space-between;';
    const total = this.catalog.length;
    const installed = this.installedIds.size;
    const leftSpan = document.createElement('span');
    leftSpan.textContent = `${total} mission${total === 1 ? '' : 's'} · ${installed} installed`;
    stats.appendChild(leftSpan);
    const rightSpan = document.createElement('span');
    rightSpan.textContent = this.hydrating ? 'Syncing…' : (this.hydrated ? 'Up to date' : '');
    rightSpan.style.color = this.hydrating ? '#ffd700' : '#4a8';
    stats.appendChild(rightSpan);
    searchWrap.appendChild(stats);

    this.listEl.appendChild(searchWrap);

    // Filter catalog
    let filtered = this.catalog;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = this.catalog.filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q) ||
        (m.author || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:#666;';
      empty.textContent = this.searchQuery ? 'No missions match your search.' : 'No missions in marketplace yet.';
      this.listEl.appendChild(empty);
      return;
    }

    // Sort by rating (highest first)
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    for (const m of filtered) {
      const installed = this.installedIds.has(m.id);
      const price = Number.isInteger(m.price) ? m.price : 0;
      const div = document.createElement('div');
      div.className = 'mp-mission';

      // Title row — name on left, price pill on right
      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;';
      const title = document.createElement('h3');
      title.textContent = m.name;
      title.style.cssText = 'margin:0;flex:1;min-width:0;';
      titleRow.appendChild(title);

      const priceTag = document.createElement('span');
      if (price > 0) {
        priceTag.textContent = `$${price}`;
        priceTag.style.cssText = 'background:#3a2a0a;color:#ffd700;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;flex-shrink:0;';
      } else {
        priceTag.textContent = 'FREE';
        priceTag.style.cssText = 'background:#1a3a1a;color:#6adf6a;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;flex-shrink:0;';
      }
      titleRow.appendChild(priceTag);
      div.appendChild(titleRow);

      const meta = document.createElement('p');
      const diffBadge = m.difficulty ? ` \u00B7 ${m.difficulty}` : '';
      meta.textContent = `by ${m.author || 'Unknown'} \u00B7 ${(m.objectives || []).length} obj${diffBadge}`;
      div.appendChild(meta);

      if (m.description) {
        const desc = document.createElement('p');
        desc.textContent = m.description;
        div.appendChild(desc);
      }

      // Star rating
      div.appendChild(this._renderStars(m.rating || 0, m.id));

      // Action buttons row
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

      const btn = document.createElement('button');
      if (installed) {
        btn.textContent = price > 0 ? 'Purchased' : 'Installed';
        btn.disabled = true;
        btn.style.cssText = 'background:#555;color:#aaa;padding:4px 12px;border:none;border-radius:4px;font-size:12px;';
      } else {
        const canAfford = price === 0 || this._getMoney() >= price;
        btn.textContent = price > 0 ? `Buy — $${price}` : 'Install';
        if (!canAfford) {
          btn.disabled = true;
          btn.style.cssText = 'background:#444;color:#777;padding:4px 12px;border:none;border-radius:4px;font-size:12px;cursor:not-allowed;';
          btn.title = `Need $${price}`;
        } else {
          btn.style.cssText = 'padding:4px 12px;background:#ffd700;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;';
          btn.addEventListener('click', () => {
            this.install(m.id);
          });
        }
      }
      btnRow.appendChild(btn);

      // Comment button
      const commentBtn = document.createElement('button');
      commentBtn.textContent = `\uD83D\uDCAC ${(m.comments || []).length}`;
      commentBtn.style.cssText = 'padding:4px 8px;background:#333;color:#aaa;border:none;border-radius:4px;cursor:pointer;font-size:11px;';
      commentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showComments(m);
      });
      btnRow.appendChild(commentBtn);

      div.appendChild(btnRow);
      this.listEl.appendChild(div);
    }
  }

  _showComments(mission) {
    // Create a comment overlay within the panel
    while (this.listEl.firstChild) {
      this.listEl.removeChild(this.listEl.firstChild);
    }

    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '\u2190 Back';
    backBtn.style.cssText = 'padding:6px 12px;background:#333;color:#eee;border:none;border-radius:4px;cursor:pointer;margin:12px 16px;font-size:12px;';
    backBtn.addEventListener('click', () => this.render());
    this.listEl.appendChild(backBtn);

    const title = document.createElement('h3');
    title.textContent = mission.name + ' — Comments';
    title.style.cssText = 'padding:0 16px;color:#ffd700;font-size:14px;';
    this.listEl.appendChild(title);

    // Existing comments
    const comments = mission.comments || [];
    if (comments.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'padding:8px 16px;color:#666;font-size:12px;';
      empty.textContent = 'No comments yet.';
      this.listEl.appendChild(empty);
    } else {
      for (const c of comments) {
        const cDiv = document.createElement('div');
        cDiv.style.cssText = 'padding:8px 16px;border-bottom:1px solid #222;';
        const cAuthor = document.createElement('span');
        cAuthor.textContent = c.author || 'Anonymous';
        cAuthor.style.cssText = 'color:#4fc3f7;font-size:11px;font-weight:bold;';
        cDiv.appendChild(cAuthor);
        const cText = document.createElement('p');
        cText.textContent = c.text;
        cText.style.cssText = 'color:#ccc;font-size:12px;margin:4px 0 0;';
        cDiv.appendChild(cText);
        this.listEl.appendChild(cDiv);
      }
    }

    // Add comment form
    const form = document.createElement('div');
    form.style.cssText = 'padding:12px 16px;border-top:1px solid #333;';

    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Your name';
    nameInput.style.cssText = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:11px;margin-bottom:6px;box-sizing:border-box;';
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    form.appendChild(nameInput);

    const textInput = document.createElement('textarea');
    textInput.placeholder = 'Write a comment...';
    textInput.rows = 3;
    textInput.style.cssText = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:11px;resize:none;box-sizing:border-box;';
    textInput.addEventListener('keydown', (e) => e.stopPropagation());
    form.appendChild(textInput);

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Post Comment';
    submitBtn.style.cssText = 'margin-top:6px;padding:6px 12px;background:#ffd700;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;width:100%;';
    submitBtn.addEventListener('click', () => {
      const text = textInput.value.trim();
      if (!text) return;
      this.addComment(mission.id, nameInput.value.trim() || 'Anonymous', text);
      this._showComments(mission);
    });
    form.appendChild(submitBtn);

    this.listEl.appendChild(form);
  }
}
