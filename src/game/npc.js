// NPC pedestrians — walk along sidewalks with basic AI, diverse appearances

// Side quest templates — NPC-given one-shot missions
export const NPC_QUEST_TEMPLATES = [
  { title: 'Lost Package',   intro: "Oh thank god. Could you pick up that package I left? It's marked on your map.", outro: "That's it! Here, take this.", reward: 180 },
  { title: 'Street Errand',  intro: "I'll pay you to run an errand. Check the spot I'm marking for me.", outro: "Nice work. Don't spend it all.", reward: 150 },
  { title: 'Quick Delivery', intro: "Need something delivered. You look reliable enough. Mark's on your map.", outro: "Pleasure doing business.", reward: 200 },
  { title: 'Shady Job',      intro: "Don't ask questions. Just get to the spot marked and wait 30 seconds.", outro: "Good. Here's your cut.", reward: 250 },
  { title: 'Intel Run',      intro: "Heard there's something at that location. Check it out for me?", outro: "Knew I could count on you.", reward: 175 },
];

const NPC_GREETINGS = [
  "Hey, how's it going?",
  "Nice day, huh?",
  "Watch where you're going!",
  "You look lost...",
  "This city never sleeps.",
  "Keep moving.",
  "You seen my cat?",
  "Heard there's trouble downtown.",
  "Stay out of the docks at night.",
  "Long day... long day.",
  "You new around here?",
  "Eyes forward, keep walking.",
  "Don't trust the suits uptown.",
];

const NPC_NIGHT_GREETINGS = [
  "It's too late to be out...",
  "Keep your distance.",
  "I'm heading home.",
  "These streets aren't safe at night.",
  "You shouldn't be out here...",
  "Heard gunshots earlier...",
  "Stay in the light.",
];

const NPC_PHONE_LINES = [
  "*checking phone*",
  "*scrolling*",
  "*texting*",
  "*reading news*",
];

const NPC_FLEE_LINES = [
  "Oh god, run!",
  "HELP! POLICE!",
  "What was that?!",
  "Get down!",
  "Somebody call 911!",
];

const NPC_COLORS = [
  '#e07040', '#40a0e0', '#e0e040', '#e040a0', '#40e080', '#c070d0', '#d09050',
  '#3070b0', '#a04040', '#40a060', '#8050a0', '#d0a030', '#505050', '#e08080',
  '#2080a0', '#b06030',
];
const NPC_NAMES = ['Pedestrian', 'Citizen', 'Tourist', 'Worker', 'Jogger', 'Student', 'Commuter', 'Local'];

// Skin tone palette (realistic range)
const SKIN_TONES = [
  [240, 210, 180],  // light
  [220, 190, 155],  // fair
  [200, 165, 130],  // medium
  [170, 130, 95],   // olive
  [140, 100, 70],   // brown
  [100, 70, 50],    // dark
  [80, 55, 40],     // deep
];

// Accessories — hat styles
const HAT_STYLES = ['none', 'none', 'none', 'cap', 'beanie', 'cowboy', 'none', 'none'];

