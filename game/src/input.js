// Keyboard and pointer input. WASD / arrows steer the thief, Shift sneaks, F folds flat,
// mouse click (or Space) confirms / starts, P or Esc pauses, keys 1-6 buy and use the priced
// tools. Held keys give a steering vector; one-shot presses are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_TOOL_1 = 4;
export const ACTION_TOOL_2 = 8;
export const ACTION_TOOL_3 = 16;
export const ACTION_TOOL_4 = 32;
export const ACTION_TOOL_5 = 64;
export const ACTION_TOOL_6 = 128;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const FOLD = new Set(['KeyF']);
const TOOL_KEYS = {
  Digit1: ACTION_TOOL_1,
  Digit2: ACTION_TOOL_2,
  Digit3: ACTION_TOOL_3,
  Digit4: ACTION_TOOL_4,
  Digit5: ACTION_TOOL_5,
  Digit6: ACTION_TOOL_6,
  Numpad1: ACTION_TOOL_1,
  Numpad2: ACTION_TOOL_2,
  Numpad3: ACTION_TOOL_3,
  Numpad4: ACTION_TOOL_4,
  Numpad5: ACTION_TOOL_5,
  Numpad6: ACTION_TOOL_6,
};

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let fold = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (FOLD.has(event.code)) fold = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (TOOL_KEYS[event.code] !== undefined) {
      if (!event.repeat) actions |= TOOL_KEYS[event.code];
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
    else if (FOLD.has(event.code)) fold = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
    fold = false;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });

  return {
    /** Normalised steering vector from the held movement keys. */
    vector() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    sneaking() {
      return sneak;
    },
    /** True while F is held: the thief folds flat and cones pass over them. */
    folding() {
      return fold;
    },
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
