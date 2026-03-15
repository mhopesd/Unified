// Mission Editor — form-based UI for creators to build missions

import { validateMission, OBJECTIVE_TYPES, DIFFICULTY_LEVELS } from '../missions/schema.js';

export class MissionEditor {
  constructor(marketplace) {
    this.marketplace = marketplace;
    this.container = null;
    this.objectives = [{ type: 'goto', description: '', x: 0, y: 0, radius: 40 }];
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
    diffLabel.style.cssText = 'display:block;font-size:11px;color:#888;margin-bottom:2px;';
    diffWrap.appendChild(diffLabel);
    this.difficultySelect = document.createElement('select');
    this.difficultySelect.style.cssText = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:12px;box-sizing:border-box;';
    DIFFICULTY_LEVELS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      this.difficultySelect.appendChild(opt);
    });
    diffWrap.appendChild(this.difficultySelect);
    this.container.appendChild(diffWrap);

    this.trigXInput = this.addField('Trigger X', 'number', '500');
    this.trigYInput = this.addField('Trigger Y', 'number', '500');
    this.trigRadInput = this.addField('Trigger Radius', 'number', '50');

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

  addField(label, type, placeholder) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:6px;';

    const lbl = document.createElement('label');
    lbl.textContent = label;
    lbl.style.cssText = 'display:block;font-size:11px;color:#888;margin-bottom:2px;';
    wrap.appendChild(lbl);

    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.style.cssText = 'width:100%;padding:4px 6px;background:#222;border:1px solid #444;color:#eee;border-radius:3px;font-size:12px;box-sizing:border-box;';
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

    if (this.objectives.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'X';
      removeBtn.style.cssText = 'padding:1px 6px;background:#a33;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;';
      removeBtn.addEventListener('click', () => {
        this.objectives.splice(index, 1);
        this.buildForm();
      });
      header.appendChild(removeBtn);
    }
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
      inp.style.cssText = 'width:100%;padding:3px 4px;background:#111;border:1px solid #333;color:#eee;border-radius:2px;font-size:11px;box-sizing:border-box;';
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
      reward: { xp: 100 },
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
      // Show warnings but still allow submission
      console.warn('Mission warnings:', warnings);
    }

    const success = this.marketplace.addToCatalog(missionData);
    if (success) {
      this.statusEl.textContent = 'Mission submitted! Find it in the marketplace.';
      this.statusEl.style.color = '#4f4';
      this.marketplace.render();
      // Reset form
      this.objectives = [{ type: 'goto', description: '', x: 0, y: 0, radius: 40 }];
      this.nameInput.value = '';
      this.descInput.value = '';
    } else {
      this.statusEl.textContent = 'Submission failed — check mission data.';
      this.statusEl.style.color = '#f44';
    }
  }
}
