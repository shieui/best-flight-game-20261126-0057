// Sky Courier — Island Run: shared constants, colours and mission definitions.
// One clear job: every tunable number lives here so the other files stay logic-only.

export const GAME = {
  title: 'SKY COURIER',
  subtitle: 'Island Run',
  seed: 20261126,
  // World units are metres. Display converts to knots / feet for the HUD.
  cellSize: 60,
  viewDistance: 1500,
  waterLevel: 0,
  gravitySink: 6, // m/s lost per second when stalled
  minFlySpeed: 26, // m/s — below this the wing stops flying
  maxSpeed: 165, // m/s at full throttle, level
  fuelBurnBase: 0.16, // % per second at idle
  fuelBurnThrottle: 0.42, // extra % per second at full throttle
  startFuel: 100,
};

export const RUNWAY_MAIN = {
  name: 'Harbour Field',
  cx: 0, cz: 260, // centre of the strip
  heading: 0, // runway points north (+z)
  length: 620, width: 34,
  elevation: 2,
};

export const RUNWAY_FAR = {
  name: 'Palm Cay Strip',
  cx: 1180, cz: 1420,
  heading: 0,
  length: 520, width: 30,
  elevation: 2,
};

// Colours: one warm late-afternoon palette for sky, terrain and the aircraft.
export const PALETTE = {
  skyTop: '#2e6fb7',
  skyMid: '#7fb2dd',
  skyHorizon: '#ffd9a0',
  sun: '#fff3c4',
  seaDeep: '#1a4f74',
  seaShallow: '#2e7ba0',
  sand: '#e8d29a',
  grassA: '#5d9b4a',
  grassB: '#79b356',
  fieldWheat: '#d9b45c',
  fieldDark: '#3f7d3a',
  forest: '#2e6b33',
  rock: '#8a7d72',
  snow: '#f2f4f6',
  asphalt: '#3a3d42',
  asphaltLine: '#f5f2e8',
  planeRed: '#c63a2e',
  planeCream: '#f6ead2',
  planeDark: '#2b2f36',
  ringGold: '#ffc93c',
  ringNext: '#ffe9a3',
  hudInk: '#eaf6ff',
  hudDim: '#9fc3dd',
  hudWarn: '#ffb03a',
  hudBad: '#ff5a4a',
  hudGood: '#7be495',
};

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Run',
    blurb: 'Thread all 8 sky rings over the island, then land back at Harbour Field.',
    rings: 8,
    fuel: 100,
    timeLimit: 360,
    startRunway: 'main',
  },
  {
    id: 'courier',
    name: 'Courier Delivery',
    blurb: 'Carry the mail pouch through 5 rings to Palm Cay Strip and land there before the fuel runs dry.',
    rings: 5,
    fuel: 100,
    timeLimit: 420,
    startRunway: 'main',
    landAt: 'far',
  },
  {
    id: 'landing',
    name: 'Landing Challenge',
    blurb: 'Take off, fly one circuit of the bay, and grease the landing on Harbour Field. Judged on touchdown.',
    rings: 2,
    fuel: 100,
    timeLimit: 300,
    startRunway: 'main',
  },
];

export const CONTROLS = [
  ['W / S or ↑ / ↓', 'Pitch down / up'],
  ['A / D or ← / →', 'Bank left / right'],
  ['Shift / Ctrl', 'Throttle up / down'],
  ['R / F', 'Throttle up / down'],
  ['Hold mouse + move', 'Steer toward the pointer'],
  ['Mouse wheel', 'Throttle'],
  ['Space', 'Airbrake'],
  ['P', 'Pause'],
  ['N', 'Sound on / off'],
  ['Enter', 'Start mission'],
];
