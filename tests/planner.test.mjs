// Прозрачный подбор: профиль → программы/упражнения, восстановление, ограничения, карта тела.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exById, programs } from './helpers.mjs';
import { normalizeProfile, DEFAULT_PROFILE } from '../js/profile-data.js';
import { recommendPrograms, exercisesForMuscles, programsForMuscles, muscleRecovery, recentMuscles, scoreProgram, returningAfterBreak, loadAdvice, programMinutes } from '../js/planner.js';
import { REGIONS, REGION_IDS, VIEWS, musclesOf } from '../js/bodymap.js';
import { readJson } from './helpers.mjs';

const NOW = Date.UTC(2026, 10, 18, 12);
const H = 3_600_000, D = 24 * H;
const ctx = (history = []) => ({ exById, programs, history, now: NOW });
const prof = (o = {}) => normalizeProfile({ ...DEFAULT_PROFILE, ...o });

test('Профиль: неверные значения заменяются допустимыми', () => {
  const p = normalizeProfile({ age: 5, heightCm: 'abc', weightKg: 70.44, level: 'god', goal: 'x', equipment: ['backpack', 'jetpack'], minutes: 7, limits: ['knee', 'knee', 'zzz'] });
  assert.equal(p.age, null); assert.equal(p.heightCm, null); assert.equal(p.weightKg, 70.4);
  assert.equal(p.level, 'beginner'); assert.equal(p.goal, 'fitness'); assert.deepEqual(p.equipment, ['backpack']); assert.equal(p.minutes, 20); assert.deepEqual(p.limits, ['knee']);
});

test('Новичок получает только программы уровня beginner и объяснение причин', () => {
  const recs = recommendPrograms(prof({ minutes: 30 }), ctx(), { limit: 10 });
  assert.ok(recs.length);
  for (const r of recs) { assert.equal(r.program.level, 'beginner'); assert.ok(r.reasons.length || r.warnings.length); }
});

test('Продвинутый уровень открывает все программы, но возраст 60+ исключает advanced', () => {
  const adv = recommendPrograms(prof({ level: 'advanced', minutes: 60, equipment: ['chair', 'wall', 'backpack', 'towel'] }), ctx(), { limit: 30 });
  assert.ok(adv.some((r) => r.program.level === 'advanced'));
  const old = recommendPrograms(prof({ level: 'advanced', age: 62, minutes: 60 }), ctx(), { limit: 30 });
  assert.ok(old.every((r) => r.program.level !== 'advanced'));
});

test('Цель влияет на выбор: сила → силовая программа выше кардио', () => {
  const eq = ['chair', 'wall', 'backpack', 'towel'];
  const r = recommendPrograms(prof({ level: 'intermediate', goal: 'strength', minutes: 45, equipment: eq }), ctx(), { limit: 30 });
  const idx = (id) => r.findIndex((x) => x.program.id === id);
  assert.ok(idx('i3_full_strength') < idx('i5_intervals'));
});

test('Ограничение «прыжки»: программы с прыжками исключаются или получают предупреждение', () => {
  const r = recommendPrograms(prof({ level: 'intermediate', limits: ['impact'], minutes: 60 }), ctx(), { limit: 30 });
  assert.ok(!r.some((x) => x.program.id === 'i5_intervals'), 'интервалы исключены');
  for (const x of r) for (const it of x.program.items) assert.ok(!(exById.get(it.ex).stress || []).includes('impact') || x.warnings.some((w) => w.key === 'limits' || w.key === 'impact'), `${x.program.id}:${it.ex}`);
});

test('Нет рюкзака — предупреждение об оборудовании и штраф', () => {
  const a = scoreProgram(programs.find((p) => p.id === 'b1_full_a'), prof({ equipment: ['chair', 'wall'] }), ctx());
  const b = scoreProgram(programs.find((p) => p.id === 'b1_full_a'), prof({ equipment: ['chair', 'wall', 'backpack'] }), ctx());
  assert.ok(a.warnings.some((w) => w.key === 'equipment' && w.list.includes('backpack')));
  assert.ok(b.score > a.score);
});

