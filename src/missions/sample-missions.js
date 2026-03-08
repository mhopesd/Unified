// Sample missions — these demonstrate the creator JSON format.
// In the marketplace, creators will submit missions in this format.

export const SAMPLE_MISSIONS = [
  {
    id: 'mission-explore-ruins',
    name: 'Explore the Eastern Ruins',
    author: 'WorldBuilder',
    description: 'Strange lights have been spotted near the eastern ruins. Investigate the area and report back.',
    version: '1.0',
    triggerZone: { x: 520, y: 480, radius: 50 },
    objectives: [
      {
        type: 'goto',
        description: 'Travel to the eastern ruins',
        target: { x: 1200, y: 600, radius: 45 },
      },
      {
        type: 'goto',
        description: 'Investigate the light source',
        target: { x: 1350, y: 550, radius: 35 },
      },
      {
        type: 'goto',
        description: 'Return to the village',
        target: { x: 520, y: 480, radius: 50 },
      },
    ],
    reward: { xp: 150 },
  },
  {
    id: 'mission-lost-supplies',
    name: 'Lost Supply Run',
    author: 'QuestMaker42',
    description: 'A supply caravan went missing along the northern road. Find the supplies and bring them back.',
    version: '1.0',
    triggerZone: { x: 480, y: 440, radius: 45 },
    objectives: [
      {
        type: 'goto',
        description: 'Search the northern road',
        target: { x: 600, y: 200, radius: 40 },
      },
      {
        type: 'collect',
        description: 'Recover the lost supplies',
        target: { x: 750, y: 180, radius: 35 },
        item: 'Supply Crate',
      },
      {
        type: 'goto',
        description: 'Deliver supplies to the village',
        target: { x: 480, y: 440, radius: 50 },
      },
    ],
    reward: { xp: 200, item: 'Supply Key' },
  },
  {
    id: 'mission-patrol',
    name: 'Village Perimeter Patrol',
    author: 'GuardCaptain',
    description: 'The village needs its perimeter checked. Walk the patrol route.',
    version: '1.0',
    triggerZone: { x: 550, y: 520, radius: 40 },
    objectives: [
      {
        type: 'goto',
        description: 'Check the north watchtower',
        target: { x: 500, y: 250, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Check the east gate',
        target: { x: 900, y: 500, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Check the south bridge',
        target: { x: 500, y: 800, radius: 40 },
      },
      {
        type: 'goto',
        description: 'Report back',
        target: { x: 550, y: 520, radius: 45 },
      },
    ],
    reward: { xp: 100 },
  },
];
