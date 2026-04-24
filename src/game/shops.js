// Shop system — buy weapons, vehicles, health at shop locations

import { WEAPON_DEFS } from './combat.js';

// Shop types and their inventories
const SHOP_TYPES = {
  ammu: {
    name: 'Ammu-Nation',
    icon: 'W',
    color: '#ff6633',
    items: [
      { type: 'weapon', weaponType: 'bat',     price: 100,  label: 'Baseball Bat' },
      { type: 'weapon', weaponType: 'pistol',   price: 350,  label: 'Pistol' },
      { type: 'weapon', weaponType: 'shotgun',  price: 800,  label: 'Shotgun' },
      { type: 'weapon', weaponType: 'smg',      price: 1200, label: 'SMG' },
      { type: 'weapon', weaponType: 'rifle',    price: 2500, label: 'Rifle' },
      { type: 'weapon', weaponType: 'grenade',  price: 500,  label: 'Grenades (x3)' },
      { type: 'ammo',   amount: 60,             price: 150,  label: '+60 Ammo' },
    ],
  },
  garage: {
    name: 'Auto Dealer',
    icon: 'V',
    color: '#3388ff',
    items: [
      { type: 'vehicle', vehicleType: 0, price: 800,  label: 'Sedan' },
      { type: 'vehicle', vehicleType: 1, price: 3000, label: 'Sports Car' },
      { type: 'vehicle', vehicleType: 2, price: 1500, label: 'Truck' },
      { type: 'vehicle', vehicleType: 3, price: 600,  label: 'Taxi' },
      { type: 'vehicle', vehicleType: 4, price: 2000, label: 'SUV' },
    ],
  },
  clinic: {
    name: 'Med Clinic',
    icon: '+',
    color: '#44cc44',
    items: [
      { type: 'health', amount: 50,  price: 100, label: '+50 Health' },
      { type: 'health', amount: 100, price: 200, label: 'Full Health' },
      { type: 'armor',  amount: 50,  price: 300, label: '+50 Armor' },
      { type: 'armor',  amount: 100, price: 500, label: 'Full Armor' },
    ],
  },
};

export class ShopSystem {
  constructor() {
    this.shops = [];     // { x, y, shopType, radius }
    this.isOpen = false;
    this.activeShop = null;
    this.selectedIndex = 0;
    this.purchaseMessage = null;
    this.purchaseMessageTimer = 0;
  }

  // Place shops at specific locations in the world
  placeShops(map, tileSize) {
    const rows = map.length;
    const cols = map[0].length;
    const worldW = cols * tileSize;
    const worldH = rows * tileSize;

    // Fixed shop locations distributed across the map
    const shopPlacements = [
      // Ammu-Nations
      { type: 'ammu', nx: 0.15, ny: 0.15 },
      { type: 'ammu', nx: 0.50, ny: 0.50 },
      { type: 'ammu', nx: 0.75, ny: 0.25 },
      // Garages
      { type: 'garage', nx: 0.25, ny: 0.50 },
      { type: 'garage', nx: 0.60, ny: 0.75 },
      // Clinics
      { type: 'clinic', nx: 0.20, ny: 0.70 },
      { type: 'clinic', nx: 0.50, ny: 0.20 },
      { type: 'clinic', nx: 0.70, ny: 0.60 },
    ];

    for (const sp of shopPlacements) {
      // Find nearest sidewalk tile to desired position
      const targetC = Math.floor(sp.nx * cols);
      const targetR = Math.floor(sp.ny * rows);

      let bestR = targetR, bestC = targetC, bestDist = Infinity;
      for (let dr = -10; dr <= 10; dr++) {
        for (let dc = -10; dc <= 10; dc++) {
          const r = targetR + dr;
          const c = targetC + dc;
          if (r < 1 || c < 1 || r >= rows - 1 || c >= cols - 1) continue;
          if (map[r][c] !== 1) continue; // sidewalk only
          const d = dr * dr + dc * dc;
          if (d < bestDist) { bestDist = d; bestR = r; bestC = c; }
        }
      }

      this.shops.push({
        x: bestC * tileSize + tileSize / 2,
        y: bestR * tileSize + tileSize / 2,
        shopType: sp.type,
        radius: 45,
        def: SHOP_TYPES[sp.type],
      });
    }
  }

