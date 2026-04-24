// AI Terminal — in-game retro terminal for creating game assets via "AI".
// Opens with T key, player types a prompt, AI generates vehicles/weapons/NPCs/missions.

import { generateMission, generateMissionWithClaude, generateVehicle, generateWeapon, generateNPC, detectAssetType, getThinkingSteps, hasClaudeApiKey } from './generator.js';
import { validateMission } from '../missions/schema.js';

export class AITerminal {
  constructor(marketplace, missionEngine) {
    this.marketplace = marketplace;
    this.missionEngine = missionEngine;
    this.isOpen = false;
    this.isProcessing = false;
    this.lines = [];
    this.pendingAsset = null;   // { type, data }
    this.thinkingTimer = null;

    // Callbacks set by main.js to spawn assets into the game world
    this.onSpawnVehicle = null;   // (vehicleConfig) => void
    this.onEquipWeapon = null;    // (weaponConfig) => void
    this.onSpawnNPCs = null;      // (npcConfig) => void

    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'ai-terminal';
    this.overlay.style.cssText = `
      position:fixed; inset:0; z-index:30;
      background:rgba(0,0,0,0.85);
      display:none; flex-direction:column;
      align-items:center; justify-content:center;
      font-family:'Courier New',monospace;
    `;

    this.termEl = document.createElement('div');
    this.termEl.style.cssText = `
      width:min(640px,90vw); height:min(480px,80vh);
      background:#0a0a12; border:1px solid #1a3a1a;
      border-radius:6px; display:flex; flex-direction:column;
      box-shadow:0 0 40px rgba(0,255,100,0.08), inset 0 0 60px rgba(0,0,0,0.5);
      overflow:hidden;
    `;

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      padding:8px 14px; background:#0d1a0d;
      border-bottom:1px solid #1a3a1a;
      display:flex; justify-content:space-between; align-items:center;
    `;
    const titleText = document.createElement('span');
    titleText.textContent = 'UNIFIED AI — Asset Creator v0.2';
    titleText.style.cssText = 'color:#3a8a3a;font-size:11px;letter-spacing:1px;';
    titleBar.appendChild(titleText);
    const closeHint = document.createElement('span');
    closeHint.textContent = '[ESC close]';
    closeHint.style.cssText = 'color:#2a5a2a;font-size:10px;';
    titleBar.appendChild(closeHint);
    this.termEl.appendChild(titleBar);

    // Output area
    this.outputEl = document.createElement('div');
    this.outputEl.style.cssText = `
      flex:1; overflow-y:auto; padding:12px 14px;
      font-size:13px; line-height:1.6;
    `;
    this.termEl.appendChild(this.outputEl);

    // Input area
    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = `
      padding:8px 14px; border-top:1px solid #1a3a1a;
      display:flex; align-items:center; gap:8px;
      background:#080e08;
    `;
    const prompt = document.createElement('span');
    prompt.textContent = '>';
    prompt.style.cssText = 'color:#4ae04a;font-size:14px;font-weight:bold;';
    inputWrap.appendChild(prompt);

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Describe what you want to create...';
    this.inputEl.maxLength = 200;
    this.inputEl.style.cssText = `
      flex:1; background:transparent; border:none; outline:none;
      color:#4ae04a; font-family:inherit; font-size:13px;
      caret-color:#4ae04a;
    `;
    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !this.isProcessing) {
        this._handleSubmit();
      }
      if (e.key === 'Escape') {
        this.close();
      }
    });
    inputWrap.appendChild(this.inputEl);
    this.termEl.appendChild(inputWrap);

    this.overlay.appendChild(this.termEl);
    document.body.appendChild(this.overlay);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();

    if (this.lines.length === 0) {
      this._addLine('UNIFIED AI — Asset Creator', 'system');
      this._addLine('Create anything for your game world.', 'system');
      this._addLine('', 'system');
      this._addLine('VEHICLES:', 'system');
      this._addLine('  "Create a red Ferrari"', 'system');
      this._addLine('  "Give me a fast black motorcycle"', 'system');
      this._addLine('', 'system');
      this._addLine('WEAPONS:', 'system');
      this._addLine('  "Give me an M16"', 'system');
      this._addLine('  "Create a gold Desert Eagle"', 'system');
      this._addLine('', 'system');
      this._addLine('NPCS:', 'system');
      this._addLine('  "Spawn 5 hostile gang members"', 'system');
      this._addLine('  "Create a friendly bodyguard companion"', 'system');
      this._addLine('', 'system');
      this._addLine('MISSIONS:', 'system');
      this._addLine('  "Deliver a briefcase from the docks to downtown"', 'system');
      this._addLine('', 'system');
    }

    setTimeout(() => this.inputEl.focus(), 50);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.style.display = 'none';
    if (this.thinkingTimer) {
      clearTimeout(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _addLine(text, type) {
    this.lines.push({ text, type });
    const lineEl = document.createElement('div');

    const colors = {
      system: '#2a6a2a',
      user: '#4ae04a',
      ai: '#6ac06a',
      step: '#3a7a3a',
      error: '#cc4444',
      success: '#4ae04a',
      mission: '#aaddaa',
      vehicle: '#44aaff',
      weapon: '#ffaa44',
      npc: '#ff66aa',
    };

    lineEl.style.cssText = `color:${colors[type] || '#4ae04a'};margin-bottom:2px;white-space:pre-wrap;word-break:break-word;`;

    if (type === 'user') {
      lineEl.textContent = '> ' + text;
    } else if (type === 'step') {
      lineEl.textContent = '  [*] ' + text;
    } else if (type === 'mission' || type === 'vehicle' || type === 'weapon' || type === 'npc') {
      lineEl.style.cssText += 'padding:4px 8px;background:rgba(0,255,100,0.05);border-left:2px solid #2a6a2a;margin:4px 0;font-size:12px;';
      lineEl.textContent = text;
    } else {
      lineEl.textContent = text;
    }

    this.outputEl.appendChild(lineEl);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  async _handleSubmit() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';

    // Install/confirm commands
    if (/^(install|yes|y|equip|spawn|confirm)$/i.test(text)) {
      if (this.pendingAsset) {
        this._installAsset();
        return;
      }
    }

    this.pendingAsset = null;
    this._addLine(text, 'user');
    this._addLine('', 'system');

    this.isProcessing = true;
    this.inputEl.disabled = true;
    this.inputEl.placeholder = 'Processing...';

    // Detect asset type
    const assetType = detectAssetType(text);

    try {
      if (assetType === 'mission' && hasClaudeApiKey()) {
        await this._handleMissionWithClaude(text);
      } else {
        // Show canned AI thinking steps for non-Claude paths
        const steps = getThinkingSteps(text, assetType);
        await this._showSteps(steps);

        switch (assetType) {
          case 'vehicle':
            this._handleVehicleResult(text);
            break;
          case 'weapon':
            this._handleWeaponResult(text);
            break;
          case 'npc':
            this._handleNPCResult(text);
            break;
          default:
            this._handleMissionResult(text);
            break;
        }
      }
    } catch (e) {
      this._addLine('Error: ' + e.message, 'error');
    }

    this.isProcessing = false;
    this.inputEl.disabled = false;
    this.inputEl.placeholder = 'Describe what you want to create...';
    this.inputEl.focus();
  }

  _handleVehicleResult(prompt) {
    const vehicle = generateVehicle(prompt);
    this._addLine('Vehicle generated!', 'success');
    this._addLine('', 'system');
    this._addLine(`Name:    ${vehicle.name}`, 'vehicle');
    this._addLine(`Speed:   ${vehicle.speed} (max ${Math.round(vehicle.speed * 0.3)} MPH)`, 'vehicle');
    this._addLine(`Accel:   ${vehicle.accel}`, 'vehicle');
    this._addLine(`Handling: ${vehicle.turnSpeed.toFixed(1)}`, 'vehicle');
    this._addLine(`Color:   ${vehicle.color}`, 'vehicle');
    this._addLine(`Size:    ${vehicle.w}x${vehicle.h}`, 'vehicle');
    this._addLine('', 'system');
    this._addLine('Type "spawn" to place this vehicle near you.', 'ai');
    this.pendingAsset = { type: 'vehicle', data: vehicle };
  }

  _handleWeaponResult(prompt) {
    const weapon = generateWeapon(prompt);
    this._addLine('Weapon generated!', 'success');
    this._addLine('', 'system');
    this._addLine(`Name:      ${weapon.name}`, 'weapon');
    this._addLine(`Damage:    ${weapon.damage}`, 'weapon');
    this._addLine(`Fire Rate: ${weapon.fireRate} rds/sec`, 'weapon');
    this._addLine(`Range:     ${weapon.range} tiles`, 'weapon');
    this._addLine(`Ammo:      ${weapon.ammo}`, 'weapon');
    this._addLine(`Spread:    ${weapon.spread.toFixed(3)}`, 'weapon');
    this._addLine('', 'system');
    this._addLine('Type "equip" to arm yourself with this weapon.', 'ai');
    this.pendingAsset = { type: 'weapon', data: weapon };
  }

  _handleNPCResult(prompt) {
    const npc = generateNPC(prompt);
    this._addLine('NPC configured!', 'success');
    this._addLine('', 'system');
    this._addLine(`Type:     ${npc.name}`, 'npc');
    this._addLine(`Behavior: ${npc.behavior}`, 'npc');
    this._addLine(`Count:    ${npc.count}`, 'npc');
    if (npc.color) this._addLine(`Color:    ${npc.color}`, 'npc');
    this._addLine('', 'system');
    this._addLine('Type "spawn" to place them near you.', 'ai');
    this.pendingAsset = { type: 'npc', data: npc };
  }

  _handleMissionResult(prompt) {
    const mission = generateMission(prompt);
    this._renderMissionResult(mission);
  }

  async _handleMissionWithClaude(prompt) {
    this._addLine('[Claude API key detected — using real AI]', 'step');
    try {
      const mission = await generateMissionWithClaude(prompt, {
        onStep: (msg) => this._addLine(msg, 'step'),
      });
      this._addLine('', 'system');
      this._renderMissionResult(mission);
    } catch (e) {
      this._addLine('Claude error: ' + e.message, 'error');
      this._addLine('Falling back to keyword generator...', 'step');
      this._handleMissionResult(prompt);
    }
  }

  _renderMissionResult(mission) {
    const { valid, errors, warnings } = validateMission(mission);

    if (!valid) {
      this._addLine('Generation failed — invalid mission:', 'error');
      for (const err of errors) this._addLine('  ' + err, 'error');
      return;
    }

    this._addLine('Mission generated!', 'success');
    this._addLine('', 'system');
    this._addLine(`Name:       ${mission.name}`, 'mission');
    if (mission.description) this._addLine(`Summary:    ${mission.description}`, 'mission');
    this._addLine(`Difficulty: ${mission.difficulty || 'medium'}`, 'mission');
    this._addLine(`Objectives: ${mission.objectives.length}`, 'mission');
    for (let i = 0; i < mission.objectives.length; i++) {
      this._addLine(`  ${i + 1}. [${mission.objectives[i].type}] ${mission.objectives[i].description}`, 'mission');
    }
    if (mission.reward) {
      const cash = mission.reward.cash ?? 0;
      const xp = mission.reward.xp ?? mission.objectives.length * 200;
      this._addLine(`Reward:     $${cash} + ${xp} XP`, 'mission');
    }
    if (mission.spawn_entities) {
      this._addLine(`Entities:   ${mission.spawn_entities.length} spawned`, 'mission');
    }
    if (warnings && warnings.length > 0) {
      for (const w of warnings) this._addLine('  Warning: ' + w, 'step');
    }
    this._addLine('', 'system');
    this._addLine('Type "install" to add this mission to your game.', 'ai');
    this.pendingAsset = { type: 'mission', data: mission };
  }

  _installAsset() {
    const { type, data } = this.pendingAsset;

    switch (type) {
      case 'vehicle':
        if (this.onSpawnVehicle) {
          this.onSpawnVehicle(data);
          this._addLine(`${data.name} spawned nearby! Exit the terminal and find it.`, 'success');
          this._addLine('Press F near it to drive.', 'ai');
        } else {
          this._addLine('Vehicle spawning not available.', 'error');
        }
        break;

      case 'weapon':
        if (this.onEquipWeapon) {
          this.onEquipWeapon(data);
          this._addLine(`${data.name} equipped! Left-click to fire.`, 'success');
          this._addLine(`Ammo: ${data.ammo} rounds loaded.`, 'ai');
        } else {
          this._addLine('Weapon equipping not available.', 'error');
        }
        break;

      case 'npc':
        if (this.onSpawnNPCs) {
          this.onSpawnNPCs(data);
          this._addLine(`${data.count}x ${data.name} spawned nearby!`, 'success');
          this._addLine(`Behavior: ${data.behavior}`, 'ai');
        } else {
          this._addLine('NPC spawning not available.', 'error');
        }
        break;

      case 'mission': {
        const success = this.marketplace.addToCatalog(data);
        if (success) {
          this.marketplace.install(data.id);
          this._addLine('Mission installed! Look for the marker on your HUD.', 'success');
          this._addLine('Close this terminal (ESC) and explore the city.', 'ai');
        } else {
          this._addLine('Failed to install — mission may be invalid.', 'error');
        }
        break;
      }
    }

    this._addLine('', 'system');
    this.pendingAsset = null;
  }

  _showSteps(steps) {
    return new Promise(resolve => {
      let i = 0;
      const tick = () => {
        if (i < steps.length) {
          this._addLine(steps[i], 'step');
          i++;
          this.thinkingTimer = setTimeout(tick, 250 + Math.random() * 350);
        } else {
          this._addLine('', 'system');
          resolve();
        }
      };
      tick();
    });
  }
}
