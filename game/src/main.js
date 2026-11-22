// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between four screens: title, play, paused and game over. R restarts after the job
// ends; M toggles sound.
//
// ?seed=N fixes the game. ?shot=title|gallery|vault|escape (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CAUGHT, EVENT_DENIED, EVENT_LOCKDOWN, EVENT_PICKUP, EVENT_TIMEOUT, EVENT_TOOL, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);
const audio = createAudio();

/** The debug handle the playtest drives: state, screen, alarm, loot, guards, doors, win/lose. */
window.__HEIST = {
  screen: SCREEN_TITLE,
  get state() {
    return world.state;
  },
  reset() {
    world.reset();
  },
  step(dt, move, sneaking, tools) {
    return world.step(dt, move, sneaking, tools);
  },
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let titleTime = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and events.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    window.__HEIST.screen = screen;
    announce('Playing. Steal the idol in the Vault, then reach the helipad.');
  }

  function endGame(won) {
    screen = SCREEN_OVER;
    window.__HEIST.screen = screen;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`Clean getaway. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.caught();
      announce(`Busted. Loot $${world.state.loot}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      window.__HEIST.screen = screen;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    // Tool keys 1-5 are bits 4..64 of the action flags; the world takes them as a 5-bit mask.
    const toolMask = (actions >> 2) & 0x1f;
    if (toolMask) {
      const before = world.state.loot;
      const events = world.step(0, { x: 0, y: 0 }, false, toolMask);
      void events;
      if (world.state.loot < before) audio.tool();
      else audio.denied();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the crew patrols behind the title. Restart the backdrop before the
      // heist clock can run out, so the title never freezes on a timed-out world.
      if (world.state.timer < 240) world.reset();
      titleTime += STEP;
      world.step(STEP, { x: 0, y: 0 }, false, 0);
      return;
    }
    const events = world.step(STEP, input.vector(), input.sneaking(), 0);
    if (events & EVENT_PICKUP) {
      if (world.state.hasIdol && world.state.messageTimer > 3) audio.idol();
      else audio.pickup();
    }
    if (events & EVENT_LOCKDOWN) audio.alarm();
    if (events & EVENT_DENIED) audio.denied();
    if (events & EVENT_WIN) endGame(true);
    else if (events & (EVENT_CAUGHT | EVENT_TIMEOUT)) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // R restarts from the game-over screen; M toggles sound.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyR' && screen === SCREEN_OVER) startGame();
    if (event.code === 'KeyM') audio.toggle();
  });

  // Leaving the tab pauses a running game rather than letting the alarm climb unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Six-Room Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