  // Check if player is near a shop
  getNearbyShop(playerX, playerY) {
    for (const shop of this.shops) {
      const dx = shop.x - playerX;
      const dy = shop.y - playerY;
      if (dx * dx + dy * dy < shop.radius * shop.radius) {
        return shop;
      }
    }
    return null;
  }

  open(shop) {
    this.activeShop = shop;
    this.isOpen = true;
    this.selectedIndex = 0;
  }

  close() {
    this.isOpen = false;
    this.activeShop = null;
  }

  toggle(shop) {
    if (this.isOpen) this.close();
    else this.open(shop);
  }

  navigateUp() {
    if (!this.isOpen || !this.activeShop) return;
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
  }

  navigateDown() {
    if (!this.isOpen || !this.activeShop) return;
    const maxIdx = this.activeShop.def.items.length - 1;
    this.selectedIndex = Math.min(maxIdx, this.selectedIndex + 1);
  }

  // Attempt purchase — returns { success, item, message }
  purchase(money) {
    if (!this.isOpen || !this.activeShop) return null;
    const item = this.activeShop.def.items[this.selectedIndex];
    if (!item) return null;

    if (money < item.price) {
      this.purchaseMessage = 'Not enough cash!';
      this.purchaseMessageTimer = 2;
      return { success: false, item, message: 'Not enough cash!' };
    }

    this.purchaseMessage = `Bought ${item.label}!`;
    this.purchaseMessageTimer = 2;
    return { success: true, item, message: `Bought ${item.label}!`, cost: item.price };
  }

  update(dt) {
    if (this.purchaseMessageTimer > 0) {
      this.purchaseMessageTimer -= dt;
      if (this.purchaseMessageTimer <= 0) this.purchaseMessage = null;
    }
  }

  // Draw shop menu overlay
  draw(ctx, canvasW, canvasH) {
    if (!this.isOpen || !this.activeShop) return;

    const shop = this.activeShop;
    const items = shop.def.items;
    const panelW = 320;
    const panelH = 40 + items.length * 36 + 20;
    const px = canvasW / 2 - panelW / 2;
    const py = canvasH / 2 - panelH / 2;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.92)';
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.fill();
    ctx.strokeStyle = shop.def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 8);
    ctx.stroke();

    // Title
    ctx.fillStyle = shop.def.color;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(shop.def.name, canvasW / 2, py + 28);

    // Items
    ctx.font = '13px monospace';
    for (let i = 0; i < items.length; i++) {
      const iy = py + 48 + i * 36;
      const isSelected = i === this.selectedIndex;

      if (isSelected) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px + 8, iy - 4, panelW - 16, 30);
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = '#aaa';
      }

      ctx.textAlign = 'left';
      ctx.fillText(items[i].label, px + 20, iy + 14);
      ctx.textAlign = 'right';
      ctx.fillStyle = isSelected ? '#6adf6a' : '#6a9';
      ctx.fillText(`$${items[i].price}`, px + panelW - 20, iy + 14);
    }

    // Controls hint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[W/S] Select  [E] Buy  [ESC] Close', canvasW / 2, py + panelH - 8);

    // Purchase message
    if (this.purchaseMessage) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const tw = ctx.measureText(this.purchaseMessage).width + 20;
      ctx.fillRect(canvasW / 2 - tw / 2, py - 36, tw, 26);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(this.purchaseMessage, canvasW / 2, py - 17);
    }

    ctx.textAlign = 'left';
  }
}
