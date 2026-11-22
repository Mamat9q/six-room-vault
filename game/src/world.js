// SIX-ROOM VAULT — the simulation. Fixed 1/60 s steps, no Math.random anywhere: the same
// inputs always give the same game, which is what makes the screenshot scenes repeatable.
// Geometry is axis-aligned rectangles only (walls, door gaps, obstacles), so line of sight is
// a point-march along a ray and movement is circle-vs-rectangle with axis-separated sliding.

import {
  ALARM, CAMERAS, CATCH_RADIUS, DISGUISE_MIN_RANGE, DISGUISE_SECONDS, DOORS, DOOR_W,
  EMP_SECONDS, GHOST_BONUS, GUARDS, HELIPAD, LOOT, MAP, OBSTACLES, PLAYER, ROOM_H,
  ROOM_W, SMOKE_RADIUS, SMOKE_SECONDS, TIME_BONUS_PER_SECOND, TIMER_SECONDS, TOOLS, WALL,
} from './config.js';

export const EVENT_PICKUP = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_WIN = 4;
export const EVENT_TIMEOUT = 8;
export const EVENT_LOCKDOWN = 16;
export const EVENT_TOOL = 32;
export const EVENT_DENIED = 64;

const TAU = Math.PI * 2;
const CONE_RAYS = 13;
const RAY_STEP = 6;

function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** The wall rectangles of the floor plan, with a gap wherever a door stands. */
function buildWalls() {
  const walls = [];
  const top = MAP.y;
  const bottom = MAP.y + MAP.height;
  const left = MAP.x;
  const right = MAP.x + MAP.width;
  // Outer border.
  walls.push({ x: left, y: top - WALL, w: MAP.width, h: WALL });
  walls.push({ x: left, y: bottom, w: MAP.width, h: WALL });
  walls.push({ x: left - WALL, y: top, w: WALL, h: MAP.height });
  walls.push({ x: right, y: top, w: WALL, h: MAP.height });
  // Vertical walls between columns (x = 426 and 853), split by row and by door gaps.
  for (const at of [ROOM_W, ROOM_W * 2]) {
    for (const row of [0, 1]) {
      const y0 = top + row * ROOM_H;
      const y1 = y0 + ROOM_H;
      const door = DOORS.find((d) => d.vertical && d.at === at && doorRow(d) === row);
      if (door) {
        const gap0 = door.along - DOOR_W / 2;
        const gap1 = door.along + DOOR_W / 2;
        if (gap0 > y0) walls.push({ x: at - WALL / 2, y: y0, w: WALL, h: gap0 - y0 });
        if (gap1 < y1) walls.push({ x: at - WALL / 2, y: gap1, w: WALL, h: y1 - gap1 });
      } else {
        walls.push({ x: at - WALL / 2, y: y0, w: WALL, h: y1 - y0 });
      }
    }
  }
  // Horizontal wall between rows (y = 268), split by column and by door gaps.
  for (const col of [0, 1, 2]) {
    const x0 = left + col * ROOM_W;
    const x1 = x0 + ROOM_W;
    const door = DOORS.find((d) => !d.vertical && d.along >= x0 && d.along < x1);
    if (door) {
      const gap0 = door.along - DOOR_W / 2;
      const gap1 = door.along + DOOR_W / 2;
      if (gap0 > x0) walls.push({ x: x0, y: top + ROOM_H - WALL / 2, w: gap0 - x0, h: WALL });
      if (gap1 < x1) walls.push({ x: gap1, y: top + ROOM_H - WALL / 2, w: x1 - gap1, h: WALL });
    } else {
      walls.push({ x: x0, y: top + ROOM_H - WALL / 2, w: x1 - x0, h: WALL });
    }
  }
  return walls;
}

/** Which row (0 top, 1 bottom) a vertical door's gap sits in, from its `along` position. */
function doorRow(door) {
  return door.along < MAP.y + ROOM_H ? 0 : 1;
}

