// Фоновая музыка тренировки: синтезируется на лету (файлов нет), без слов. Ровный ритм ~100 уд/мин, тише сигналов.
import { settings } from './store.js';
import { audioBus, volumeOf } from './feedback.js';

const BPM = 100, STEP = 60 / BPM / 2;                          // шаг — восьмая
const BASS = [110, 110, 82.41, 82.41, 98, 98, 73.42, 82.41];    // Am – Em – G – D (тихая линия баса)
const ARP = [[440, 523.25, 659.25], [329.63, 493.88, 659.25], [392, 493.88, 587.33], [293.66, 440, 587.33]];

let timer = null, bus = null, gain = null, next = 0, k = 0, noiseBuf = null;

const note = (hz, at, len, level, type = 'sine') => {
  const o = bus.ctx.createOscillator(), g = bus.ctx.createGain();
  o.type = type; o.frequency.value = hz;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(level, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g); g.connect(gain); o.start(at); o.stop(at + len + 0.03);
};
function hat(at) {
  const ctx = bus.ctx;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  s.connect(f); f.connect(g); g.connect(gain); s.start(at); s.stop(at + 0.08);
}
function kick(at) {
  const o = bus.ctx.createOscillator(), g = bus.ctx.createGain();
  o.frequency.setValueAtTime(130, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  o.connect(g); g.connect(gain); o.start(at); o.stop(at + 0.22);
}

function schedule() {
  while (next < bus.ctx.currentTime + 0.35) {
    const i = k % 16, bar = Math.floor(k / 16) % 4;
    if (i % 4 === 0) kick(next);
    if (i % 2 === 1) hat(next);
    if (i % 2 === 0) note(BASS[(k / 2) % 8 | 0], next, STEP * 1.8, 0.28, 'triangle');
    note(ARP[bar][i % 3], next, STEP * 1.6, 0.07);
    next += STEP; k++;
  }
}

/** Запускает музыку, если она включена в настройках (и звук не выключен). */
export function startMusic() {
  const s = settings.get();
  if (timer || !s.sound || s.music === false) return;
  bus = audioBus(); if (!bus) return;
  gain = bus.ctx.createGain(); gain.gain.value = 0.55 * volumeOf(); gain.connect(bus.out);
  next = bus.ctx.currentTime + 0.1; k = 0;
  schedule(); timer = setInterval(schedule, 120);
}
export function stopMusic() {
  clearInterval(timer); timer = null;
  if (gain) { try { gain.gain.setTargetAtTime(0, bus.ctx.currentTime, 0.08); const g = gain; setTimeout(() => g.disconnect(), 400); } catch { /* ignore */ } gain = null; }
}
