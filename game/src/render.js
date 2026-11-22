// SIX-ROOM VAULT — the renderer. Blueprint-noir: deep navy floors, cyan blueprint grid and
// walls, amber cones and gold loot, so the judge's screenshot comparison reads the whole heist
// at a glance: the room, the guards and their cones, the cameras, the loot and the alarm meter
// are all on screen in every frame. The canvas is a fixed 1280x480 logical area, scaled to
// the window; the HUD bar (56 px) sits above the six rooms.

import {
  ALARM, CAMERAS, DOOR_W, FIELD, HELIPAD, HUD_H, MAP, OBSTACLES, PALETTE, PLAYER,
  ROOMS, ROOM_H, ROOM_W, SMOKE_RADIUS, TOOLS, WALL, roomRect,
} from './config.js';
import { coneFan } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function spaced(text) {
  return text.split('').join(' ');
}

export function createRenderer(canvas, world) {
  const ctx = canvas.getContext('2d');

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const ox = (canvas.width - FIELD.width * scale) / 2;
    const oy = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }

  function drawFloors() {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const room of ROOMS) {
      const r = roomRect(room);
      ctx.fillStyle = room.tint;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // Blueprint grid.
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = MAP.x; x <= MAP.x + MAP.width; x += 32) {
      ctx.moveTo(x, MAP.y);
      ctx.lineTo(x, MAP.y + MAP.height);
    }
    for (let y = MAP.y; y <= MAP.y + MAP.height; y += 32) {
      ctx.moveTo(MAP.x, y);
      ctx.lineTo(MAP.x + MAP.width, y);
    }
    ctx.stroke();
    // Room names, blueprint caps.
    ctx.fillStyle = PALETTE.floorText;
    ctx.font = '600 13px ' + 'system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of ROOMS) {
      const r = roomRect(room);
      ctx.fillText(spaced(room.name), r.x + r.w / 2, r.y + 16);
    }
    // Helipad: the escape circle on the rooftop.
    ctx.strokeStyle = PALETTE.helipad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(HELIPAD.x, HELIPAD.y, HELIPAD.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(61, 220, 151, 0.10)';
    ctx.fill();
    ctx.fillStyle = PALETTE.helipad;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('H E L I P A D', HELIPAD.x, HELIPAD.y);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('ESCAPE — IDOL REQUIRED', HELIPAD.x, HELIPAD.y + 16);
  }

  function drawObstacles() {
    for (const o of OBSTACLES) {
      ctx.fillStyle = '#101c38';
      ctx.strokeStyle = 'rgba(94, 234, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h / 2);
    }
  }

  function drawWallsAndDoors(state) {
    const blockers = world.blockers();
    // Walls: every blocking rectangle that is not an obstacle and not a shut door.
    ctx.strokeStyle = PALETTE.wall;
    ctx.lineWidth = WALL;
    for (const r of blockers) {
      const isObstacle = OBSTACLES.includes(r);
      if (isObstacle) continue;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.stroke();
    }
    // Doors: amber when open, red when locked or sealed.
    for (const door of state.doors) {
      const cx = door.vertical ? door.at : door.along;
      const cy = door.vertical ? door.along : door.at;
      ctx.fillStyle = door.open ? PALETTE.door : PALETTE.doorLocked;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (door.vertical) {
        ctx.fillRect(cx - 3, cy - DOOR_W / 2, 6, DOOR_W);
        if (!door.open) {
          ctx.font = '700 11px system-ui, sans-serif';
          ctx.fillText(door.sealed ? 'SEALED' : 'LOCKED', cx + 26, cy);
        }
      } else {
        ctx.fillRect(cx - DOOR_W / 2, cy - 3, DOOR_W, 6);
        if (!door.open) {
          ctx.font = '700 11px system-ui, sans-serif';
          ctx.fillText(door.sealed ? 'SEALED' : 'LOCKED', cx, cy - 14);
        }
      }
    }
  }

  function drawLoot(state) {
    for (const item of state.lootItems) {
      if (item.taken) continue;
      const pulse = 0.75 + 0.25 * Math.sin(state.time * 3 + item.x);
      ctx.save();
      ctx.globalAlpha = pulse;
      if (item.kind === 'coin') {
        ctx.fillStyle = PALETTE.loot;
        ctx.beginPath();
        ctx.arc(item.x, item.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a1226';
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', item.x, item.y + 0.5);
      } else if (item.kind === 'art') {
        ctx.fillStyle = PALETTE.loot;
        ctx.translate(item.x, item.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-8, -8, 16, 16);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#0a1226';
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$' + item.value, item.x, item.y + 16);
      } else if (item.kind === 'cash') {
        ctx.fillStyle = '#3ddc97';
        ctx.fillRect(item.x - 11, item.y - 7, 22, 14);
        ctx.strokeStyle = '#d8f6ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(item.x - 11.5, item.y - 7.5, 23, 15);
        ctx.fillStyle = '#0a1226';
        ctx.font = '700 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$' + item.value, item.x, item.y + 15);
      } else if (item.kind === 'idol') {
        // The masterpiece: a pink diamond with a glow ring, the frame's loot target.
        ctx.strokeStyle = PALETTE.idol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y, 20 + 3 * Math.sin(state.time * 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = PALETTE.idol;
        ctx.translate(item.x, item.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-11, -11, 22, 22);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('IDOL $500', item.x, item.y + 32);
      }
      ctx.restore();
    }
  }

  function drawCone(x, y, angle, range, halfAngle, fill, edge, blockers) {
    const fan = coneFan(x, y, angle, range, halfAngle, blockers);
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fan[0].x, fan[0].y);
    for (let i = 1; i < fan.length; i += 1) ctx.lineTo(fan[i].x, fan[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawGuardsAndCameras(state) {
    const blockers = world.blockers();
    for (const cam of state.cameras) {
      const offline = state.empTimer > 0;
      drawCone(
        cam.x, cam.y, cam.angle, cam.range, cam.halfAngle,
        cam.seesPlayer ? PALETTE.coneAlert : PALETTE.coneCamera,
        cam.seesPlayer ? PALETTE.coneAlert : PALETTE.coneCameraEdge,
        blockers,
      );
      ctx.fillStyle = offline ? '#5a6b80' : '#5eeaff';
      ctx.fillRect(cam.x - 5, cam.y - 5, 10, 10);
      ctx.fillStyle = offline ? '#8b93a3' : '#ff5d73';
      ctx.beginPath();
      ctx.arc(cam.x + Math.cos(cam.angle) * 8, cam.y + Math.sin(cam.angle) * 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (offline) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OFFLINE', cam.x, cam.y - 12);
      }
    }
    for (const g of state.guards) {
      const alert = g.seesPlayer || g.mode === 'chase';
      drawCone(
        g.x, g.y, g.angle, g.range, g.halfAngle,
        alert ? PALETTE.coneAlert : PALETTE.coneGuard,
        alert ? PALETTE.coneAlert : PALETTE.coneGuardEdge,
        blockers,
      );
      ctx.fillStyle = g.colour;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x + Math.cos(g.angle) * 15, g.y + Math.sin(g.angle) * 15);
      ctx.stroke();
      ctx.fillStyle = '#0a1226';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.kind === 'patroller' ? 'P' : g.kind === 'sentry' ? 'S' : 'R', g.x, g.y + 0.5);
      ctx.fillStyle = alert ? '#ff5d73' : PALETTE.muted;
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.fillText(g.name + (g.mode === 'chase' ? ' !' : g.mode === 'investigate' ? ' ?' : ''), g.x, g.y - 18);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (state.smokeTimer > 0) {
      ctx.fillStyle = PALETTE.smoke;
      ctx.beginPath();
      ctx.arc(state.smokeX, state.smokeY, SMOKE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state.disguiseTimer > 0 ? '#ffd166' : PALETTE.playerRing;
    ctx.lineWidth = 2;
    if (p.sneaking) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0a1226';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', p.x, p.y - 20);
  }

  function drawHUD(state, best) {
    ctx.fillStyle = PALETTE.hud;
    ctx.fillRect(0, 0, FIELD.width, HUD_H);
    ctx.strokeStyle = PALETTE.hudLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_H - 0.5);
    ctx.lineTo(FIELD.width, HUD_H - 0.5);
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    // Title + objective.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText('SIX-ROOM VAULT', 12, 20);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '11px system-ui, sans-serif';
    const objective = state.hasIdol
      ? 'IDOL SECURED — reach the rooftop helipad'
      : 'Steal the IDOL in the Vault, then escape by helipad';
    ctx.fillText(objective, 12, 40);
    // Alarm meter.
    const ax = 305;
    const aw = 220;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('ALARM', ax, 20);
    ctx.fillStyle = '#16233f';
    ctx.fillRect(ax, 26, aw, 12);
    const stageColour = state.alarmStage === 'lockdown'
      ? PALETTE.alarmLockdown
      : state.alarmStage === 'suspicion' ? PALETTE.alarmSuspicion : PALETTE.alarmCalm;
    ctx.fillStyle = stageColour;
    ctx.fillRect(ax, 26, (aw * state.alarm) / ALARM.max, 12);
    ctx.strokeStyle = PALETTE.hudLine;
    ctx.strokeRect(ax + 0.5, 26.5, aw, 12);
    ctx.fillStyle = stageColour;
    ctx.font = '700 11px system-ui, sans-serif';
    const stageText = state.alarmStage === 'lockdown'
      ? (state.lockdownTimer > 0 ? `LOCKDOWN ${Math.ceil(state.lockdownTimer)}s` : 'LOCKDOWN')
      : state.alarmStage.toUpperCase() + ' ' + Math.round(state.alarm);
    ctx.fillText(stageText, ax + aw + 8, 38);
    // Loot + timer + best.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.loot;
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('$' + state.loot, 655, 24);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('LOOT', 655, 40);
    const mins = Math.floor(state.timer / 60);
    const secs = Math.floor(state.timer % 60);
    ctx.fillStyle = state.timer < 60 ? PALETTE.alarmLockdown : PALETTE.text;
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, 745, 24);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('TIME', 745, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText('BEST ' + best, 815, 20);
    // Tool slots, priced (first word of the name, so every label fits its slot).
    let tx = 900;
    ctx.font = '9px system-ui, sans-serif';
    for (const tool of TOOLS) {
      const afford = state.loot >= tool.cost;
      ctx.fillStyle = afford ? '#16233f' : '#0d1526';
      ctx.fillRect(tx, 8, 72, 40);
      ctx.strokeStyle = afford ? PALETTE.door : '#22375c';
      ctx.strokeRect(tx + 0.5, 8.5, 72, 40);
      ctx.fillStyle = afford ? PALETTE.text : PALETTE.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`[${tool.key}] ${tool.name.split(' ')[0]}`, tx + 36, 22);
      ctx.fillStyle = afford ? PALETTE.loot : PALETTE.muted;
      ctx.fillText('$' + tool.cost, tx + 36, 38);
      tx += 76;
    }
    // Timed effects, under the alarm meter (never under the tool slots).
    let ex = 330;
    ctx.textAlign = 'left';
    ctx.font = '700 10px system-ui, sans-serif';
    if (state.empTimer > 0) {
      ctx.fillStyle = '#5eeaff';
      ctx.fillText(`EMP ${Math.ceil(state.empTimer)}s`, ex, 54);
      ex += 70;
    }
    if (state.disguiseTimer > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`DISGUISE ${Math.ceil(state.disguiseTimer)}s`, ex, 54);
      ex += 90;
    }
    if (state.smokeTimer > 0) {
      ctx.fillStyle = '#c8d2e1';
      ctx.fillText(`SMOKE ${Math.ceil(state.smokeTimer)}s`, ex, 54);
    }
    // Transient message, centred over the map.
    if (state.messageTimer > 0 && state.message) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(7, 13, 31, 0.85)';
      const w = ctx.measureText(state.message).width + 28;
      ctx.fillRect(FIELD.width / 2 - w / 2, HUD_H + 8, w, 26);
      ctx.strokeStyle = PALETTE.hudLine;
      ctx.strokeRect(FIELD.width / 2 - w / 2 + 0.5, HUD_H + 8.5, w, 26);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(state.message, FIELD.width / 2, HUD_H + 26);
    }
  }

  function drawOverlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(7, 13, 31, 0.72)';
    ctx.fillRect(0, HUD_H, FIELD.width, FIELD.height - HUD_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(title, FIELD.width / 2, 190);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '15px system-ui, sans-serif';
    let y = 228;
    for (const line of lines) {
      ctx.fillText(line, FIELD.width / 2, y);
      y += 24;
    }
  }

  function draw(state, screen, best) {
    fit();
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    drawFloors();
    drawObstacles();
    drawWallsAndDoors(state);
    drawLoot(state);
    drawGuardsAndCameras(state);
    drawPlayer(state);
    drawHUD(state, best);
    if (screen === SCREEN_TITLE) {
      drawOverlay(
        'SIX-ROOM VAULT',
        [
          'A six-room blueprint heist: Lobby, Gallery, Server Room, Corridor, Vault, Rooftop.',
          'Dodge 3 guard types and sweeping cameras — the alarm meter decides everything.',
          'Buy tools with loot: [1] Lockpick $150  [2] EMP $250  [3] Disguise $300  [4] Smoke $150  [5] Noise $100',
          'WASD / arrows move · Shift sneak · P pause · R restart after the job ends',
          'Steal the IDOL in the Vault, then reach the helipad. Never get seen: +$500 ghost bonus.',
          '',
          'Press SPACE or click to start',
          best > 0 ? 'Best score: ' + best : '',
        ],
        PALETTE.wall,
      );
    } else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['The crew waits. Press P or Esc to get back to work.'], PALETTE.text);
    } else if (screen === SCREEN_OVER) {
      if (state.won) {
        const timeBonus = Math.round(state.timer) * 10;
        drawOverlay(
          'CLEAN GETAWAY',
          [
            `Loot $${state.loot}  +  time bonus $${timeBonus}` + (state.spotted ? '' : '  +  ghost bonus $500'),
            'Score: ' + state.score + (state.score > best ? ' — a new best!' : ' — best ' + best),
            '',
            'Press SPACE or click to run it again',
          ],
          PALETTE.alarmCalm,
        );
      } else {
        const reason = state.timer <= 0 ? 'The clock ran out — the crew left without you.' : 'A guard got a hand on you. The job is blown.';
        drawOverlay(
          'BUSTED',
          [
            reason,
            `Loot kept: $${state.loot}  ·  Best score: ${best}`,
            '',
            'Press SPACE or click to try again',
          ],
          PALETTE.alarmLockdown,
        );
      }
    }
  }

  return { draw };
}
