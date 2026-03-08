// Mission JSON schema and validation
// Creators define missions as JSON matching this structure

/*
  Mission Schema:
  {
    "id": "mission-uuid",
    "name": "The Lost Artifact",
    "author": "CreatorName",
    "description": "Find the ancient artifact hidden in the ruins.",
    "version": "1.0",
    "triggerZone": { "x": 500, "y": 300, "radius": 50 },
    "objectives": [
      {
        "type": "goto",
        "description": "Go to the ruins entrance",
        "target": { "x": 800, "y": 600, "radius": 40 }
      },
      {
        "type": "collect",
        "description": "Pick up the artifact",
        "target": { "x": 900, "y": 650, "radius": 30 },
        "item": "Ancient Artifact"
      },
      {
        "type": "goto",
        "description": "Return to the quest giver",
        "target": { "x": 500, "y": 300, "radius": 50 }
      }
    ],
    "reward": { "xp": 100, "item": "Gold Medallion" }
  }
*/

export function validateMission(data) {
  const errors = [];

  if (!data.id) errors.push('Missing "id"');
  if (!data.name) errors.push('Missing "name"');
  if (!data.author) errors.push('Missing "author"');
  if (!data.triggerZone) errors.push('Missing "triggerZone"');
  if (!data.objectives || !Array.isArray(data.objectives) || data.objectives.length === 0) {
    errors.push('Must have at least one objective');
  }

  if (data.triggerZone) {
    if (typeof data.triggerZone.x !== 'number') errors.push('triggerZone.x must be a number');
    if (typeof data.triggerZone.y !== 'number') errors.push('triggerZone.y must be a number');
    if (typeof data.triggerZone.radius !== 'number') errors.push('triggerZone.radius must be a number');
  }

  if (data.objectives) {
    data.objectives.forEach((obj, i) => {
      if (!['goto', 'collect', 'interact'].includes(obj.type)) {
        errors.push(`Objective ${i}: invalid type "${obj.type}" (use goto, collect, or interact)`);
      }
      if (!obj.target) {
        errors.push(`Objective ${i}: missing target`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