export class NPC {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vx = 0;
    this.vy = 0;
    this.speed = 60 + Math.random() * 40;
    this.color = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    this.skinTone = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    this.hairColor = [20 + Math.random() * 40, 15 + Math.random() * 25, 10 + Math.random() * 20];
    this.hat = HAT_STYLES[Math.floor(Math.random() * HAT_STYLES.length)];
    this.hatColor = NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)];
    this.bodyScale = 0.85 + Math.random() * 0.3; // height variation
    this.pantsColor = [
      30 + Math.random() * 40,
      28 + Math.random() * 35,
      25 + Math.random() * 30,
    ];
    this.name = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];

    // AI state
    this.dirChangeTimer = 0;
    this.direction = Math.floor(Math.random() * 4); // 0=up 1=right 2=down 3=left
    this.idleTimer = 0;
    this.fleeing = false;
    this.fleeTimer = 0;

    // Pedestrian life — behavioral state
    this.behavior = 'walk'; // walk, phone, sit, jog, crossRoad
    this.behaviorTimer = 0;
    this.jogSpeed = this.speed * 2.2;
    this.phoneCheckChance = 0.08; // chance to stop and check phone on idle
    this.crossingRoad = false;
    this.crossTarget = null; // {x, y} for road crossing destination
    this.nightFear = Math.random() < 0.4; // some NPCs hurry at night

    // Speech
    this.speechText = null;
    this.speechTimer = 0;
    this.greetCooldown = 6 + Math.random() * 12; // stagger initial greets

    // Health
    this.health = 100;
    this.dead = false;
    this.deathTimer = 0;

    // Side quest (assigned externally after spawn)
    this.sideQuest = null;   // { title, intro, outro, reward, targetX, targetY, radius }
    this.questState = null;  // null | 'available' | 'accepted' | 'done'
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.deathTimer = 5; // despawn after 5 seconds
    }
  }

  // Called each frame; returns dialogue text when greeting, null otherwise
  tryGreet(playerDist, isNight) {
    if (this.dead) return null;
    if (this.greetCooldown > 0) return null;
    if (playerDist > 72) return null;
    if (this.behavior === 'phone') return null; // busy on phone

    this.greetCooldown = 10 + Math.random() * 15;
    let lines;
    if (this.fleeing) {
      lines = NPC_FLEE_LINES;
    } else if (this.behavior === 'jog') {
      lines = ["On your left!", "Morning!", "Nice day for a run!", "*heavy breathing*"];
    } else if (isNight) {
      lines = NPC_NIGHT_GREETINGS;
    } else {
      lines = NPC_GREETINGS;
    }
    this.speechText = lines[Math.floor(Math.random() * lines.length)];
    this.speechTimer = 2.8;
    return this.speechText;
  }

  // Trigger flee speech immediately (called externally on gunfire)
  reactToGunfire() {
    if (this.dead) return;
    const line = NPC_FLEE_LINES[Math.floor(Math.random() * NPC_FLEE_LINES.length)];
    this.speechText = line;
    this.speechTimer = 2;
    this.greetCooldown = 8;
  }

  update(dt, map, tileSize, playerX, playerY, playerInVehicle, playerSpeed, timeOfDay) {
    if (this.dead) {
      this.deathTimer -= dt;
      return;
    }

    // Speech timers
    if (this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) this.speechText = null;
    }
    if (this.greetCooldown > 0) this.greetCooldown -= dt;

    // Night behavior — fearful NPCs walk faster, some head "home" (away from player)
    const isNight = timeOfDay !== undefined && (timeOfDay < 0.2 || timeOfDay > 0.8);
    const nightSpeedMult = (isNight && this.nightFear) ? 1.6 : 1;

    // Flee from fast-moving vehicles nearby
    if (playerInVehicle && playerSpeed > 150) {
      const dx = this.x - playerX;
      const dy = this.y - playerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        this.fleeing = true;
        this.fleeTimer = 1.5;
        this.behavior = 'walk';
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        this.vx = nx * this.speed * 3;
        this.vy = ny * this.speed * 3;
      }
    }

    if (this.fleeing) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.fleeing = false;
    }

    // Behavior timer
    if (this.behaviorTimer > 0) this.behaviorTimer -= dt;

    if (!this.fleeing) {
      // --- Phone checking behavior ---
      if (this.behavior === 'phone') {
        this.vx = 0;
        this.vy = 0;
        if (this.behaviorTimer <= 0) {
          this.behavior = 'walk';
        }
        // Apply movement (stationary)
        return;
      }

      // --- Sitting behavior ---
      if (this.behavior === 'sit') {
        this.vx = 0;
        this.vy = 0;
        if (this.behaviorTimer <= 0) {
          this.behavior = 'walk';
        }
        return;
      }

      // --- Road crossing ---
      if (this.behavior === 'crossRoad' && this.crossTarget) {
        const cdx = this.crossTarget.x - this.x;
        const cdy = this.crossTarget.y - this.y;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist < 8) {
          this.behavior = 'walk';
          this.crossTarget = null;
          this.crossingRoad = false;
        } else {
          // Walk briskly across road
          const crossSpeed = this.speed * 1.5;
          this.vx = (cdx / cdist) * crossSpeed;
          this.vy = (cdy / cdist) * crossSpeed;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        return;
      }

      // --- Jogging behavior ---
      if (this.behavior === 'jog') {
        if (this.behaviorTimer <= 0) {
          this.behavior = 'walk';
        }
        // Use jog speed instead of walk speed
      }

      // Idle pause
      if (this.idleTimer > 0) {
        this.idleTimer -= dt;
        this.vx = 0;
        this.vy = 0;
        return;
      }

      // Change direction periodically
      this.dirChangeTimer -= dt;
      if (this.dirChangeTimer <= 0) {
        this.direction = Math.floor(Math.random() * 4);
        this.dirChangeTimer = 2 + Math.random() * 4;

        // Randomly pick a new behavior
        const roll = Math.random();
        if (roll < this.phoneCheckChance) {
          // Stop and check phone
          this.behavior = 'phone';
          this.behaviorTimer = 3 + Math.random() * 5;
          this.speechText = null;
          return;
        } else if (roll < this.phoneCheckChance + 0.04 && !isNight) {
          // Start jogging
          this.behavior = 'jog';
          this.behaviorTimer = 8 + Math.random() * 12;
        } else if (roll < 0.2) {
          // Occasionally stop
          this.idleTimer = 1 + Math.random() * 3;
          return;
        }

        // Road crossing — look for road tile ahead, cross to other sidewalk
        if (Math.random() < 0.06) {
          const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          const [ddx, ddy] = dirs[this.direction];
          // Scan ahead for road → sidewalk pattern
          for (let step = 1; step < 6; step++) {
            const checkX = this.x + ddx * tileSize * step;
            const checkY = this.y + ddy * tileSize * step;
            const cc = Math.floor(checkX / tileSize);
            const cr = Math.floor(checkY / tileSize);
            if (cr < 0 || cc < 0 || cr >= map.length || cc >= map[0].length) break;
            const tile = map[cr][cc];
            if (tile === 1 && step > 1) {
              // Found sidewalk on other side — cross!
              this.behavior = 'crossRoad';
              this.crossingRoad = true;
              this.crossTarget = {
                x: cc * tileSize + tileSize / 2,
                y: cr * tileSize + tileSize / 2,
              };
              break;
            }
            if (tile !== 0) break; // not a road, stop scanning
          }
        }
      }

      // Move in current direction
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = dirs[this.direction];
      const moveSpeed = this.behavior === 'jog' ? this.jogSpeed : this.speed;
      this.vx = dx * moveSpeed * nightSpeedMult;
      this.vy = dy * moveSpeed * nightSpeedMult;

      // Check if next position is walkable (sidewalk, park, road)
      const nextX = this.x + this.vx * dt;
      const nextY = this.y + this.vy * dt;
      const col = Math.floor(nextX / tileSize);
      const row = Math.floor(nextY / tileSize);
      if (row >= 0 && col >= 0 && row < map.length && col < map[0].length) {
        const tile = map[row][col];
        // NPCs walk on sidewalks, parks, and sometimes roads
        if (tile !== 1 && tile !== 7 && tile !== 0 && tile !== 6) {
          this.direction = (this.direction + 1 + Math.floor(Math.random() * 2)) % 4;
          this.vx = 0;
          this.vy = 0;
        }
      }
    }

    // Apply movement
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Friction when fleeing
    if (this.fleeing) {
      this.vx *= 0.98;
      this.vy *= 0.98;
    }
  }
}

// Spawn NPCs on sidewalks
export function spawnNPCs(map, tileSize, count) {
  const npcs = [];
  const rows = map.length;
  const cols = map[0].length;
  let attempts = 0;

  while (npcs.length < count && attempts < count * 10) {
    attempts++;
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);

    // Spawn on sidewalks (1) or parks (7)
    if (map[r][c] !== 1 && map[r][c] !== 7) continue;

    const wx = c * tileSize + tileSize / 2;
    const wy = r * tileSize + tileSize / 2;

    npcs.push(new NPC(wx, wy));
  }

  return npcs;
}
