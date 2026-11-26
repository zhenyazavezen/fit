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

// Колокольчик: основной тон + звонкие верхние частоты, быстро затухает (как сигналы в популярных тренировочных приложениях).
// Нота: [частота Гц, длительность с, громкость 0–1, сдвиг начала с].
// prep — мягкий подъём перед началом, tick — три отсчётных сигнала (3-2-1), go — звонкий «начали!»,
// rest — падающий «отдых», done — мажорная фанфара в конце тренировки.
const PATTERNS = {
  prep: [[523, 0.5, 0.55, 0], [784, 0.7, 0.6, 0.18]],
  tick: [[590, 0.22, 0.8, 0]],
  go: [[590, 0.2, 0.5, 0], [785, 0.9, 0.85, 0.12], [1862, 0.7, 0.35, 0.12]],
  rest: [[1175, 0.35, 0.6, 0], [785, 0.35, 0.7, 0.14], [590, 0.8, 0.85, 0.3]],
  done: [[587, 0.4, 0.6, 0], [785, 0.4, 0.65, 0.17], [988, 0.4, 0.7, 0.34], [1175, 0.5, 0.75, 0.51], [1568, 1.4, 0.85, 0.7], [785, 1.4, 0.6, 0.7], [1862, 1.1, 0.35, 0.72]],
};

let master = null;
function out() {
  if (master) return master;
  const comp = audio.createDynamicsCompressor();           // выравнивает пики: звук громче без треска
  comp.connect(audio.destination);
  master = audio.createGain(); master.connect(comp);
  return master;
}
/** Общий выход Web Audio (для музыки): создаётся при первом обращении после нажатия. */
export function audioBus() { unlockAudio(); return audio ? { ctx: audio, out: out() } : null; }

const PARTIALS = [[1, 1, 1], [2, 0.38, 0.7], [3, 0.18, 0.45], [4.2, 0.1, 0.3]];   // [во сколько раз выше, громкость, во сколько короче звучит]
function playNote([hz, len, level, shift], vol) {
  const start = audio.currentTime + shift, peak = Math.max(0.0002, level * vol);
  for (const [mul, g, shorter] of PARTIALS) {
    if (hz * mul > 7000) continue;
    const osc = audio.createOscillator(), amp = audio.createGain(), l = len * shorter;
    osc.type = 'sine'; osc.frequency.value = hz * mul;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak * g, start + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + l);
    osc.connect(amp); amp.connect(out());
    osc.start(start); osc.stop(start + l + 0.03);
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
