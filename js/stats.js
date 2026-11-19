// Статистика по истории тренировок. Чистые функции без DOM.
// Запись истории: { id, at (конец, мс), startedAt, durationSec, title, programId, setsDone, exercisesDone, exerciseIds, completed }
import { startOfDay, addDays, dayKey, startOfWeek, startOfMonth, addMonths, daysInMonth } from './dates.js';

export function summary(hist, from = -Infinity, to = Infinity) {
  const r = { workouts: 0, sec: 0, sets: 0, exercises: 0 };
  for (const s of hist) {
    if (s.at < from || s.at >= to) continue;
    r.workouts += 1; r.sec += s.durationSec || 0; r.sets += s.setsDone || 0; r.exercises += s.exercisesDone || 0;
  }
  return r;
}

export function byDay(hist) {
  const m = new Map();
  for (const s of hist) {
    const k = dayKey(s.at);
    const d = m.get(k) || { workouts: 0, sec: 0 };
    d.workouts += 1; d.sec += s.durationSec || 0;
    m.set(k, d);
  }
  return m;
}

/** Серия: сколько дней подряд были тренировки. Если сегодня ещё не было, серия не сбрасывается до конца дня. */
export function streak(hist, now = Date.now()) {
  const days = byDay(hist);
  let day = startOfDay(now);
  if (!days.has(dayKey(day))) day = addDays(day, -1);
  let n = 0;
  while (days.has(dayKey(day))) { n++; day = addDays(day, -1); }
  return n;
}

/** Семь дней недели (с понедельника) для полосы на главной. */
export function weekDots(hist, now = Date.now()) {
  const days = byDay(hist);
  const start = startOfWeek(now), today = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const ts = addDays(start, i), key = dayKey(ts);
    return { i, ts, key, done: days.has(key), today: key === today, future: ts > now && key !== today };
  });
}

/** Столбцы графика: неделя (7 дней) или месяц (по дням). offset — сдвиг периода назад (0 — текущий, -1 — предыдущий). */
export function period(hist, mode, offset = 0, now = Date.now()) {
  const days = byDay(hist);
  let start, count;
  if (mode === 'month') { start = addMonths(startOfMonth(now), offset); count = daysInMonth(start); }
  else { start = addDays(startOfWeek(now), offset * 7); count = 7; }
  const end = mode === 'month' ? addMonths(start, 1) : addDays(start, 7);
  const bars = Array.from({ length: count }, (_, i) => {
    const ts = addDays(start, i), d = days.get(dayKey(ts));
    return { i, ts, key: dayKey(ts), sec: d?.sec || 0, workouts: d?.workouts || 0 };
  });
  const prevStart = mode === 'month' ? addMonths(start, -1) : addDays(start, -7);
  return { mode, start, end, bars, total: summary(hist, start, end), prev: summary(hist, prevStart, start) };
}

/** История, сгруппированная по дням (новые сверху). */
export function groupByDay(hist) {
  const m = new Map();
  for (const s of [...hist].sort((a, b) => b.at - a.at)) {
    const k = dayKey(s.at);
    if (!m.has(k)) m.set(k, { key: k, ts: startOfDay(s.at), items: [] });
    m.get(k).items.push(s);
  }
  return [...m.values()];
}

/** Какую тренировку предложить: новичкам — лёгкие; затем та, что делали давнее всего. Свои программы не предлагаются. */
export function recommend(hist, programs, now = Date.now()) {
  const done = hist.length;
  const allowed = done < 3 ? ['beginner'] : done < 10 ? ['beginner', 'intermediate'] : ['beginner', 'intermediate', 'advanced'];
  let pool = programs.filter((p) => !p.custom && allowed.includes(p.level));
  if (!pool.length) pool = programs.filter((p) => !p.custom);
  if (!pool.length) return null;
  const last = new Map();
  for (const s of hist) if (s.programId) last.set(s.programId, Math.max(last.get(s.programId) || 0, s.at));
  const today = dayKey(now);
  const fresh = pool.filter((p) => !last.has(p.id));
  const notToday = pool.filter((p) => !last.has(p.id) || dayKey(last.get(p.id)) !== today);
  const pick = (fresh.length ? fresh : notToday.length ? notToday : pool).slice().sort((a, b) => (last.get(a.id) || 0) - (last.get(b.id) || 0));
  return { program: pick[0], reason: done === 0 ? 'first' : last.has(pick[0].id) ? 'rotation' : 'new' };
}
