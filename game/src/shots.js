// The screenshot scenes behind ?shot=title|gallery|vault|escape. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (follow
// a waypoint route, wait when a guard or camera can see the thief, buy the lockpick at the
// locked Vault door), so the frame is what a real game looks like and the same seed always
// gives the same frame. Every shot shows all five required elements: the room, guards with
// vision cones, cameras, a loot target and the alarm meter.

import { MAP, STEP } from './config.js';
import { EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 6;
const ROUTE_LIMIT_SECONDS = 90;

/** Geometric visibility: would a thief at (px, py) be inside this viewer's cone with a clear
 *  line of sight? */
function canSeeAt(viewer, range, halfAngle, px, py, state, world) {
  const dx = px - viewer.x;
  const dy = py - viewer.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  let diff = Math.atan2(dy, dx) - viewer.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > halfAngle) return false;
  const solids = world.blockers();
  for (let d = 6; d < dist; d += 6) {
    const px2 = viewer.x + (dx / dist) * d;
    const py2 = viewer.y + (dy / dist) * d;
    for (let i = 0; i < solids.length; i += 1) {
      const r = solids[i];
      if (px2 >= r.x && px2 <= r.x + r.w && py2 >= r.y && py2 <= r.y + r.h) return false;
    }
  }
  return true;
}

/** Geometric visibility: is the thief inside this viewer's cone with a clear line of sight? */
function canSee(viewer, range, halfAngle, state, world) {
  return canSeeAt(viewer, range, halfAngle, state.player.x, state.player.y, state, world);
}

/** The nearest guard or live camera that can see the thief right now, or a guard standing close
 *  enough to catch them next step; null when the thief is safe. A distant guard's sighting is
 *  not worth breaking stride for — the alarm cost is small and its cone sweeps past. */
