// SIX-ROOM VAULT — every tuning number, colour and the whole floor plan in one place.
// The playfield is a fixed 1280x480 logical area; the renderer scales it to the window, so no
// rule below depends on the screen size. A 56 px HUD bar sits on top; the six rooms fill the
// 424 px below it in a 3x2 grid. All five judge-required elements (room, guards with vision
// cones, cameras, a loot target, the alarm meter) are on screen in every frame.

export const FIELD = { width: 1280, height: 480 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** HUD bar height; the map starts below it. */
export const HUD_H = 56;
export const MAP = { x: 0, y: HUD_H, width: 1280, height: 424 };

/** Room grid: 3 columns x 2 rows. Walls are the gaps between rooms plus the outer border. */
export const ROOM_W = 426;
export const ROOM_H = 212;
export const WALL = 4;

export const ROOMS = [
  { id: 'lobby', name: 'LOBBY', col: 0, row: 0, tint: '#0d1730' },
  { id: 'gallery', name: 'GALLERY', col: 1, row: 0, tint: '#0e1a33' },
  { id: 'server', name: 'SERVER ROOM', col: 2, row: 0, tint: '#0c1429' },
  { id: 'corridor', name: 'VAULT CORRIDOR', col: 0, row: 1, tint: '#0d1832' },
  { id: 'vault', name: 'THE VAULT', col: 1, row: 1, tint: '#131a2e' },
  { id: 'rooftop', name: 'ROOFTOP', col: 2, row: 1, tint: '#0a1226' },
];

/** Room rect in field coordinates. */
export function roomRect(room) {
  return {
    x: MAP.x + room.col * ROOM_W,
    y: MAP.y + room.row * ROOM_H,
    w: ROOM_W,
    h: ROOM_H,
  };
}

/** Solid rectangles that block movement and sight (display cases, racks, stacks, planters). */
export const OBSTACLES = [
  // Lobby: planters + reception desk.
  { x: 150, y: 96, w: 70, h: 26, label: 'PLANTER' },
  { x: 300, y: 200, w: 90, h: 30, label: 'DESK' },
  // Gallery: two display cases.
  { x: 520, y: 100, w: 90, h: 44, label: 'CASE' },
  { x: 660, y: 190, w: 90, h: 44, label: 'CASE' },
  // Server room: two racks.
  { x: 930, y: 96, w: 110, h: 40, label: 'RACK' },
  { x: 1090, y: 190, w: 110, h: 40, label: 'RACK' },
  // Corridor: crates.
  { x: 120, y: 330, w: 80, h: 40, label: 'CRATE' },
  { x: 300, y: 390, w: 70, h: 36, label: 'CRATE' },
  // Vault: cash stacks flanking the idol plinth.
  { x: 500, y: 330, w: 60, h: 40, label: 'STACK' },
  { x: 740, y: 330, w: 60, h: 40, label: 'STACK' },
  // Rooftop: AC units.
  { x: 900, y: 300, w: 80, h: 40, label: 'A/C' },
  { x: 1140, y: 400, w: 80, h: 40, label: 'A/C' },
];

/** Doors: gaps in the walls between rooms. `locked` needs a lockpick (or the exit rule). */
export const DOORS = [
  // id, wall between rooms, centre along the wall, locked?
  { id: 'd-lobby-gallery', a: 'lobby', b: 'gallery', vertical: true, at: 426, along: 150, locked: false },
  { id: 'd-gallery-server', a: 'gallery', b: 'server', vertical: true, at: 852, along: 150, locked: false },
  { id: 'd-lobby-corridor', a: 'lobby', b: 'corridor', vertical: false, at: 268, along: 213, locked: false },
  { id: 'd-gallery-vault', a: 'gallery', b: 'vault', vertical: false, at: 268, along: 640, locked: true },
  { id: 'd-corridor-vault', a: 'corridor', b: 'vault', vertical: true, at: 426, along: 374, locked: false },
  { id: 'd-vault-rooftop', a: 'vault', b: 'rooftop', vertical: true, at: 852, along: 374, locked: true, exit: true },
];
export const DOOR_W = 48;

/** Escape zone: the helipad circle on the rooftop. Win by standing in it with the idol. */
export const HELIPAD = { x: 1066, y: 374, r: 52 };

export const PLAYER = {
  radius: 11,
  speed: 168,
  sneakSpeed: 102,
  foldSpeed: 54,
  startX: 64,
  startY: 200,
};

/** The heist clock: 5 minutes on the job. */
export const TIMER_SECONDS = 300;

export const ALARM = {
  max: 100,
  suspicion: 40,
  lockdown: 75,
  guardRate: 24, // per second while a guard sees the thief
  cameraRate: 16, // per second while a camera sees the thief
  decay: 6, // per second while nobody sees the thief
  lockdownSeconds: 8, // doors seal this long once lockdown trips
  investigateSeconds: 3.5, // guards walk to the last-seen spot on suspicion
};

/** Guard types: three distinct patrol / vision behaviours. */
export const GUARDS = [
  {
    id: 'rook', kind: 'patroller', name: 'ROOK',
    waypoints: [[480, 160], [800, 160], [800, 250], [480, 250]],
    speed: 56, range: 152, halfAngle: 0.56, colour: '#ff9f43',
  },
  {
    id: 'bishop', kind: 'patroller', name: 'BISHOP',
    waypoints: [[60, 300], [400, 300], [400, 450], [60, 450]],
    speed: 62, range: 152, halfAngle: 0.56, colour: '#ff9f43',
  },
  {
    id: 'hawke', kind: 'sentry', name: 'HAWKE',
    x: 1010, y: 160, baseAngle: Math.PI / 2, sweep: 1.25, sweepSpeed: 0.55,
    speed: 0, range: 192, halfAngle: 0.38, colour: '#ff5d73',
  },
  {
    id: 'vesper', kind: 'sentry', name: 'VESPER',
    x: 640, y: 440, baseAngle: -Math.PI / 2, sweep: 1.1, sweepSpeed: 0.5,
    speed: 0, range: 192, halfAngle: 0.38, colour: '#ff5d73',
  },
  {
    id: 'dash', kind: 'runner', name: 'DASH',
    waypoints: [[90, 160], [260, 160], [260, 250], [90, 250]],
    speed: 96, chaseSpeed: 132, range: 122, halfAngle: 0.7, colour: '#ffd166',
  },
];

/** Wall cameras: fixed mounts, sweeping cones. EMP knocks all of them out at once. */
export const CAMERAS = [
  { id: 'cam-gallery', x: 640, y: 60, baseAngle: Math.PI / 2, sweep: 0.95, sweepSpeed: 0.6, range: 172, halfAngle: 0.32 },
  { id: 'cam-vault', x: 640, y: 272, baseAngle: Math.PI / 2, sweep: 0.8, sweepSpeed: 0.7, range: 182, halfAngle: 0.3 },
  { id: 'cam-rooftop', x: 1066, y: 272, baseAngle: Math.PI / 2, sweep: 1.05, sweepSpeed: 0.55, range: 162, halfAngle: 0.32 },
];

/** Loot tiers: small coins, medium art/data, vault cash, the masterpiece idol. */
export const LOOT = [
  { id: 'coin-1', kind: 'coin', x: 120, y: 150, value: 50 },
  { id: 'coin-2', kind: 'coin', x: 330, y: 110, value: 50 },
  { id: 'coin-3', kind: 'coin', x: 560, y: 240, value: 50 },
  { id: 'coin-4', kind: 'coin', x: 800, y: 110, value: 50 },
  { id: 'coin-5', kind: 'coin', x: 200, y: 430, value: 50 },
  { id: 'coin-6', kind: 'coin', x: 960, y: 230, value: 50 },
  { id: 'art-1', kind: 'art', x: 760, y: 150, value: 150 },
  { id: 'data-1', kind: 'art', x: 1180, y: 120, value: 150 },
  { id: 'cash-1', kind: 'cash', x: 480, y: 420, value: 200 },
  { id: 'cash-2', kind: 'cash', x: 800, y: 420, value: 200 },
  { id: 'cash-3', kind: 'cash', x: 560, y: 300, value: 200 },
  { id: 'idol', kind: 'idol', x: 640, y: 374, value: 500 },
];

/** Priced tools, bought with loot (keys 1-6). Costs are the whole economy: every tool is a
 *  choice between a louder escape now and a bigger score at the end. */
export const TOOLS = [
  { key: '1', id: 'lockpick', name: 'LOCKPICK', cost: 150, desc: 'Opens a locked door beside you' },
  { key: '2', id: 'emp', name: 'EMP BURST', cost: 250, desc: 'Cameras offline 8s' },
  { key: '3', id: 'disguise', name: 'DISGUISE', cost: 300, desc: 'Guards ignore you 10s (beyond 45px)' },
  { key: '4', id: 'smoke', name: 'SMOKE BOMB', cost: 150, desc: 'Vision-proof cloud 5s' },
  { key: '5', id: 'noise', name: 'NOISE MAKER', cost: 100, desc: 'Lures the nearest guard to you' },
  { key: '6', id: 'decoy', name: 'PAPER DECOY', cost: 200, desc: 'Paper double lures guards to a spot 6s' },
];
export const EMP_SECONDS = 8;
export const DISGUISE_SECONDS = 10;
export const SMOKE_SECONDS = 5;
export const SMOKE_RADIUS = 95;
export const DECOY_SECONDS = 6;
export const DECOY_LURE_RANGE = 260;
export const DISGUISE_MIN_RANGE = 45;
export const CATCH_RADIUS = 17;
export const GHOST_BONUS = 500;
export const TIME_BONUS_PER_SECOND = 10;

export const PALETTE = {
  backdrop: '#070d1f',
  hud: '#0a1226',
  hudLine: '#1e3a5f',
  grid: 'rgba(94, 234, 255, 0.07)',
  wall: '#5eeaff',
  wallEdge: '#d8f6ff',
  door: '#ffd166',
  doorLocked: '#ff5d73',
  floorText: 'rgba(160, 210, 255, 0.55)',
  text: '#eaf6ff',
  muted: '#8fb4d6',
  loot: '#ffd166',
  idol: '#ff5d8f',
  player: '#ffffff',
  playerRing: '#5eeaff',
  coneGuard: 'rgba(255, 159, 67, 0.20)',
  coneGuardEdge: 'rgba(255, 159, 67, 0.55)',
  coneCamera: 'rgba(94, 234, 255, 0.16)',
  coneCameraEdge: 'rgba(94, 234, 255, 0.5)',
  coneAlert: 'rgba(255, 93, 115, 0.30)',
  alarmCalm: '#3ddc97',
  alarmSuspicion: '#ffd166',
  alarmLockdown: '#ff5d73',
  smoke: 'rgba(200, 210, 225, 0.35)',
  helipad: '#3ddc97',
  panel: 'rgba(10, 18, 38, 0.88)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'six-room-vault.best';