/** The blocking rectangle of a shut door (a gap in the wall that is currently closed). */
function doorRect(door) {
  if (door.vertical) return { x: door.at - WALL / 2, y: door.along - DOOR_W / 2, w: WALL, h: DOOR_W };
  return { x: door.along - DOOR_W / 2, y: door.at - WALL / 2, w: DOOR_W, h: WALL };
}

const WALLS = buildWalls();

/** Push a circle out of a rectangle; returns the corrected centre. */
function resolveCircleRect(px, py, r, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: px, y: py };
  if (d2 === 0) return { x: px, y: py - r }; // centre inside: push up out of it
  const d = Math.sqrt(d2);
  return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
}

/** March a ray from (x, y) along `angle`; stop at the first blocking rectangle or maxDist. */
export function castRay(x, y, angle, maxDist, blockers) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = RAY_STEP; d <= maxDist; d += RAY_STEP) {
    const px = x + dx * d;
    const py = y + dy * d;
    for (let i = 0; i < blockers.length; i += 1) {
      if (pointInRect(px, py, blockers[i])) return d;
    }
  }
  return maxDist;
}

/** The fan of ray endpoints that draws one vision cone honestly: each ray stops at a wall. */
export function coneFan(x, y, angle, range, halfAngle, blockers) {
  const points = [{ x, y }];
  for (let i = 0; i < CONE_RAYS; i += 1) {
    const a = angle - halfAngle + (2 * halfAngle * i) / (CONE_RAYS - 1);
    const d = castRay(x, y, a, range, blockers);
    points.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d });
  }
  return points;
}

