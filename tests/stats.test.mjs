import test from 'node:test';
import assert from 'node:assert/strict';
import { summary, streak, weekDots, period, groupByDay, recommend, byDay } from '../js/stats.js';
import { programs } from './helpers.mjs';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const rec = (ts, extra = {}) => ({ id: String(ts), at: ts, durationSec: 600, setsDone: 10, exercisesDone: 5, ...extra });
const NOW = at(2026, 11, 12);   // четверг

test('summary суммирует только записи периода', () => {
  const h = [rec(at(2026, 11, 10)), rec(at(2026, 11, 11), { durationSec: 300 }), rec(at(2026, 10, 1))];
  const s = summary(h, at(2026, 11, 9, 0), at(2026, 11, 16, 0));
  assert.deepEqual(s, { workouts: 2, sec: 900, sets: 20, exercises: 10 });
});

test('streak: подряд идущие дни; сегодня ещё не тренировались — серия жива; пропуск обнуляет', () => {
  assert.equal(streak([], NOW), 0);
  assert.equal(streak([rec(at(2026, 11, 12))], NOW), 1);
  assert.equal(streak([rec(at(2026, 11, 11)), rec(at(2026, 11, 10)), rec(at(2026, 11, 9))], NOW), 3);
  assert.equal(streak([rec(at(2026, 11, 10))], NOW), 0);
  assert.equal(streak([rec(at(2026, 11, 12, 8)), rec(at(2026, 11, 12, 20)), rec(at(2026, 11, 11))], NOW), 2);
});

test('weekDots: неделя с понедельника, сегодня отмечено, будущие дни помечены', () => {
  const d = weekDots([rec(at(2026, 11, 9)), rec(at(2026, 11, 12))], NOW);
  assert.equal(d.length, 7);
  assert.deepEqual(d.map((x) => x.done), [true, false, false, true, false, false, false]);
  assert.equal(d[3].today, true);
  assert.deepEqual(d.map((x) => x.future), [false, false, false, false, true, true, true]);
});

test('period: неделя — 7 столбцов, месяц — по числу дней, смещение назад работает', () => {
  const h = [rec(at(2026, 11, 10)), rec(at(2026, 11, 2)), rec(at(2026, 10, 30))];
  const w = period(h, 'week', 0, NOW);
  assert.equal(w.bars.length, 7); assert.equal(w.total.workouts, 1);
  const w1 = period(h, 'week', -1, NOW);
  assert.equal(w1.total.workouts, 1);              // 2 ноября — прошлая неделя
  const m = period(h, 'month', 0, NOW);
  assert.equal(m.bars.length, 30); assert.equal(m.total.workouts, 2);
  const m1 = period(h, 'month', -1, NOW);
  assert.equal(m1.bars.length, 31); assert.equal(m1.total.workouts, 1);
  assert.equal(m.prev.workouts, 1);
});

test('groupByDay: новые дни сверху, внутри дня новые сверху', () => {
  const g = groupByDay([rec(at(2026, 11, 10, 9)), rec(at(2026, 11, 12, 9)), rec(at(2026, 11, 12, 18))]);
  assert.equal(g.length, 2);
  assert.ok(g[0].ts > g[1].ts);
  assert.ok(g[0].items[0].at > g[0].items[1].at);
});

test('recommend: новичку — программа начального уровня; не предлагает свои; ротация по давности', () => {
  const r0 = recommend([], programs, NOW);
  assert.equal(r0.program.level, 'beginner'); assert.equal(r0.reason, 'first');
  const custom = [...programs, { id: 'u_1', custom: true, level: 'beginner', items: [] }];
  assert.ok(!recommend([], custom, NOW).program.custom);
  const done = programs.filter((p) => p.level === 'beginner');
  const hist = done.map((p, i) => rec(at(2026, 11, 1 + i), { programId: p.id }));
  hist.push(rec(at(2026, 11, 5), { programId: 'x' }), rec(at(2026, 11, 6), { programId: 'x' }));
  const r = recommend(hist, programs, NOW);
  assert.ok(['beginner', 'intermediate'].includes(r.program.level));
  const only = recommend(hist.slice(0, 1), programs, NOW);
  assert.notEqual(only.program.id, hist[0].programId);
});

test('byDay объединяет несколько тренировок за день', () => {
  const m = byDay([rec(at(2026, 11, 12, 8)), rec(at(2026, 11, 12, 20))]);
  assert.equal(m.size, 1); assert.equal([...m.values()][0].workouts, 2);
});
