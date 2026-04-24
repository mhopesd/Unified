// Mission state machine — manages active missions and objective tracking
// Supports: goto, collect, interact, escort, survive, race, stealth

export const MissionState = {
  AVAILABLE: 'available',     // In world, player can trigger
  ACTIVE: 'active',           // Player accepted, tracking objectives
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export class MissionEngine {
  constructor() {
    this.missions = [];           // All loaded mission definitions
    this.activeMissions = [];     // Currently active (accepted) missions
    this.completedIds = new Set();
  }

  // Load a mission definition into the world
  loadMission(missionData) {
    this.missions.push({
      data: missionData,
      state: MissionState.AVAILABLE,
      currentObjective: 0,
      objectiveState: {},  // per-objective state (timers, collected items, etc.)
    });
  }

  // Load multiple missions
  loadMissions(missionArray) {
    missionArray.forEach(m => this.loadMission(m));
  }

  // Check if player is near any available mission trigger zone
  getAvailableMissionNear(playerX, playerY) {
    for (const mission of this.missions) {
      if (mission.state !== MissionState.AVAILABLE) continue;
      if (this.completedIds.has(mission.data.id)) continue;
      const tz = mission.data.triggerZone;
      const dist = Math.sqrt((playerX - tz.x) ** 2 + (playerY - tz.y) ** 2);
      if (dist < tz.radius) return mission;
    }
    return null;
  }

  // Accept a mission
  acceptMission(mission) {
    mission.state = MissionState.ACTIVE;
    mission.currentObjective = 0;
    mission.objectiveState = {};
    this.activeMissions.push(mission);
  }

  // Fail a mission
  failMission(mission, reason) {
    mission.state = MissionState.FAILED;
    mission.failReason = reason;
    this.activeMissions = this.activeMissions.filter(m => m !== mission);
    // Reset to available after a delay (allow retry)
    setTimeout(() => {
      if (mission.state === MissionState.FAILED) {
        mission.state = MissionState.AVAILABLE;
        mission.currentObjective = 0;
        mission.objectiveState = {};
      }
    }, 5000);
  }

  // Update active missions — check objective completion
  // Returns { objectiveCompleted, missionCompleted, missionFailed, failMessage }
  update(playerX, playerY, dt, context = {}) {
    const result = {
      objectiveCompleted: false,
      missionCompleted: false,
      missionFailed: false,
      failMessage: '',
    };

    for (const mission of this.activeMissions) {
      if (mission.state !== MissionState.ACTIVE) continue;
      const obj = mission.data.objectives[mission.currentObjective];
      if (!obj) continue;

      const target = obj.target;
      const dist = Math.sqrt((playerX - target.x) ** 2 + (playerY - target.y) ** 2);
      const inRadius = dist < (target.radius || 40);

      // Init objective state if needed
      if (!mission.objectiveState[mission.currentObjective]) {
        mission.objectiveState[mission.currentObjective] = {
          timer: 0,
          collected: 0,
          checkpoints: 0,
          detectedTimer: 0,
        };
      }
      const os = mission.objectiveState[mission.currentObjective];

      let completed = false;

      switch (obj.type) {
        case 'goto':
          completed = inRadius;
          break;

        case 'collect':
          // Check if player is near any collectible for this objective
          if (inRadius) {
            os.collected++;
            completed = os.collected >= (obj.quantity || 1);
          }
          break;

        case 'interact':
          completed = inRadius; // same as goto for now
          break;

        case 'escort': {
          // Player must stay near the escort target NPC
          // obj.target is the destination, obj.escortNpcPos is updated externally
          const escortDist = obj._escortNpcDist || 0;
          // Fail if too far from escort NPC
          if (escortDist > (obj.maxDistance || 200)) {
            os.detectedTimer += dt;
            if (os.detectedTimer > 3) {
              this.failMission(mission, 'You lost the escort target!');
              result.missionFailed = true;
              result.failMessage = 'You lost the escort target!';
              continue;
            }
          } else {
            os.detectedTimer = Math.max(0, os.detectedTimer - dt);
          }
          // Complete when escort NPC reaches destination
          if (obj._escortAtTarget) completed = true;
          break;
        }

        case 'survive': {
          // Survive for X seconds at a location
          const surviveTime = obj.duration || 30;
          if (inRadius) {
            os.timer += dt;
            // Update HUD progress
            obj._progress = Math.min(1, os.timer / surviveTime);
            obj._timeLeft = Math.max(0, surviveTime - os.timer);
            completed = os.timer >= surviveTime;
          } else {
            // Timer pauses if player leaves zone
            obj._progress = os.timer / surviveTime;
            obj._timeLeft = surviveTime - os.timer;
          }
          break;
        }

        case 'race': {
          // Race through checkpoints with time limit
          if (obj.timeLimit) {
            os.timer += dt;
            obj._timeLeft = Math.max(0, obj.timeLimit - os.timer);
            if (os.timer > obj.timeLimit) {
              this.failMission(mission, 'Time\'s up!');
              result.missionFailed = true;
              result.failMessage = 'Time\'s up!';
              continue;
            }
          }
          // Race objectives use standard goto logic
          completed = inRadius;
          break;
        }

        case 'stealth': {
          // Reach target without being detected
          // Detection is managed externally — context.detected flag
          if (context.playerDetected) {
            os.detectedTimer += dt;
            if (os.detectedTimer > 2) {
              this.failMission(mission, 'You were spotted!');
              result.missionFailed = true;
              result.failMessage = 'You were spotted!';
              continue;
            }
          } else {
            os.detectedTimer = Math.max(0, os.detectedTimer - dt * 2);
          }
          obj._detected = os.detectedTimer > 0;
          completed = inRadius;
          break;
        }

        default:
          completed = inRadius;
      }

      // Check time limit on any objective
      if (obj.timeLimit && obj.type !== 'race') {
        os.timer += dt;
        obj._timeLeft = Math.max(0, obj.timeLimit - os.timer);
        if (os.timer > obj.timeLimit) {
          this.failMission(mission, 'Time\'s up!');
          result.missionFailed = true;
          result.failMessage = 'Time\'s up!';
          continue;
        }
      }

      if (completed) {
        mission.currentObjective++;
        result.objectiveCompleted = true;
        if (mission.currentObjective >= mission.data.objectives.length) {
          mission.state = MissionState.COMPLETED;
          this.completedIds.add(mission.data.id);
          result.missionCompleted = true;
        }
      }
    }

    // Remove completed/failed from active list
    this.activeMissions = this.activeMissions.filter(m => m.state === MissionState.ACTIVE);

    return result;
  }

  // Get current objective text for HUD
  getActiveObjectiveText() {
    if (this.activeMissions.length === 0) return null;
    const m = this.activeMissions[0];
    const obj = m.data.objectives[m.currentObjective];
    if (!obj) return null;

    const info = {
      missionName: m.data.name,
      objectiveText: obj.description || 'Complete!',
      progress: `${m.currentObjective + 1}/${m.data.objectives.length}`,
      objectiveType: obj.type,
    };

    // Add type-specific info
    if (obj._timeLeft !== undefined) {
      info.timeLeft = Math.ceil(obj._timeLeft);
    }
    if (obj._progress !== undefined) {
      info.surviveProgress = obj._progress;
    }
    if (obj._detected) {
      info.detected = true;
    }

    return info;
  }

  // Get all trigger zones and objective markers for rendering
  getMarkers() {
    const markers = [];

    // Available mission trigger zones
    for (const m of this.missions) {
      if (m.state === MissionState.AVAILABLE && !this.completedIds.has(m.data.id)) {
        markers.push({
          type: 'trigger',
          x: m.data.triggerZone.x,
          y: m.data.triggerZone.y,
          radius: m.data.triggerZone.radius,
          label: m.data.name,
        });
      }
    }

    // Active objective targets
    for (const m of this.activeMissions) {
      const obj = m.data.objectives[m.currentObjective];
      if (obj) {
        markers.push({
          type: 'objective',
          x: obj.target.x,
          y: obj.target.y,
          radius: obj.target.radius || 40,
          label: obj.description,
        });
      }
    }

    return markers;
  }
}