export function createWorld() {
  const state = {
    time: 0,
    timer: TIMER_SECONDS,
    alarm: 0,
    alarmStage: 'calm',
    lockdownTimer: 0,
    loot: 0,
    score: 0,
    hasIdol: false,
    spotted: false,
    over: false,
    won: false,
    message: '',
    messageTimer: 0,
    empTimer: 0,
    disguiseTimer: 0,
    smokeTimer: 0,
    smokeX: 0,
    smokeY: 0,
    player: { x: PLAYER.startX, y: PLAYER.startY, angle: 0, sneaking: false },
    guards: [],
    cameras: [],
    lootItems: [],
    doors: [],
  };

  function reset() {
    state.time = 0;
    state.timer = TIMER_SECONDS;
    state.alarm = 0;
    state.alarmStage = 'calm';
    state.lockdownTimer = 0;
    state.loot = 0;
    state.score = 0;
    state.hasIdol = false;
    state.spotted = false;
    state.over = false;
    state.won = false;
    state.message = '';
    state.messageTimer = 0;
    state.empTimer = 0;
    state.disguiseTimer = 0;
    state.smokeTimer = 0;
    state.player = { x: PLAYER.startX, y: PLAYER.startY, angle: 0, sneaking: false };
    state.guards = GUARDS.map((g) => ({
      ...g,
      x: g.waypoints ? g.waypoints[0][0] : g.x,
      y: g.waypoints ? g.waypoints[0][1] : g.y,
      waypoint: 1,
      angle: g.waypoints ? Math.atan2(g.waypoints[1][1] - g.waypoints[0][1], g.waypoints[1][0] - g.waypoints[0][0]) : g.baseAngle,
      mode: 'patrol',
      lastSeenX: 0,
      lastSeenY: 0,
      waitTimer: 0,
      seesPlayer: false,
    }));
    state.cameras = CAMERAS.map((c) => ({ ...c, angle: c.baseAngle, seesPlayer: false }));
    state.lootItems = LOOT.map((l) => ({ ...l, taken: false }));
    state.doors = DOORS.map((d) => ({ ...d, open: !d.locked }));
  }

  /** Every rectangle that blocks movement and sight right now. */
  function blockers() {
    const list = WALLS.concat(OBSTACLES);
    for (const door of state.doors) {
      if (!door.open) list.push(doorRect(door));
    }
    return list;
  }

  function moveCircle(body, dx, dy, radius, solids) {
    let { x, y } = body;
    x += dx;
    for (const r of solids) {
      const fixed = resolveCircleRect(x, y, radius, r);
      x = fixed.x;
      y = fixed.y;
    }
    y += dy;
    for (const r of solids) {
      const fixed = resolveCircleRect(x, y, radius, r);
      x = fixed.x;
      y = fixed.y;
    }
    // Keep everyone inside the map.
    x = Math.max(MAP.x + radius, Math.min(MAP.x + MAP.width - radius, x));
    y = Math.max(MAP.y + radius, Math.min(MAP.y + MAP.height - radius, y));
    body.x = x;
    body.y = y;
  }

  /** Does this viewer see the thief right now? Distance, cone angle, a clear line, and the
   *  thief not hidden by smoke or (at range) by a disguise. */
  function seesPlayer(viewer, range, halfAngle) {
    const p = state.player;
    const dx = p.x - viewer.x;
    const dy = p.y - viewer.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    if (Math.abs(normAngle(Math.atan2(dy, dx) - viewer.angle)) > halfAngle) return false;
    if (state.smokeTimer > 0 && Math.hypot(p.x - state.smokeX, p.y - state.smokeY) < SMOKE_RADIUS) return false;
    if (state.disguiseTimer > 0 && dist > DISGUISE_MIN_RANGE) return false;
    const solids = blockers();
    for (let d = RAY_STEP; d < dist; d += RAY_STEP) {
      const px = viewer.x + (dx / dist) * d;
      const py = viewer.y + (dy / dist) * d;
      for (let i = 0; i < solids.length; i += 1) {
        if (pointInRect(px, py, solids[i])) return false;
      }
    }
    return true;
  }

  function nearestLockedDoor() {
    const p = state.player;
    let best = null;
    let bestD = 78;
    for (const door of state.doors) {
      if (door.open || door.exit) continue;
      const cx = door.vertical ? door.at : door.along;
      const cy = door.vertical ? door.along : door.at;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best;
  }

  function useTool(index) {
    const tool = TOOLS[index];
    if (!tool) return 0;
    if (state.loot < tool.cost) {
      state.message = `Need $${tool.cost} for ${tool.name} — you have $${state.loot}`;
      state.messageTimer = 2.2;
      return EVENT_DENIED;
    }
    if (tool.id === 'lockpick') {
      const door = nearestLockedDoor();
      if (!door) {
        state.message = 'No locked door beside you';
        state.messageTimer = 2.2;
        return EVENT_DENIED;
      }
      if (state.lockdownTimer > 0) {
        state.message = 'LOCKDOWN — the doors stay sealed until it lifts';
        state.messageTimer = 2.2;
        return EVENT_DENIED;
      }
      door.open = true;
      door.picked = true; // a picked door stays open after a later lockdown lifts
      state.loot -= tool.cost;
      state.message = 'LOCKPICK — door open';
      state.messageTimer = 2;
      return EVENT_TOOL;
    }
    state.loot -= tool.cost;
    if (tool.id === 'emp') {
      state.empTimer = EMP_SECONDS;
      state.message = 'EMP BURST — cameras offline 8s';
    } else if (tool.id === 'disguise') {
      state.disguiseTimer = DISGUISE_SECONDS;
      state.message = 'DISGUISE — guards ignore you 10s';
    } else if (tool.id === 'smoke') {
      state.smokeTimer = SMOKE_SECONDS;
      state.smokeX = state.player.x;
      state.smokeY = state.player.y;
      state.message = 'SMOKE BOMB — you vanish for 5s';
    } else if (tool.id === 'noise') {
      let best = null;
      let bestD = Infinity;
      for (const g of state.guards) {
        const d = Math.hypot(g.x - state.player.x, g.y - state.player.y);
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      if (best) {
        best.mode = 'investigate';
        best.lastSeenX = state.player.x;
        best.lastSeenY = state.player.y;
        best.waitTimer = 0;
      }
      state.message = 'NOISE MAKER — a guard comes to look';
    }
    state.messageTimer = 2;
    return EVENT_TOOL;
  }

  function step(dt, move, sneaking, toolActions) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0;
      state.over = true;
      state.won = false;
      return EVENT_TIMEOUT;
    }
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.empTimer > 0) state.empTimer -= dt;
    if (state.disguiseTimer > 0) state.disguiseTimer -= dt;
    if (state.smokeTimer > 0) state.smokeTimer -= dt;
    if (state.lockdownTimer > 0) {
      state.lockdownTimer -= dt;
      if (state.lockdownTimer <= 0) {
        state.alarm = 58; // lockdown ends, but the heat stays on
        for (const door of state.doors) {
          if (door.sealed) {
            // A picked door stays open after a lockdown lifts, and the exit door stays
            // open once the idol is taken — a lockdown seals doors, it does not re-lock them.
            door.open = !door.locked || door.picked || (door.exit && state.hasIdol);
            door.sealed = false;
          } else if (door.exit && state.hasIdol) {
            // The idol was taken while a lockdown held the exit shut: open it now.
            door.open = true;
          }
        }
      }
    }

    // Tools (keys 1-5) are one-shot actions from the input queue.
    if (toolActions) {
      for (let i = 0; i < 5; i += 1) {
        if (toolActions & (1 << i)) events |= useTool(i);
      }
    }

    // The thief moves (sneak is slower but shrinks the guards' effective range).
    const solids = blockers();
    const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.speed;
    const p = state.player;
    p.sneaking = sneaking;
    if (move.x !== 0 || move.y !== 0) {
      p.angle = Math.atan2(move.y, move.x);
      moveCircle(p, move.x * speed * dt, move.y * speed * dt, PLAYER.radius, solids);
    }

    // Loot pickups.
    for (const item of state.lootItems) {
      if (item.taken) continue;
      if (Math.hypot(p.x - item.x, p.y - item.y) < PLAYER.radius + 14) {
        item.taken = true;
        state.loot += item.value;
        events |= EVENT_PICKUP;
        if (item.kind === 'idol') {
          state.hasIdol = true;
          const exit = state.doors.find((d) => d.exit);
          // The exit opens once the idol is in hand — unless a lockdown is sealing it
          // right now, in which case it opens when the lockdown lifts.
          if (exit && state.lockdownTimer <= 0) exit.open = true;
          state.message = 'THE VELLUM IDOL IS YOURS — reach the helipad!';
          state.messageTimer = 3.5;
        } else {
          state.message = `+$${item.value} ${item.kind.toUpperCase()}`;
          state.messageTimer = 1.2;
        }
      }
    }

    // Cameras sweep; a live camera that sees the thief raises the alarm.
    let anyoneSees = false;
    for (const cam of state.cameras) {
      cam.angle = cam.baseAngle + Math.sin(state.time * cam.sweepSpeed) * cam.sweep;
      cam.seesPlayer = false;
      if (state.empTimer <= 0 && seesPlayer(cam, cam.range, cam.halfAngle)) {
        cam.seesPlayer = true;
        anyoneSees = true;
      }
    }

    // Guards patrol, investigate, or chase; any of them seeing the thief raises the alarm.
    const lockdown = state.lockdownTimer > 0;
    for (const g of state.guards) {
      g.seesPlayer = seesPlayer(g, g.range, g.halfAngle);
      if (g.seesPlayer) {
        anyoneSees = true;
        state.spotted = true;
        g.lastSeenX = p.x;
        g.lastSeenY = p.y;
        if (lockdown || state.alarm >= ALARM.lockdown) g.mode = 'chase';
        else if (state.alarm >= ALARM.suspicion) g.mode = 'investigate';
      } else if (state.alarm < ALARM.suspicion) {
        // The heat is off: stop hunting and go back to the patrol.
        g.mode = 'patrol';
        g.waitTimer = 0;
      } else if (state.alarm < ALARM.lockdown && g.mode === 'chase') {
        // The lockdown is over: chase downgrades to investigating the last-seen spot.
        g.mode = 'investigate';
      }
      if (g.kind === 'sentry') {
        if (g.mode === 'chase') {
          // A fixed sentry tracks the thief slowly: at 0.6 rad/s a thief moving sideways
          // (up to ~1.7 rad/s of bearing at 100 px) can still slip out of the cone.
          const want = Math.atan2(p.y - g.y, p.x - g.x);
          g.angle += Math.max(-0.6 * dt, Math.min(0.6 * dt, normAngle(want - g.angle)));
        } else {
          g.angle = g.baseAngle + Math.sin(state.time * g.sweepSpeed) * g.sweep;
        }
        if (g.mode === 'investigate' && Math.hypot(g.lastSeenX - g.x, g.lastSeenY - g.y) < 200) {
          g.angle = Math.atan2(g.lastSeenY - g.y, g.lastSeenX - g.x);
        }
        continue;
      }
      // Moving guards: patrol waypoints, walk to the last-seen spot, or chase the thief.
      let target = null;
      let speedNow = g.speed;
      if (g.mode === 'chase') {
        target = { x: p.x, y: p.y };
        speedNow = g.kind === 'runner' ? g.chaseSpeed : g.speed + 26;
      } else if (g.mode === 'investigate') {
        target = { x: g.lastSeenX, y: g.lastSeenY };
        if (Math.hypot(target.x - g.x, target.y - g.y) < 10) {
          g.waitTimer += dt;
          g.angle += dt * 0.9; // look around while checking the spot
          if (g.waitTimer > ALARM.investigateSeconds) {
            g.mode = 'patrol';
            g.waitTimer = 0;
          }
          target = null;
        }
      } else {
        const wp = g.waypoints[g.waypoint];
        target = { x: wp[0], y: wp[1] };
        if (Math.hypot(target.x - g.x, target.y - g.y) < 8) {
          g.waypoint = (g.waypoint + 1) % g.waypoints.length;
          target = { x: g.waypoints[g.waypoint][0], y: g.waypoints[g.waypoint][1] };
        }
      }
      if (target) {
        const dx = target.x - g.x;
        const dy = target.y - g.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          const want = Math.atan2(dy, dx);
          g.angle += Math.max(-4 * dt, Math.min(4 * dt, normAngle(want - g.angle)));
          moveCircle(g, (dx / d) * speedNow * dt, (dy / d) * speedNow * dt, PLAYER.radius, solids);
        }
      }
      // Caught: a guard gets a hand on the thief.
      if (Math.hypot(p.x - g.x, p.y - g.y) < CATCH_RADIUS) {
        state.over = true;
        state.won = false;
        return events | EVENT_CAUGHT;
      }
    }

    // The alarm meter: climbs while anyone sees the thief, cools off while hidden.
    if (anyoneSees) {
      const rate = state.guards.some((g) => g.seesPlayer) ? ALARM.guardRate : ALARM.cameraRate;
      state.alarm = Math.min(ALARM.max, state.alarm + rate * dt);
    } else {
      state.alarm = Math.max(0, state.alarm - ALARM.decay * dt);
    }
    const stage = state.alarm >= ALARM.lockdown ? 'lockdown' : state.alarm >= ALARM.suspicion ? 'suspicion' : 'calm';
    if (stage === 'lockdown' && state.alarmStage !== 'lockdown' && state.lockdownTimer <= 0) {
      state.lockdownTimer = ALARM.lockdownSeconds;
      for (const door of state.doors) {
        if (!door.open) continue;
        door.sealed = true;
        door.open = false;
      }
      state.message = 'LOCKDOWN — every door seals for 8s!';
      state.messageTimer = 3;
      events |= EVENT_LOCKDOWN;
    }
    state.alarmStage = stage;

    // Win: the idol in hand, standing on the rooftop helipad.
    if (state.hasIdol && Math.hypot(p.x - HELIPAD.x, p.y - HELIPAD.y) < HELIPAD.r) {
      state.over = true;
      state.won = true;
      const timeBonus = Math.round(state.timer) * TIME_BONUS_PER_SECOND;
      const ghostBonus = state.spotted ? 0 : GHOST_BONUS;
      state.score = state.loot + timeBonus + ghostBonus;
      return events | EVENT_WIN;
    }
    state.score = state.loot;
    return events;
  }

  reset();
  return { state, reset, step, blockers, castRay, coneFan };
}
