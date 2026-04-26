// Gang territory system — territory control, ambient events, gang spawning

import { HostileNPC, WEAPON_DEFS } from './combat.js';

// Gang definitions
export const GANGS = {
  southside: {
    name: 'Southside Crew',
    color: '#cc3333',
    hatColor: '#cc2222',
    hat: 'cap',
    territory: 'The Docks',
    hostileToPlayer: false,
    weapon: 'pistol',
  },
  uptown: {
    name: 'Uptown Kings',
    color: '#3355cc',
    hatColor: '#2244bb',
    hat: 'beanie',
    territory: 'Uptown',
    hostileToPlayer: false,
    weapon: 'smg',
  },
  industrial: {
    name: 'Iron Works',
    color: '#555555',
    hatColor: '#444444',
    hat: 'none',
    territory: 'Industrial',
    hostileToPlayer: false,
    weapon: 'shotgun',
  },
};

// Territory boundaries (matching WORLD_DISTRICTS from main.js)
const TERRITORY_BOUNDS = {
  'The Docks':  { x1: 0, y1: 0.67, x2: 0.33, y2: 1.0 },
  'Uptown':     { x1: 0.33, y1: 0, x2: 0.67, y2: 0.33 },
  'Industrial': { x1: 0.33, y1: 0.67, x2: 0.67, y2: 1.0 },
};

export class GangSystem {
  constructor(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.hostiles = [];      // HostileNPC instances
    this.maxHostiles = 30;
    this.spawnCooldown = 0;
    this.ambientEvents = []; // active ambient events
    // Grace period before the first ambient event so new players aren't swarmed
    this.eventCooldown = 90 + Math.random() * 60;
  }

  // Get which gang controls a position (or null)
  getGangAt(x, y) {
    const nx = x / this.worldW;
    const ny = y / this.worldH;
    for (const [id, gang] of Object.entries(GANGS)) {
      const bounds = TERRITORY_BOUNDS[gang.territory];
      if (!bounds) continue;
      if (nx >= bounds.x1 && nx < bounds.x2 && ny >= bounds.y1 && ny < bounds.y2) {
        return { id, ...gang };
      }
    }
    return null;
  }

  // Spawn gang members in their territory
  spawnGangMembers(map, tileSize, playerX, playerY) {
    if (this.hostiles.length >= this.maxHostiles) return;

    for (const [id, gang] of Object.entries(GANGS)) {
      const bounds = TERRITORY_BOUNDS[gang.territory];
      if (!bounds) continue;

      // Count existing gang members
      const count = this.hostiles.filter(h => h.gang === id && !h.dead).length;
      if (count >= 8) continue;

      // Spawn in territory, not too close to player
      const rows = map.length;
      const cols = map[0].length;

      for (let attempt = 0; attempt < 20; attempt++) {
        const c = Math.floor((bounds.x1 + Math.random() * (bounds.x2 - bounds.x1)) * cols);
        const r = Math.floor((bounds.y1 + Math.random() * (bounds.y2 - bounds.y1)) * rows);
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        if (map[r][c] !== 1 && map[r][c] !== 0) continue; // sidewalk or road

        const wx = c * tileSize + tileSize / 2;
        const wy = r * tileSize + tileSize / 2;

        // Not too close to player (min 400px)
        const dx = wx - playerX;
        const dy = wy - playerY;
        if (dx * dx + dy * dy < 400 * 400) continue;

        const hostile = new HostileNPC(wx, wy, {
          color: gang.color,
          hat: gang.hat,
          hatColor: gang.hatColor,
          gang: id,
          name: gang.name.split(' ')[0],
          weapon: { ...WEAPON_DEFS[gang.weapon] },
          health: 60 + Math.floor(Math.random() * 40),
          aggroRange: 200,
          shootRange: 160,
          accuracy: 0.15 + Math.random() * 0.1,
          drops: { cash: 30 + Math.floor(Math.random() * 80) },
        });
        this.hostiles.push(hostile);
        break;
      }
    }
  }

