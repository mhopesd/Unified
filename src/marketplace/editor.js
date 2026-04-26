// Mission Editor — enhanced form-based UI for creators to build missions
// Includes district guide, reward editor, coordinate helper, and live preview

import { validateMission, OBJECTIVE_TYPES, DIFFICULTY_LEVELS } from '../missions/schema.js';

// District data for the coordinate helper
const DISTRICTS = [
  { name: 'Old Town', x1: 0, y1: 0, x2: 480, y2: 480, desc: 'Historic buildings, markets' },
  { name: 'Uptown', x1: 480, y1: 0, x2: 960, y2: 480, desc: 'Wealthy residential' },
  { name: 'The Hills', x1: 960, y1: 0, x2: 1280, y2: 480, desc: 'Winding roads, overlooks' },
  { name: 'Midtown', x1: 0, y1: 480, x2: 480, y2: 960, desc: 'Shops, nightlife' },
  { name: 'Downtown', x1: 480, y1: 480, x2: 800, y2: 800, desc: 'High-rises, banks' },
  { name: 'Industrial', x1: 960, y1: 800, x2: 1280, y2: 1280, desc: 'Factories, scrapyards' },
  { name: 'The Docks', x1: 0, y1: 960, x2: 480, y2: 1280, desc: 'Warehouses, shipping' },
];

const INPUT_STYLE = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:12px;box-sizing:border-box;';
const LABEL_STYLE = 'display:block;font-size:11px;color:#888;margin-bottom:2px;';
const SMALL_INPUT_STYLE = 'width:100%;padding:3px 4px;background:#111;border:1px solid #333;color:#eee;border-radius:2px;font-size:11px;box-sizing:border-box;';

export class MissionEditor {
  constructor(marketplace) {
    this.marketplace = marketplace;
    this.container = null;
    this.objectives = [{ type: 'goto', description: '', x: 0, y: 0, radius: 40 }];
    this.rewardCash = 500;
    this.rewardXp = 100;
    this.price = 0; // Sale price on the marketplace; 0 = free
  }

  mount(parent) {
    this.container = document.createElement('div');
    this.container.style.cssText = 'padding:12px;border-top:2px solid #444;';
    this.buildForm();
    parent.appendChild(this.container);
  }

