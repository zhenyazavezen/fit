// Тексты для показа: длительность, нагрузка. Все слова — из локализации.
import { t } from './i18n.js';
import { fmtClock } from './util.js';

export function durationLabel({ sec, exact }) {
  if (exact) return t('dur.exact', { time: fmtClock(sec) });
  return t('dur.approx', { n: Math.max(1, Math.round(sec / 60)) });
}

/** Длительность в истории: 1 ч 05 мин / 12 мин / 45 с. */
export function spentLabel(sec) {
  sec = Math.round(sec);
  if (sec >= 3600) return t('dur.h', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) });
  if (sec >= 600) return t('dur.m', { m: Math.round(sec / 60) });
  if (sec >= 60) return t('dur.ms', { m: Math.floor(sec / 60), s: sec % 60 });
  return t('dur.s', { s: sec });
}


/** Нагрузка по resolveItem(): «3 × 12», «30 с», с пояснением про стороны. */
export function doseLabel(it, { withSides = true } = {}) {
  let s;
  if (it.kind === 'timed') s = it.sets > 1 ? t('dose.timed', { sets: it.sets, sec: it.seconds }) : t('dose.timed1', { sec: it.seconds });
  else s = it.sets > 1 ? t('dose.reps', { sets: it.sets, reps: it.reps }) : t('dose.reps1', { reps: it.reps });
  if (withSides && it.sides === 'sequential') s += ' · ' + t('dose.perSide');
  else if (withSides && it.sides === 'alternating') s += ' · ' + t('dose.alternating');
  return s;
}

export const sideLabel = (side) => (side === 'right' ? t('player.sideRight') : side === 'left' ? t('player.sideLeft') : '');

export function greetingKey(hour) {
  if (hour >= 5 && hour < 12) return 'greet.morning';
  if (hour >= 12 && hour < 18) return 'greet.day';
  if (hour >= 18 && hour < 23) return 'greet.evening';
  return 'greet.night';
}