test('Восстановление: мышцы, нагруженные менее 48 ч назад, помечаются и снижают оценку', () => {
  const hist = [{ at: NOW - 10 * H, exerciseIds: ['squat', 'glute_bridge'] }];
  const rec = recentMuscles(muscleRecovery(hist, exById, NOW));
  assert.ok(rec.has('quads') && rec.has('glutes') && !rec.has('chest'));
  const lower = programs.find((p) => p.id === 'i2_lower');
  const fresh = scoreProgram(lower, prof({ level: 'intermediate', minutes: 60, equipment: ['chair', 'wall', 'backpack', 'towel'] }), ctx());
  const tired = scoreProgram(lower, prof({ level: 'intermediate', minutes: 60, equipment: ['chair', 'wall', 'backpack', 'towel'] }), ctx(hist));
  assert.ok(tired.score < fresh.score && tired.warnings.some((w) => w.key === 'recovering'));
  const old = [{ at: NOW - 3 * D, exerciseIds: ['squat'] }];
  assert.equal(recentMuscles(muscleRecovery(old, exById, NOW)).size, 0);
});

test('Возврат после перерыва: средние/продвинутые программы получают предупреждение', () => {
  const hist = [{ at: NOW - 40 * D, exerciseIds: ['squat'] }];
  assert.ok(returningAfterBreak(hist, NOW));
  assert.ok(!returningAfterBreak([{ at: NOW - 2 * D }], NOW));
  const s = scoreProgram(programs.find((p) => p.id === 'i3_full_strength'), prof({ level: 'intermediate', minutes: 60 }), ctx(hist));
  assert.ok(s.warnings.some((w) => w.key === 'afterBreak'));
});

test('Карта тела: каждая область даёт упражнения для новичка; все мышцы областей существуют', () => {
  const muscles = new Set(readJson('data/meta.json').muscles);
  for (const id of REGION_IDS) for (const m of REGIONS[id]) assert.ok(muscles.has(m), `${id}:${m}`);
  const eq = { equipment: ['chair', 'wall', 'backpack', 'towel'] };
  for (const id of REGION_IDS) {
    const r = exercisesForMuscles(musclesOf([id]), prof(eq), ctx());
    assert.ok(r.length >= 1, `область ${id}: упражнений нет`);
  }
  for (const v of Object.values(VIEWS)) for (const id of v) assert.ok(REGIONS[id], id);
  assert.ok(new Set([...VIEWS.front, ...VIEWS.back]).size === REGION_IDS.length);
});

test('Карта тела учитывает уровень, оборудование и ограничения', () => {
  const none = exercisesForMuscles(['chest'], prof({ equipment: [] }), ctx()).map((x) => x.id);
  
  for (const id of none) assert.ok(exById.get(id).equipment.every((e) => e === 'none'), id);
  const noWrist = exercisesForMuscles(['chest'], prof({ limits: ['wrist', 'shoulder'] }), ctx()).map((x) => x.id);
  for (const id of noWrist) assert.ok(!(exById.get(id).stress || []).some((s) => ['wrist', 'shoulder'].includes(s)), id);
  const beg = exercisesForMuscles(['quads'], prof(), ctx());
  for (const r of beg) assert.equal(r.level, 'beginner');
});

test('Перегрузка: больше трёх групп — предупреждение; недавние мышцы перечисляются', () => {
  const hist = [{ at: NOW - H, exerciseIds: ['pushup'] }];
  const a = loadAdvice(4, ['chest', 'quads'], hist, exById, NOW);
  assert.equal(a.tooMany, true); assert.deepEqual(a.recovering, ['chest']);
  assert.equal(loadAdvice(3, ['quads'], [], exById, NOW).tooMany, false);
});

test('Программы по мышцам: ягодицы → в списке есть программа с большой долей ягодичных подходов', () => {
  const r = programsForMuscles(['glutes'], prof({ equipment: ['chair', 'wall', 'backpack', 'towel'], minutes: 60, level: 'intermediate' }), ctx());
  assert.ok(r.length && r[0].coverage >= 0.3);
});

test('Длительность программы считается по данным и положительна', () => {
  for (const p of programs) assert.ok(programMinutes(p, exById) >= 5, p.id);
});
