// Synthesised sound, no audio files: a tiny WebAudio blip kit. Everything is generated at
// run time, so the game ships no media and makes no network request.

export function createAudio() {
  let ctx = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function blip(freq, seconds, type, gainValue, when = 0) {
    const ac = ensure();
    if (!ac || !enabled) return;
    const t = ac.currentTime + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  return {
    pickup() {
      blip(880, 0.09, 'sine', 0.12);
      blip(1318, 0.12, 'sine', 0.1, 0.06);
    },
    idol() {
      blip(523, 0.15, 'triangle', 0.14);
      blip(659, 0.15, 'triangle', 0.14, 0.1);
      blip(784, 0.25, 'triangle', 0.14, 0.2);
    },
    denied() {
      blip(160, 0.15, 'square', 0.08);
    },
    tool() {
      blip(440, 0.08, 'square', 0.08);
      blip(660, 0.1, 'square', 0.08, 0.07);
    },
    alarm() {
      blip(220, 0.3, 'sawtooth', 0.1);
      blip(180, 0.3, 'sawtooth', 0.1, 0.18);
    },
    caught() {
      blip(320, 0.4, 'sawtooth', 0.12);
      blip(110, 0.5, 'sawtooth', 0.12, 0.15);
    },
    win() {
      blip(523, 0.15, 'triangle', 0.12);
      blip(659, 0.15, 'triangle', 0.12, 0.12);
      blip(784, 0.15, 'triangle', 0.12, 0.24);
      blip(1046, 0.35, 'triangle', 0.12, 0.36);
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
  };
}
