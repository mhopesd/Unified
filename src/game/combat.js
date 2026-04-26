// Combat system — hostile NPC AI, enemy shooting, weapon inventory

export const WEAPON_DEFS = {
  fists:   { name: 'Fists',         damage: 12, fireRate: 2.0,  range: 1.5, ammo: Infinity, spread: 0,    color: '#c8a060', type: 'fists',   shootType: 'melee' },
  bat:     { name: 'Baseball Bat',  damage: 45, fireRate: 1.4,  range: 1.8, ammo: Infinity, spread: 0,    color: '#c8a060', type: 'bat',     shootType: 'melee' },
  pistol:  { name: 'Pistol',        damage: 18, fireRate: 2.5,  range: 12,  ammo: 45,       spread: 0.04, color: '#888',    type: 'pistol',  shootType: 'hitscan' },
  shotgun: { name: 'Shotgun',       damage: 22, fireRate: 0.75, range: 7,   ammo: 20,       spread: 0.22, color: '#8B6914', type: 'shotgun', shootType: 'hitscan', pellets: 5 },
  smg:     { name: 'SMG',           damage: 10, fireRate: 9,    range: 9,   ammo: 90,       spread: 0.10, color: '#445566', type: 'smg',     shootType: 'auto' },
  rifle:   { name: 'Rifle',         damage: 42, fireRate: 1.0,  range: 20,  ammo: 25,       spread: 0.01, color: '#556633', type: 'rifle',   shootType: 'hitscan' },
  grenade: { name: 'Grenade',       damage: 80, fireRate: 0.5,  range: 5,   ammo: 3,        spread: 0,    color: '#446633', type: 'grenade', shootType: 'thrown' },
};

// Weapon inventory — player can carry one of each type, switch with number keys
export class WeaponInventory {
  constructor() {
    this.slots = [];       // array of weapon configs (copies from WEAPON_DEFS)
    this.activeIndex = -1; // -1 = unarmed
  }

  get current() {
    return this.activeIndex >= 0 ? this.slots[this.activeIndex] : null;
  }

  add(weaponType) {
    const def = WEAPON_DEFS[weaponType];
    if (!def) return;
    // If already have this type, just add ammo
    const existing = this.slots.find(s => s.type === def.type);
    if (existing) {
      if (existing.ammo !== Infinity) existing.ammo += def.ammo;
      return;
    }
    this.slots.push({ ...def });
    if (this.activeIndex < 0) this.activeIndex = this.slots.length - 1;
  }

  equipDirect(config) {
    // For AI-generated weapons — add directly
    const existing = this.slots.find(s => s.type === config.type);
    if (existing) {
      Object.assign(existing, config);
      return;
    }
    this.slots.push({ ...config });
    this.activeIndex = this.slots.length - 1;
  }

  next() {
    if (this.slots.length === 0) return;
    this.activeIndex = (this.activeIndex + 1) % this.slots.length;
  }

  prev() {
    if (this.slots.length === 0) return;
    this.activeIndex = (this.activeIndex - 1 + this.slots.length) % this.slots.length;
  }

  selectByNumber(num) {
    // num 1-9, select slot index num-1
    const idx = num - 1;
    if (idx >= 0 && idx < this.slots.length) this.activeIndex = idx;
  }
}

// Hostile NPC AI — enemies that shoot back at the player
export class HostileNPC {
  constructor(x, y, config = {}) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vx = 0;
    this.vy = 0;
    this.speed = config.speed || 100;
    this.health = config.health || 80;
    this.maxHealth = this.health;
    this.dead = false;
    this.deathTimer = 0;

    // Appearance
    this.color = config.color || '#cc3333';
    this.skinTone = config.skinTone || [170, 130, 95];
    this.hairColor = config.hairColor || [30, 20, 15];
    this.hat = config.hat || 'none';
    this.hatColor = config.hatColor || '#333';
    this.pantsColor = config.pantsColor || [40, 35, 30];
    this.bodyScale = config.bodyScale || 1.0;
    this.name = config.name || 'Hostile';

