// Properties — safehouses the player can buy, save at, and store vehicles

const PROPERTY_DEFS = [
  { id: 'apt_oldtown',    name: 'Old Town Apartment',     price: 2000,  district: 'Old Town',   garageSlots: 1, normX: 0.15, normY: 0.15 },
  { id: 'flat_midtown',   name: 'Midtown Flat',           price: 3500,  district: 'Midtown',    garageSlots: 2, normX: 0.15, normY: 0.50 },
  { id: 'condo_downtown', name: 'Downtown Condo',         price: 6000,  district: 'Downtown',   garageSlots: 2, normX: 0.50, normY: 0.50 },
  { id: 'mansion_uptown', name: 'Uptown Mansion',         price: 15000, district: 'Uptown',     garageSlots: 4, normX: 0.50, normY: 0.15 },
  { id: 'loft_hills',     name: 'The Hills Loft',         price: 8000,  district: 'The Hills',  garageSlots: 3, normX: 0.85, normY: 0.15 },
  { id: 'warehouse_docks',name: 'Docks Warehouse',        price: 4000,  district: 'The Docks',  garageSlots: 3, normX: 0.15, normY: 0.85 },
];

export class PropertySystem {
  constructor() {
    this.properties = [];    // placed properties with world coords
    this.owned = new Set();  // owned property IDs
    this.isOpen = false;
    this.activeProperty = null;
    this.selectedOption = 0;
    this.storedVehicles = {}; // propertyId -> [{name, color, type}]
  }

  placeProperties(worldW, worldH) {
    for (const def of PROPERTY_DEFS) {
      const x = def.normX * worldW;
      const y = def.normY * worldH;
      this.properties.push({
        x, y, def,
        radius: 45,
      });
      this.storedVehicles[def.id] = [];
    }
  }

  getNearbyProperty(px, py) {
    for (const prop of this.properties) {
      const dx = px - prop.x;
      const dy = py - prop.y;
      if (dx * dx + dy * dy < prop.radius * prop.radius) return prop;
    }
    return null;
  }

  isOwned(propertyId) {
    return this.owned.has(propertyId);
  }

  buy(property, money) {
    if (this.owned.has(property.def.id)) return { success: false, message: 'Already owned' };
    if (money < property.def.price) return { success: false, message: 'Not enough cash' };
    this.owned.add(property.def.id);
    return { success: true, cost: property.def.price, message: `Purchased ${property.def.name}!` };
  }

  open(property) {
    this.activeProperty = property;
    this.isOpen = true;
    this.selectedOption = 0;
  }

  close() {
    this.isOpen = false;
    this.activeProperty = null;
  }

  navigateUp() {
    this.selectedOption = Math.max(0, this.selectedOption - 1);
  }

  navigateDown() {
    const maxOpts = this.isOwned(this.activeProperty.def.id) ? 2 : 0;
    this.selectedOption = Math.min(maxOpts, this.selectedOption + 1);
  }

  // Returns action: 'buy', 'save', 'garage', or null
  interact(money) {
    if (!this.activeProperty) return null;
    const prop = this.activeProperty;
    const owned = this.isOwned(prop.def.id);

    if (!owned) {
      // Only option is buy
      return { action: 'buy', property: prop };
    }

    // Owned: 0=Save, 1=Heal, 2=Garage
    if (this.selectedOption === 0) return { action: 'save', property: prop };
    if (this.selectedOption === 1) return { action: 'heal', property: prop };
    if (this.selectedOption === 2) return { action: 'garage', property: prop };
    return null;
  }

  draw(ctx, canvasW, canvasH) {
    if (!this.isOpen || !this.activeProperty) return;

    const prop = this.activeProperty;
    const owned = this.isOwned(prop.def.id);
    const panelW = 280;
    const panelH = owned ? 180 : 120;
    const px = canvasW / 2 - panelW / 2;
    const py = canvasH / 2 - panelH / 2;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,80,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(prop.def.name, canvasW / 2, py + 22);

    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(prop.def.district + ` — Garage: ${prop.def.garageSlots} slots`, canvasW / 2, py + 38);

    if (!owned) {
      // Buy option
      ctx.fillStyle = '#ffaa44';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`Press E: Buy — $${prop.def.price.toLocaleString()}`, canvasW / 2, py + 70);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px monospace';
      ctx.fillText('ESC to close', canvasW / 2, py + 95);
    } else {
      const options = ['Save Game', 'Heal to Full', 'View Garage'];
      const startY = py + 60;
      for (let i = 0; i < options.length; i++) {
        const oy = startY + i * 28;
        const sel = i === this.selectedOption;
        if (sel) {
          ctx.fillStyle = 'rgba(255,170,68,0.15)';
          ctx.fillRect(px + 10, oy - 10, panelW - 20, 24);
        }
        ctx.fillStyle = sel ? '#ffaa44' : '#aaa';
        ctx.font = sel ? 'bold 12px monospace' : '12px monospace';
        ctx.fillText(options[i], canvasW / 2, oy + 5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('W/S navigate • E select • ESC close', canvasW / 2, py + panelH - 12);
    }

    ctx.textAlign = 'left';
  }

  // Save/load owned properties
  getSaveData() {
    return {
      owned: [...this.owned],
      storedVehicles: this.storedVehicles,
    };
  }

  loadSaveData(data) {
    if (data.owned) data.owned.forEach(id => this.owned.add(id));
    if (data.storedVehicles) this.storedVehicles = data.storedVehicles;
  }
}