  buildForm() {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const title = document.createElement('h3');
    title.textContent = 'Create Mission';
    title.style.cssText = 'color:#ffd700;margin-bottom:10px;font-size:14px;';
    this.container.appendChild(title);

    // Mission fields
    this.nameInput = this.addField('Mission Name', 'text', 'My Epic Quest');
    this.authorInput = this.addField('Author', 'text', 'YourName');
    this.descInput = this.addField('Description', 'text', 'Describe the mission...');

    // Difficulty selector
    const diffWrap = document.createElement('div');
    diffWrap.style.cssText = 'margin-bottom:6px;';
    const diffLabel = document.createElement('label');
    diffLabel.textContent = 'Difficulty';
    diffLabel.style.cssText = LABEL_STYLE;
    diffWrap.appendChild(diffLabel);
    this.difficultySelect = document.createElement('select');
    this.difficultySelect.style.cssText = INPUT_STYLE;
    DIFFICULTY_LEVELS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      this.difficultySelect.appendChild(opt);
    });
    diffWrap.appendChild(this.difficultySelect);
    this.container.appendChild(diffWrap);

    // --- District quick-select for trigger ---
    this._addDistrictPicker();

    this.trigXInput = this.addField('Trigger X', 'number', '500');
    this.trigYInput = this.addField('Trigger Y', 'number', '500');
    this.trigRadInput = this.addField('Trigger Radius', 'number', '50');

    // "Use my position" button
    const posBtn = document.createElement('button');
    posBtn.textContent = 'Use My Position';
    posBtn.style.cssText = 'margin-bottom:8px;padding:4px 10px;background:#2a5a3a;color:#6f6;border:none;border-radius:3px;cursor:pointer;font-size:11px;width:100%;';
    posBtn.addEventListener('click', () => {
      if (this._getPlayerPos) {
        const pos = this._getPlayerPos();
        this.trigXInput.value = Math.round(pos.x);
        this.trigYInput.value = Math.round(pos.y);
      }
    });
    this.container.appendChild(posBtn);

    // --- Rewards section ---
    this._addRewardEditor();

    // Objectives section
    const objHeader = document.createElement('div');
    objHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px;';

    const objLabel = document.createElement('span');
    objLabel.textContent = 'Objectives';
    objLabel.style.cssText = 'color:#aaa;font-size:12px;';
    objHeader.appendChild(objLabel);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.style.cssText = 'padding:2px 8px;background:#555;color:#eee;border:none;border-radius:3px;cursor:pointer;font-size:11px;';
    addBtn.addEventListener('click', () => {
      if (this.objectives.length < 6) {
        this.objectives.push({ type: 'goto', description: '', x: 0, y: 0, radius: 40 });
        this.buildForm();
      }
    });
    objHeader.appendChild(addBtn);
    this.container.appendChild(objHeader);

    this.objContainer = document.createElement('div');
    this.objectives.forEach((obj, i) => {
      const row = this.buildObjectiveRow(obj, i);
      this.objContainer.appendChild(row);
    });
    this.container.appendChild(this.objContainer);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit to Marketplace';
    submitBtn.style.cssText = 'margin-top:12px;padding:8px 16px;background:#ffd700;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;width:100%;font-size:13px;';
    submitBtn.addEventListener('click', () => this.submit());
    this.container.appendChild(submitBtn);

    // Status message area
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'margin-top:8px;font-size:12px;min-height:16px;';
    this.container.appendChild(this.statusEl);
  }

  _addDistrictPicker() {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:8px;background:#111;border:1px solid #333;border-radius:4px;padding:6px;';

    const header = document.createElement('div');
    header.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;cursor:pointer;';
    header.textContent = '▶ District Guide (click to expand)';
    let expanded = false;

    const content = document.createElement('div');
    content.style.cssText = 'display:none;';

    for (const d of DISTRICTS) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #222;cursor:pointer;';
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,215,0,0.08)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const info = document.createElement('div');
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'color:#ffd700;font-size:11px;';
      nameSpan.textContent = d.name;
      info.appendChild(nameSpan);
      info.appendChild(document.createElement('br'));
      const descSpan = document.createElement('span');
      descSpan.style.cssText = 'color:#666;font-size:9px;';
      descSpan.textContent = d.desc;
      info.appendChild(descSpan);
      row.appendChild(info);

      const useBtn = document.createElement('button');
      useBtn.textContent = 'Use';
      useBtn.style.cssText = 'padding:2px 6px;background:#334;color:#4fc3f7;border:1px solid #4fc3f7;border-radius:2px;cursor:pointer;font-size:9px;flex-shrink:0;margin-left:6px;';
      useBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cx = Math.round((d.x1 + d.x2) / 2);
        const cy = Math.round((d.y1 + d.y2) / 2);
        if (this.trigXInput) this.trigXInput.value = cx;
        if (this.trigYInput) this.trigYInput.value = cy;
      });
      row.appendChild(useBtn);
      content.appendChild(row);
    }

    header.addEventListener('click', () => {
      expanded = !expanded;
      content.style.display = expanded ? 'block' : 'none';
      header.textContent = (expanded ? '▼' : '▶') + ' District Guide (click to expand)';
    });

    section.appendChild(header);
    section.appendChild(content);
    this.container.appendChild(section);
  }

  _addRewardEditor() {
    const section = document.createElement('div');
    section.style.cssText = 'margin:8px 0;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:8px;';

    const title = document.createElement('div');
    title.textContent = 'Rewards';
    title.style.cssText = 'font-size:11px;color:#6adf6a;margin-bottom:6px;font-weight:bold;';
    section.appendChild(title);

    // Cash reward
    const cashWrap = document.createElement('div');
    cashWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
    const cashLabel = document.createElement('span');
    cashLabel.textContent = '$';
    cashLabel.style.cssText = 'color:#6adf6a;font-size:13px;font-weight:bold;';
    cashWrap.appendChild(cashLabel);
    this.cashInput = document.createElement('input');
    this.cashInput.type = 'number';
    this.cashInput.value = this.rewardCash;
    this.cashInput.min = 0;
    this.cashInput.max = 10000;
    this.cashInput.style.cssText = SMALL_INPUT_STYLE + 'width:80px;';
    this.cashInput.addEventListener('input', () => { this.rewardCash = parseInt(this.cashInput.value) || 0; });
    cashWrap.appendChild(this.cashInput);

    const cashHint = document.createElement('span');
    cashHint.textContent = 'easy: 500-1500 | hard: 4000-10000';
    cashHint.style.cssText = 'font-size:9px;color:#555;';
    cashWrap.appendChild(cashHint);
    section.appendChild(cashWrap);

    // XP reward
    const xpWrap = document.createElement('div');
    xpWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    const xpLabel = document.createElement('span');
    xpLabel.textContent = 'XP';
    xpLabel.style.cssText = 'color:#4fc3f7;font-size:11px;font-weight:bold;';
    xpWrap.appendChild(xpLabel);
    this.xpInput = document.createElement('input');
    this.xpInput.type = 'number';
    this.xpInput.value = this.rewardXp;
    this.xpInput.min = 0;
    this.xpInput.style.cssText = SMALL_INPUT_STYLE + 'width:80px;';
    this.xpInput.addEventListener('input', () => { this.rewardXp = parseInt(this.xpInput.value) || 0; });
    xpWrap.appendChild(this.xpInput);
    section.appendChild(xpWrap);

    // Sale price on marketplace
    const priceDivider = document.createElement('div');
    priceDivider.style.cssText = 'border-top:1px solid #333;margin:4px 0;';
    section.appendChild(priceDivider);

    const priceTitle = document.createElement('div');
    priceTitle.textContent = 'Marketplace';
    priceTitle.style.cssText = 'font-size:11px;color:#ffd700;margin-bottom:4px;font-weight:bold;';
    section.appendChild(priceTitle);

    const priceWrap = document.createElement('div');
    priceWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const priceLabel = document.createElement('span');
    priceLabel.textContent = 'Price $';
    priceLabel.style.cssText = 'color:#ffd700;font-size:11px;font-weight:bold;';
    priceWrap.appendChild(priceLabel);
    this.priceInput = document.createElement('input');
    this.priceInput.type = 'number';
    this.priceInput.value = this.price;
    this.priceInput.min = 0;
    this.priceInput.max = 5000;
    this.priceInput.style.cssText = SMALL_INPUT_STYLE + 'width:80px;';
    this.priceInput.addEventListener('input', () => { this.price = parseInt(this.priceInput.value) || 0; });
    priceWrap.appendChild(this.priceInput);

    const priceHint = document.createElement('span');
    priceHint.textContent = '0 = free';
    priceHint.style.cssText = 'font-size:9px;color:#555;';
    priceWrap.appendChild(priceHint);
    section.appendChild(priceWrap);

    this.container.appendChild(section);
  }

  // Allow main.js to provide player position
  setPlayerPositionGetter(fn) {
    this._getPlayerPos = fn;
  }

  addField(label, type, placeholder) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:6px;';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = LABEL_STYLE;
    wrap.appendChild(lbl);

    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.style.cssText = INPUT_STYLE;
    wrap.appendChild(input);

    this.container.appendChild(wrap);
    return input;
  }

  buildObjectiveRow(obj, index) {
    const row = document.createElement('div');
    row.style.cssText = 'background:#1a1a2e;padding:8px;border-radius:4px;margin-bottom:4px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';

    const numLabel = document.createElement('span');
    numLabel.textContent = `#${index + 1}`;
    numLabel.style.cssText = 'color:#4fc3f7;font-size:11px;font-weight:bold;';
    header.appendChild(numLabel);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:4px;';

    // "Use my pos" mini button per objective
    const posBtn = document.createElement('button');
    posBtn.textContent = 'Pos';
    posBtn.title = 'Use current player position';
    posBtn.style.cssText = 'padding:1px 5px;background:#2a5a3a;color:#6f6;border:none;border-radius:3px;cursor:pointer;font-size:9px;';
    posBtn.addEventListener('click', () => {
      if (this._getPlayerPos) {
        const pos = this._getPlayerPos();
        obj.x = Math.round(pos.x);
        obj.y = Math.round(pos.y);
        this.buildForm();
      }
    });
    btnGroup.appendChild(posBtn);

    if (this.objectives.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'X';
      removeBtn.style.cssText = 'padding:1px 6px;background:#a33;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;';
      removeBtn.addEventListener('click', () => {
        this.objectives.splice(index, 1);
        this.buildForm();
      });
      btnGroup.appendChild(removeBtn);
    }
    header.appendChild(btnGroup);
    row.appendChild(header);

    const makeSmallInput = (lbl, val, key) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:inline-block;width:48%;margin-right:2%;margin-bottom:4px;';
      const label = document.createElement('label');
      label.textContent = lbl;
      label.style.cssText = 'font-size:10px;color:#666;display:block;';
      wrap.appendChild(label);
      const inp = document.createElement('input');
      inp.type = key === 'description' || key === 'type' ? 'text' : 'number';
      inp.value = val;
      inp.placeholder = lbl;
      inp.style.cssText = SMALL_INPUT_STYLE;
      inp.addEventListener('input', () => {
        if (key === 'description' || key === 'type') {
          obj[key] = inp.value;
        } else {
          obj[key] = parseFloat(inp.value) || 0;
        }
      });
      wrap.appendChild(inp);
      return wrap;
    };

    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = 'width:100%;padding:3px;background:#111;border:1px solid #333;color:#eee;border-radius:2px;font-size:11px;margin-bottom:4px;';
    OBJECTIVE_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      opt.selected = obj.type === t;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', () => { obj.type = typeSelect.value; });
    row.appendChild(typeSelect);

    row.appendChild(makeSmallInput('Description', obj.description || '', 'description'));
    row.appendChild(makeSmallInput('X', obj.x || 0, 'x'));
    row.appendChild(makeSmallInput('Y', obj.y || 0, 'y'));
    row.appendChild(makeSmallInput('Radius', obj.radius || 40, 'radius'));

    return row;
  }

  submit() {
    const id = 'custom-' + Date.now();
    const missionData = {
      id,
      name: this.nameInput.value || 'Unnamed Mission',
      author: this.authorInput.value || 'Anonymous',
      description: this.descInput.value || '',
      difficulty: this.difficultySelect.value,
      version: '1.0',
      triggerZone: {
        x: parseFloat(this.trigXInput.value) || 500,
        y: parseFloat(this.trigYInput.value) || 500,
        radius: parseFloat(this.trigRadInput.value) || 50,
      },
      objectives: this.objectives.map(o => ({
        type: o.type || 'goto',
        description: o.description || 'Go to target',
        target: { x: o.x || 0, y: o.y || 0, radius: o.radius || 40 },
      })),
      reward: { cash: this.rewardCash, xp: this.rewardXp },
      price: this.price || 0,
      fail_conditions: [
        { type: 'player_death', message: 'Mission failed.' },
      ],
    };

    const { valid, errors, warnings } = validateMission(missionData);
    if (!valid) {
      this.statusEl.textContent = 'Errors: ' + errors.join(', ');
      this.statusEl.style.color = '#f44';
      return;
    }

    if (warnings.length > 0) {
      console.warn('Mission warnings:', warnings);
    }

    const success = this.marketplace.addToCatalog(missionData);
    if (success) {
      this.statusEl.textContent = 'Mission submitted! Find it in the marketplace.';
      this.statusEl.style.color = '#4f4';
      this.marketplace.render();
      // Reset form
      this.objectives = [{ type: 'goto', description: '', x: 0, y: 0, radius: 40 }];
      this.rewardCash = 500;
      this.rewardXp = 100;
      this.price = 0;
      this.nameInput.value = '';
      this.descInput.value = '';
    } else {
      this.statusEl.textContent = 'Submission failed — check mission data.';
      this.statusEl.style.color = '#f44';
    }
  }
}