    // Combat AI
    this.weapon = config.weapon || { ...WEAPON_DEFS.pistol };
    this.shootCooldown = 0;
    this.aggroRange = config.aggroRange || 280;
    this.shootRange = config.shootRange || 220;
    this.isAggro = false;
    this.lastKnownPlayerX = 0;
    this.lastKnownPlayerY = 0;
    this.accuracy = config.accuracy || 0.12; // spread multiplier (higher = less accurate)

    // Movement AI
    this.aiState = 'idle'; // idle, patrol, chase, cover, flee
    this.patrolDir = Math.floor(Math.random() * 4);
    this.patrolTimer = 2 + Math.random() * 3;
    this.strafeDirTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;

    // Gang affiliation
    this.gang = config.gang || null;
    this.territory = config.territory || null;

    // Speech
    this.speechText = null;
    this.speechTimer = 0;

    // Drops
    this.drops = config.drops || { cash: 50 + Math.floor(Math.random() * 150) };
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.deathTimer = 8;
    }
    // Getting hit makes the enemy aggro
    this.isAggro = true;
  }

  update(dt, playerX, playerY, map, tileSize) {
    if (this.dead) {
      this.deathTimer -= dt;
      return null; // no shots fired
    }

    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) this.speechText = null;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Aggro check
    if (!this.isAggro && dist < this.aggroRange) {
      this.isAggro = true;
      this.aiState = 'chase';
      const lines = ['You picked the wrong block!', 'Get outta here!', 'You\'re dead meat!', 'Wrong neighborhood!'];
      this.speechText = lines[Math.floor(Math.random() * lines.length)];
      this.speechTimer = 2.5;
    }

    if (!this.isAggro) {
      // Patrol behavior
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolDir = Math.floor(Math.random() * 4);
        this.patrolTimer = 2 + Math.random() * 4;
      }
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [pdx, pdy] = dirs[this.patrolDir];
      this.vx = pdx * this.speed * 0.5;
      this.vy = pdy * this.speed * 0.5;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return null;
    }

    // Combat behavior
    this.lastKnownPlayerX = playerX;
    this.lastKnownPlayerY = playerY;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    let shotFired = null;

    if (dist < this.shootRange && dist > 40) {
      // In shooting range — strafe and shoot
      this.strafeDirTimer -= dt;
      if (this.strafeDirTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeDirTimer = 1 + Math.random() * 2;
      }

      // Strafe perpendicular to player
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      this.vx = (-ny * this.strafeDir) * this.speed;
      this.vy = (nx * this.strafeDir) * this.speed;

      // Shoot at player
      if (this.shootCooldown <= 0) {
        this.shootCooldown = 1 / (this.weapon.fireRate * 0.6); // enemies shoot slower
        const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * this.accuracy;
        shotFired = {
          fromX: this.x,
          fromY: this.y,
          angle: angle,
          damage: this.weapon.damage,
          range: this.weapon.shootRange || this.shootRange,
        };
      }
    } else if (dist >= this.shootRange) {
      // Chase player
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      this.vx = nx * this.speed;
      this.vy = ny * this.speed;
    } else {
      // Too close — back up
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      this.vx = -nx * this.speed * 0.6;
      this.vy = -ny * this.speed * 0.6;
    }

    // Flee when low health
    if (this.health < this.maxHealth * 0.2) {
      this.aiState = 'flee';
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      this.vx = -nx * this.speed * 1.3;
      this.vy = -ny * this.speed * 1.3;
      shotFired = null;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    return shotFired;
  }
}

// Combat lines for gang NPCs
export const GANG_AGGRO_LINES = [
  'You picked the wrong block!',
  'Get outta here!',
  'You\'re dead meat!',
  'Wrong neighborhood, fool!',
  'This is OUR turf!',
  'You got a death wish?!',
];

export const GANG_DEATH_LINES = [
  'Ugh... tell my crew...',
  'You\'ll pay for this...',
  'The gang will find you...',
];
