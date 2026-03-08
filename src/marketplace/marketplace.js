// Marketplace — UI for browsing and installing community missions

import { validateMission } from '../missions/schema.js';

export class Marketplace {
  constructor(missionEngine) {
    this.missionEngine = missionEngine;
    this.panel = document.getElementById('marketplace-panel');
    this.listEl = document.getElementById('mp-list');
    this.isOpen = false;

    // Catalog: missions available in the marketplace (not yet installed)
    this.catalog = [];
    // Installed mission IDs
    this.installedIds = new Set();
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    if (this.isOpen) this.render();
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
    this.catalog.push(missionData);
    return true;
  }

  // Install a mission from catalog into the game world
  install(missionId) {
    const mission = this.catalog.find(m => m.id === missionId);
    if (!mission) return;
    if (this.installedIds.has(missionId)) return;

    this.missionEngine.loadMission(mission);
    this.installedIds.add(missionId);
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

  render() {
    // Clear existing children safely
    while (this.listEl.firstChild) {
      this.listEl.removeChild(this.listEl.firstChild);
    }

    if (this.catalog.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:#666;';
      empty.textContent = 'No missions in marketplace yet.';
      this.listEl.appendChild(empty);
      return;
    }

    for (const m of this.catalog) {
      const installed = this.installedIds.has(m.id);
      const div = document.createElement('div');
      div.className = 'mp-mission';

      const title = document.createElement('h3');
      title.textContent = m.name;
      div.appendChild(title);

      const meta = document.createElement('p');
      meta.textContent = `by ${m.author} \u00B7 ${m.objectives.length} objectives`;
      div.appendChild(meta);

      if (m.description) {
        const desc = document.createElement('p');
        desc.textContent = m.description;
        div.appendChild(desc);
      }

      const btn = document.createElement('button');
      if (installed) {
        btn.textContent = 'Installed';
        btn.disabled = true;
        btn.style.cssText = 'background:#555;color:#aaa;';
      } else {
        btn.textContent = 'Install';
        btn.addEventListener('click', () => {
          this.install(m.id);
        });
      }
      div.appendChild(btn);

      this.listEl.appendChild(div);
    }
  }
}
