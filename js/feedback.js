// Звуковые сигналы и вибрация. Звук синтезируется Web Audio: каждый сигнал — список нот.
import { settings } from './store.js';
import { tg } from './tg.js';

let audio = null;

export function unlockAudio() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!audio && Ctor) audio = new Ctor();
    if (audio && audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

// Нота: [частота Гц, длительность с, громкость 0–1, сдвиг начала с]. Тембр — треугольная волна + октава сверху: слышно через динамик телефона.
// Сигналы различаются на слух: prep — два коротких «пинга», tick — отсчёт 3-2-1, go — взлёт вверх (начали!),
// rest — спад вниз (отдых), done — мажорный аккорд (конец тренировки).
const PATTERNS = {
  prep: [[659, 0.14, 0.6, 0], [659, 0.14, 0.6, 0.22]],
  tick: [[988, 0.11, 0.7, 0]],
  go: [[784, 0.1, 0.7, 0], [1047, 0.1, 0.75, 0.1], [1568, 0.42, 0.9, 0.2]],
  rest: [[1047, 0.14, 0.7, 0], [698, 0.34, 0.8, 0.16]],
  done: [[523, 0.16, 0.7, 0], [659, 0.16, 0.7, 0.16], [784, 0.16, 0.75, 0.32], [1047, 0.75, 0.9, 0.48], [1319, 0.75, 0.6, 0.48]],
};

let master = null;
function out() {
  if (master) return master;
  const comp = audio.createDynamicsCompressor();           // выравнивает пики: звук громче без треска
  comp.connect(audio.destination);
  master = audio.createGain(); master.connect(comp);
  return master;
}

function playNote([hz, len, level, shift], vol) {
  const start = audio.currentTime + shift, peak = Math.max(0.0002, level * vol);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  amp.gain.setValueAtTime(peak, start + Math.max(0.02, len * 0.55));
  amp.gain.exponentialRampToValueAtTime(0.0001, start + len);
  amp.connect(out());
  for (const [type, mul, g] of [['triangle', 1, 1], ['sine', 2, 0.35]]) {
    const osc = audio.createOscillator(), gg = audio.createGain();
    osc.type = type; osc.frequency.value = hz * mul; gg.gain.value = g;
    osc.connect(gg); gg.connect(amp);
    osc.start(start); osc.stop(start + len + 0.03);
  }
}

/** Громкость 0.2–1 из настроек (по умолчанию 0.9). */
export const volumeOf = () => { const v = Number(settings.get().volume); return Number.isFinite(v) ? Math.min(1, Math.max(0.2, v)) : 0.9; };

export function beep(kind, { force = false } = {}) {
  if (!force && !settings.get().sound) return;
  unlockAudio();
  const notes = PATTERNS[kind];
  if (!audio || !notes) return;
  const vol = volumeOf();
  notes.forEach((n) => playNote(n, vol));
}

const VIBRATION = { success: [20, 40, 20] };

export function haptic(kind = 'light') {
  if (!settings.get().haptics) return;
  if (tg.haptic(kind)) return;
  try { navigator.vibrate?.(VIBRATION[kind] ?? 12); } catch { /* нет вибрации */ }
}
