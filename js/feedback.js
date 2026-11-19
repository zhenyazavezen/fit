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

// Нота: [частота Гц, длительность с, громкость, сдвиг начала с]
const PATTERNS = {
  tick: [[880, 0.1, 0.16, 0]],
  go: [[1175, 0.16, 0.2, 0]],
  done: [
    [880, 0.14, 0.16, 0],
    [1175, 0.14, 0.18, 0.16],
    [1568, 0.3, 0.18, 0.32],
  ],
};

function playNote([hz, len, level, shift]) {
  const start = audio.currentTime + shift;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.frequency.value = hz;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(level, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + len);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(start);
  osc.stop(start + len + 0.02);
}

export function beep(kind) {
  if (!settings.get().sound) return;
  unlockAudio();
  const notes = PATTERNS[kind];
  if (!audio || !notes) return;
  notes.forEach(playNote);
}

const VIBRATION = { success: [20, 40, 20] };

export function haptic(kind = 'light') {
  if (!settings.get().haptics) return;
  if (tg.haptic(kind)) return;
  try { navigator.vibrate?.(VIBRATION[kind] ?? 12); } catch { /* нет вибрации */ }
}