  // Create an ambient event (gang fight, robbery, car chase witness)
  trySpawnAmbientEvent(playerX, playerY, map, tileSize) {
    if (this.ambientEvents.length >= 2) return null;

    const eventTypes = ['gang_fight', 'robbery', 'shakedown'];
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    // Find a location 500-900px from player on a road — far enough that the event
    // doesn't spawn on top of the player and kill them before they can react.
    const angle = Math.random() * Math.PI * 2;
    const dist = 500 + Math.random() * 400;
    const ex = playerX + Math.cos(angle) * dist;
    const ey = playerY + Math.sin(angle) * dist;

    const col = Math.floor(ex / tileSize);
    const row = Math.floor(ey / tileSize);
    if (row < 0 || row >= map.length || col < 0 || col >= map[0].length) return null;
    if (map[row][col] !== 0 && map[row][col] !== 1) return null;

    const event = {
      type,
      x: ex, y: ey,
      timer: 15 + Math.random() * 15,
      resolved: false,
    };

    event.hostiles = [];

    if (type === 'gang_fight') {
      // Spawn two hostile NPCs fighting each other
      const gangIds = Object.keys(GANGS);
      const g1 = gangIds[Math.floor(Math.random() * gangIds.length)];
      let g2 = gangIds[Math.floor(Math.random() * gangIds.length)];
      if (g2 === g1) g2 = gangIds[(gangIds.indexOf(g1) + 1) % gangIds.length];

      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 30;
        const h1 = new HostileNPC(ex - 40 + offset, ey, {
          color: GANGS[g1].color, hat: GANGS[g1].hat, hatColor: GANGS[g1].hatColor,
          gang: g1, name: 'Fighter', aggroRange: 120, shootRange: 100,
          weapon: { ...WEAPON_DEFS.pistol }, health: 50,
        });
        const h2 = new HostileNPC(ex + 40 + offset, ey, {
          color: GANGS[g2].color, hat: GANGS[g2].hat, hatColor: GANGS[g2].hatColor,
          gang: g2, name: 'Fighter', aggroRange: 120, shootRange: 100,
          weapon: { ...WEAPON_DEFS.pistol }, health: 50,
        });
        // Don't pre-aggro to the player — they should only engage if the player
        // wanders into their 120px aggro range. Otherwise they patrol the event area.
        h1.ambient = true; h2.ambient = true;
        this.hostiles.push(h1, h2);
        event.hostiles.push(h1, h2);
      }
      event.notification = 'Gang fight nearby!';
    } else if (type === 'robbery') {
      const robber = new HostileNPC(ex, ey, {
        color: '#333', hat: 'beanie', hatColor: '#222',
        gang: null, name: 'Robber', aggroRange: 150, shootRange: 120,
        weapon: { ...WEAPON_DEFS.pistol }, health: 60,
        drops: { cash: 200 + Math.floor(Math.random() * 300) },
      });
      robber.ambient = true;
      this.hostiles.push(robber);
      event.hostiles.push(robber);
      event.notification = 'A robbery is in progress!';
    } else if (type === 'shakedown') {
      const thug = new HostileNPC(ex, ey, {
        color: '#8B4513', hat: 'none',
        gang: null, name: 'Thug', aggroRange: 100, shootRange: 80,
        weapon: { ...WEAPON_DEFS.bat }, health: 70,
        drops: { cash: 80 },
      });
      thug.ambient = true;
      this.hostiles.push(thug);
      event.hostiles.push(thug);
      event.notification = 'Someone\'s being shaken down!';
    }

    this.ambientEvents.push(event);
    return event;
  }

  update(dt, playerX, playerY, map, tileSize) {
    const notifications = [];

    // Gangs and ambient hostile events are disabled — the game leans on
    // mission-driven encounters instead of open-world combat.
    // (spawnGangMembers + trySpawnAmbientEvent intentionally not called.)

    // Update ambient events
    for (let i = this.ambientEvents.length - 1; i >= 0; i--) {
      const ev = this.ambientEvents[i];
      ev.timer -= dt;
      if (ev.timer <= 0) {
        ev.resolved = true;
        // Remove any still-alive non-aggro'd hostiles tied to this event
        // so the world doesn't accumulate hostile NPCs after the event ends.
        if (ev.hostiles) {
          for (const h of ev.hostiles) {
            if (!h.dead && !h.isAggro) {
              const idx = this.hostiles.indexOf(h);
              if (idx !== -1) this.hostiles.splice(idx, 1);
            }
          }
        }
        this.ambientEvents.splice(i, 1);
      }
    }

    // Update hostiles — collect shots fired
    const shots = [];
    for (const h of this.hostiles) {
      const shot = h.update(dt, playerX, playerY, map, tileSize);
      if (shot) shots.push(shot);
    }

    // Cull dead hostiles past their timer
    for (let i = this.hostiles.length - 1; i >= 0; i--) {
      if (this.hostiles[i].dead && this.hostiles[i].deathTimer <= 0) {
        this.hostiles.splice(i, 1);
      }
    }

    // Cull hostiles too far from player (>1500px)
    for (let i = this.hostiles.length - 1; i >= 0; i--) {
      const h = this.hostiles[i];
      if (h.dead) continue;
      const dx = h.x - playerX;
      const dy = h.y - playerY;
      if (dx * dx + dy * dy > 1500 * 1500) {
        this.hostiles.splice(i, 1);
      }
    }

    return { shots, notifications };
  }
}
