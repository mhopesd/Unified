// Sample missions — demonstrate the full mission JSON format.
// These ship with the game and validate against the schema.

export const SAMPLE_MISSIONS = [
  {
    id: 'mission-docks-briefcase',
    name: 'The Docks Drop',
    author: 'WorldBuilder',
    description: 'An informant at the docks has a briefcase for you. Pick it up and deliver it downtown before the gang catches on.',
    difficulty: 'medium',
    estimated_minutes: 5,
    triggerZone: { x: 600, y: 2100, radius: 50, type: 'location' },
    objectives: [
      {
        type: 'goto',
        description: 'Meet the informant at the docks',
        target: { x: 800, y: 2200, radius: 45 },
      },
      {
        type: 'collect',
        description: 'Pick up the briefcase',
        target: { x: 820, y: 2210, radius: 30 },
        item: 'briefcase',
      },
      {
        type: 'deliver',
        description: 'Deliver the briefcase downtown',
        target: { x: 1600, y: 1200, radius: 50 },
        item: 'briefcase',
      },
    ],
    spawn_entities: [
      { type: 'npc', archetype: 'informant', position: [800, 2200], behavior: 'idle' },
      { type: 'npc', archetype: 'gang_member', position: [900, 2250], behavior: 'patrol' },
      { type: 'npc', archetype: 'gang_member', position: [750, 2300], behavior: 'patrol' },
      { type: 'item', archetype: 'briefcase', position: [820, 2210] },
    ],
    dialogue: [
      {
        trigger_objective_id: 'obj-0',
        npc_name: 'Informant',
        lines: [
          { speaker: 'Informant', text: 'You made it. Take this and get out of here, fast.' },
          { speaker: 'Player', text: 'Where do I take it?' },
          { speaker: 'Informant', text: 'Downtown office. Corner of 5th and Main. Go.' },
        ],
      },
    ],
    reward: { cash: 2500, xp: 200 },
    fail_conditions: [
      { type: 'player_death', message: 'You were taken out before the delivery.' },
      { type: 'time_expired', message: 'Too slow — the gang intercepted the package.' },
    ],
  },
  {
    id: 'mission-old-town-patrol',
    name: 'Old Town Patrol',
    author: 'GuardCaptain',
    description: 'Walk the Old Town perimeter. Reports of suspicious activity near the markets.',
    difficulty: 'easy',
    estimated_minutes: 3,
    triggerZone: { x: 400, y: 400, radius: 45 },
    objectives: [
      {
        type: 'goto',
        description: 'Check the north market',
        target: { x: 600, y: 200, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Check the east gate',
        target: { x: 1000, y: 500, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Check the south alley',
        target: { x: 500, y: 850, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Report back',
        target: { x: 400, y: 400, radius: 50 },
      },
    ],
    reward: { cash: 800, xp: 100 },
    fail_conditions: [
      { type: 'player_death', message: 'You were ambushed on patrol.' },
    ],
  },
  {
    id: 'mission-industrial-heist',
    name: 'Scrapyard Showdown',
    author: 'QuestMaker42',
    description: 'A gang boss is holed up in the Industrial scrapyard. Take him down and grab the evidence.',
    difficulty: 'hard',
    estimated_minutes: 8,
    triggerZone: { x: 2600, y: 1800, radius: 50 },
    objectives: [
      {
        type: 'goto',
        description: 'Reach the scrapyard entrance',
        target: { x: 2800, y: 2000, radius: 45 },
      },
      {
        type: 'eliminate',
        description: 'Take out the gang boss',
        target: { x: 2900, y: 2100, radius: 40 },
        target_npc: 'boss',
      },
      {
        type: 'collect',
        description: 'Grab the evidence file',
        target: { x: 2920, y: 2110, radius: 25 },
        item: 'evidence_file',
      },
      {
        type: 'goto',
        description: 'Escape to the highway',
        target: { x: 2500, y: 1700, radius: 60 },
      },
    ],
    spawn_entities: [
      { type: 'npc', archetype: 'boss', position: [2900, 2100], behavior: 'hostile' },
      { type: 'npc', archetype: 'gang_member', position: [2850, 2050], behavior: 'hostile' },
      { type: 'npc', archetype: 'gang_member', position: [2950, 2080], behavior: 'patrol' },
      { type: 'npc', archetype: 'gang_member', position: [2880, 2150], behavior: 'patrol' },
      { type: 'item', archetype: 'evidence_file', position: [2920, 2110] },
      { type: 'item', archetype: 'medkit', position: [2800, 2020] },
      { type: 'vehicle', archetype: 'truck', position: [2700, 1900] },
    ],
    reward: { cash: 7500, xp: 400, reputation: 25 },
    fail_conditions: [
      { type: 'player_death', message: 'The gang got to you first.' },
      { type: 'npc_death', target_npc: 'informant', message: 'The evidence was destroyed with the target.' },
    ],
  },
];