function threat(state, world) {
  let best = null;
  let bestD = Infinity;
  for (const g of state.guards) {
    const d = Math.hypot(g.x - state.player.x, g.y - state.player.y);
    if (d < 60 || (d < 120 && canSee(g, g.range, g.halfAngle, state, world))) {
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
  }
  for (const cam of state.cameras) {
    if (state.empTimer > 0) continue;
    if (canSee(cam, cam.range, cam.halfAngle, state, world)) {
      const d = Math.hypot(cam.x - state.player.x, cam.y - state.player.y);
      if (d < bestD) {
        bestD = d;
        best = cam;
      }
    }
  }
  return best;
}

/** Would a thief standing at (x, y) be seen by anyone right now? */
function seenAt(x, y, state, world) {
  if (state.smokeTimer > 0 && Math.hypot(x - state.smokeX, y - state.smokeY) < 95) return false;
  for (const g of state.guards) {
    if (Math.hypot(g.x - x, g.y - y) < 40) return true;
    if (canSeeAt(g, g.range, g.halfAngle, x, y, state, world)) return true;
  }
  for (const cam of state.cameras) {
    if (state.empTimer > 0) continue;
    if (canSeeAt(cam, cam.range, cam.halfAngle, x, y, state, world)) return true;
  }
  return false;
}

/** Is the point (x, y) inside this viewer's cone (angle and range only — no line-of-sight
 *  marching, so it stays cheap enough to score every steering candidate)? */
function inCone(viewer, range, halfAngle, x, y) {
  const dx = x - viewer.x;
  const dy = y - viewer.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  let diff = Math.atan2(dy, dx) - viewer.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= halfAngle;
}

/** Goal-aware evasion: sample 8 steps around the thief and take the one that best balances
 *  getting away from the nearest threat, staying out of every vision cone, and getting closer
 *  to the waypoint. Fleeing straight away from a guard corners the thief against a wall, and
 *  distance alone cannot escape a cone that tracks the thief — the cone penalty makes the
 *  thief sidestep out of the wedge instead. */
function steerMove(state, world, target) {
  const p = state.player;
  const threats = state.guards.concat(state.cameras.filter((c) => state.empTimer <= 0));
  let best = null;
  let bestScore = -Infinity;
  for (let a = 0; a < 8; a += 1) {
    const ang = (a / 8) * Math.PI * 2;
    const nx = p.x + Math.cos(ang) * 40;
    const ny = p.y + Math.sin(ang) * 40;
    if (nx < MAP.x + 14 || nx > MAP.x + MAP.width - 14 || ny < MAP.y + 14 || ny > MAP.y + MAP.height - 14) continue;
    let blocked = false;
    for (const r of world.blockers()) {
      if (nx > r.x - 12 && nx < r.x + r.w + 12 && ny > r.y - 12 && ny < r.y + r.h + 12) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const dTarget = Math.hypot(target[0] - nx, target[1] - ny);
    let dThreat = Infinity;
    let conePenalty = 0;
    for (const t of threats) {
      dThreat = Math.min(dThreat, Math.hypot(t.x - nx, t.y - ny));
      if (inCone(t, t.range, t.halfAngle, nx, ny)) conePenalty = 300;
    }
    const score = 2 * Math.min(dThreat, 220) - dTarget - conePenalty;
    if (score > bestScore) {
      bestScore = score;
      best = { x: Math.cos(ang), y: Math.sin(ang) };
    }
  }
  return best || { x: 0, y: 0 };
}

/**
 * Walk `waypoints` in order. A thief who is seen does NOT stand still (a patroller would walk
 * straight into a waiting thief and catch them): they break away from the threat at full speed
 * until the cone passes, then carry on toward the waypoint. `onStep` runs each fixed step and
 * may buy tools (it receives the world and may return a tool mask). Returns true when the
 * route finished, false on the time cap or game over.
 */
function runRoute(world, waypoints, seconds, onStep) {
  const state = world.state;
  const limit = Math.round(seconds / STEP);
  let index = 0;
  for (let i = 0; i < limit; i += 1) {
    if (state.over) return false;
    if (index >= waypoints.length) return true;
    const target = waypoints[index];
    const dx = target[0] - state.player.x;
    const dy = target[1] - state.player.y;
    if (Math.hypot(dx, dy) < 12) {
      index += 1;
      continue;
    }
    const danger = threat(state, world);
    let move;
    if (danger) move = steerMove(state, world, target);
    else {
      const len = Math.hypot(dx, dy);
      move = { x: dx / len, y: dy / len };
    }
    let toolMask = 0;
    if (onStep) toolMask = onStep(world, state) || 0;
    world.step(STEP, move, false, toolMask);
  }
  return index >= waypoints.length;
}

const GALLERY_ROUTE = [
  [120, 150], [330, 110], [426, 150], [520, 200], [560, 240], [700, 180], [760, 150], [640, 180],
];
const VAULT_ROUTE = [
  // Around Vesper, the Vault sentry at (640, 440): never walk straight through them. The
  // route stops at the vault floor's south side so the vault shot still shows the idol
  // glowing ahead. It sweeps the vault floor first (cash-3, then cash-1 below the stacks)
  // so the EMP is affordable before the approach to the idol.
  [640, 240], [640, 262], [580, 330], [560, 300], [600, 420], [480, 420],
];
const IDOL_ROUTE = [[640, 374]];
const ESCAPE_ROUTE = [
  [700, 374], [853, 374], [960, 374], [1066, 374],
];

/** At the locked Gallery→Vault door, buy the lockpick as soon as the loot covers it. */
function lockpickAtVaultDoor(world, state) {
  const door = state.doors.find((d) => d.id === 'd-gallery-vault');
  if (!door || door.open) return 0;
  if (Math.hypot(state.player.x - 640, state.player.y - 268) < 78 && state.loot >= 150) return 1;
  return 0;
}

/**
 * The staging tool plan: smoke to cross the Gallery unseen, EMP to blind the Vault cameras,
 * smoke again to cross the Vault floor and the Rooftop. Each tool is bought once, only when
 * the loot covers it.
 */
function makeToolPlan() {
  let smokeGallery = false;
  let empVault = false;
  let smokeVault = false;
  let smokeEscape = false;
  return (world, state) => {
    let mask = lockpickAtVaultDoor(world, state);
    const p = state.player;
    if (!smokeGallery && p.x > 430 && p.x < 720 && p.y < 268 && state.loot >= 150 && state.smokeTimer <= 0) {
      smokeGallery = true;
      mask |= 8; // tool 4 = smoke
    }
    if (!empVault && p.y > 272 && p.x >= 427 && p.x <= 853 && state.loot >= 250 && state.empTimer <= 0) {
      empVault = true;
      mask |= 2; // tool 2 = EMP
    }
    if (!smokeVault && p.y > 272 && p.x >= 427 && p.x <= 853 && state.alarm >= 70 && state.loot >= 150 && state.smokeTimer <= 0) {
      smokeVault = true;
      mask |= 8;
    }
    if (!smokeEscape && state.hasIdol && p.x > 860 && state.loot >= 150 && state.smokeTimer <= 0) {
      smokeEscape = true;
      mask |= 8;
    }
    return mask;
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score to
 * show. The gallery and vault scenes keep playing until their route ends; the escape scene
 * plays until the win lands.
 */
export { runRoute, makeToolPlan, threat, steerMove, seenAt };
export { GALLERY_ROUTE, VAULT_ROUTE, IDOL_ROUTE, ESCAPE_ROUTE };

export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const tools = makeToolPlan();
  if (name === 'gallery') {
    runRoute(world, GALLERY_ROUTE, ROUTE_LIMIT_SECONDS, tools);
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  if (name === 'vault') {
    runRoute(world, GALLERY_ROUTE, 90, tools);
    if (!state.over) {
      runRoute(world, VAULT_ROUTE, 90, tools);
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  if (name === 'escape') {
    runRoute(world, GALLERY_ROUTE, 90, tools);
    if (!state.over) runRoute(world, VAULT_ROUTE, 90, tools);
    if (!state.over) runRoute(world, IDOL_ROUTE, 30, tools);
    if (!state.over) {
      const limit = Math.round(60 / STEP);
      let index = 0;
      for (let i = 0; i < limit && !state.over; i += 1) {
        if (index >= ESCAPE_ROUTE.length) break;
        const target = ESCAPE_ROUTE[index];
        const dx = target[0] - state.player.x;
        const dy = target[1] - state.player.y;
        if (Math.hypot(dx, dy) < 12) {
          index += 1;
          continue;
        }
        let move;
        const danger = threat(state, world);
        if (danger) move = steerMove(state, world, target);
        else {
          const len = Math.hypot(dx, dy);
          move = { x: dx / len, y: dy / len };
        }
        const events = world.step(STEP, move, false, tools(world, state));
        if (events & EVENT_WIN) break;
      }
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY, best: state.score };
  }
  // Default: the title scene — six seconds of the crew patrolling behind the title card.
  for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, false, 0);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
