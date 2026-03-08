// Mission state machine — manages active missions and objective tracking

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
    });
  }

  // Load multiple missions
  loadMissions(missionArray) {
    missionArray.forEach(m => this.loadMission(m));
  }

  // Check if player is near any available mission trigger zone
  getAvailableMissionNear(playerX, playerY) {
    const px = playerX;
    const py = playerY;
    for (const mission of this.missions) {
      if (mission.state !== MissionState.AVAILABLE) continue;
      if (this.completedIds.has(mission.data.id)) continue;
      const tz = mission.data.triggerZone;
      const dist = Math.sqrt((px - tz.x) ** 2 + (py - tz.y) ** 2);
      if (dist < tz.radius) return mission;
    }
    return null;
  }

  // Accept a mission
  acceptMission(mission) {
    mission.state = MissionState.ACTIVE;
    mission.currentObjective = 0;
    this.activeMissions.push(mission);
  }

  // Update active missions — check objective completion
  update(playerX, playerY) {
    const px = playerX;
    const py = playerY;

    for (const mission of this.activeMissions) {
      if (mission.state !== MissionState.ACTIVE) continue;
      const obj = mission.data.objectives[mission.currentObjective];
      if (!obj) continue;

      const target = obj.target;
      const dist = Math.sqrt((px - target.x) ** 2 + (py - target.y) ** 2);

      if (dist < (target.radius || 40)) {
        // Objective complete
        mission.currentObjective++;
        if (mission.currentObjective >= mission.data.objectives.length) {
          mission.state = MissionState.COMPLETED;
          this.completedIds.add(mission.data.id);
        }
      }
    }

    // Remove completed from active list
    this.activeMissions = this.activeMissions.filter(m => m.state === MissionState.ACTIVE);
  }

  // Get current objective text for HUD
  getActiveObjectiveText() {
    if (this.activeMissions.length === 0) return null;
    const m = this.activeMissions[0];
    const obj = m.data.objectives[m.currentObjective];
    return {
      missionName: m.data.name,
      objectiveText: obj ? obj.description : 'Complete!',
      progress: `${m.currentObjective + 1}/${m.data.objectives.length}`,
    };
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
