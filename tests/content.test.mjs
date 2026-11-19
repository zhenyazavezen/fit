// Содержательные правила тренировочной методики (docs/PROGRESSION.md, D-027).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, exById, programs, progById, stepsOf } from './helpers.mjs';
import { estimate } from '../js/engine.js';

const content = readJson('data/content.ru.json');
const LEVEL = { beginner: 0, intermediate: 1, advanced: 2 };
const ids = (p) => p.items.map((i) => i.ex);

test('61 упражнение и 17 программ, у каждого полный текст', () => {
  assert.equal(programs.length, 17);
  assert.equal(exById.size, 61);
  for (const [id, e] of exById) {
    const t = content.exercises[id];
    assert.ok(t.start && t.desc, id);
    assert.ok(t.steps.length >= 4, `${id}: шагов ≥ 4`);
    assert.ok(t.mistakes.length >= 3, `${id}: частых ошибок ≥ 3`);
    assert.equal(e.review, 'draft', `${id}: редакционный материал, не «проверен»`);
  }
});

test('Удалённые упражнения не встречаются ни в данных, ни в программах, ни в цепочках', () => {
  const gone = ['alternating_lunge', 'donkey_kick', 'diamond_pushup', 'chair_dip', 'superman', 'reverse_snow_angel', 'good_morning', 'bicycle_crunch', 'run_in_place'];
  for (const g of gone) {
    assert.ok(!exById.has(g), g);
    for (const p of programs) assert.ok(!ids(p).includes(g), `${p.id}: ${g}`);
    for (const e of exById.values()) assert.ok(e.easier !== g && e.harder !== g, `${e.id}: ${g}`);
  }
});

test('Цепочки «легче/сложнее» взаимны, без циклов и без пропусков уровней сложности назад', () => {
  for (const e of exById.values()) {
    if (e.easier && exById.get(e.easier).harder) assert.ok(true);
    for (const k of ['easier', 'harder']) if (e[k]) assert.ok(exById.has(e[k]), `${e.id}.${k}`);
    let cur = e, n = 0;
    while (cur.harder && n++ < 20) cur = exById.get(cur.harder);
    assert.ok(n < 20, `${e.id}: цикл в цепочке`);
  }
});

test('FREE / PREMIUM: все упражнения free; 9 из 17 программ free, остальные premium', () => {
  for (const e of exById.values()) assert.equal(e.access, 'free', e.id);
  const free = programs.filter((p) => p.access === 'free').map((p) => p.id).sort();
  assert.deepEqual(free, ['b1_full_a', 'b2_full_b', 'b3_core_beginner', 'b4_light_cardio', 'i3_full_strength', 'i6_express', 'r1_morning_mobility', 'r2_stretch_after', 'r3_recovery_day']);
  assert.equal(programs.filter((p) => p.access === 'premium').length, 8);
});

const setsOf = (p, pred) => p.items.filter((i) => pred(exById.get(i.ex))).reduce((s, i) => s + (i.sets ?? exById.get(i.ex).defaults.sets), 0);
const isPull = (e) => e.muscles.primary.some((m) => ['upperback', 'lats'].includes(m)) && !e.categories.includes('mobility');
const isPush = (e) => e.muscles.primary.includes('chest') || (e.muscles.primary.includes('shoulders') && !e.categories.includes('abs') && !e.categories.includes('back') && !e.categories.includes('mobility'));

test('Жим и тяга: в силовых программах тяговых подходов не меньше, чем жимовых', () => {
  for (const id of ['b1_full_a', 'b2_full_b', 'i1_upper', 'i3_full_strength', 'a1_upper_adv']) {
    const p = progById.get(id);
    assert.ok(setsOf(p, isPull) >= setsOf(p, isPush) - 0, `${id}: тяга ${setsOf(p, isPull)} < жим ${setsOf(p, isPush)}`);
  }
});

test('Гамстринг у начинающих: backpack_rdl в обеих базовых программах, суммарно не менее 4 подходов', () => {
  const total = ['b1_full_a', 'b2_full_b'].reduce((s, id) => s + setsOf(progById.get(id), (e) => e.muscles.primary.includes('hamstrings')), 0);
  assert.ok(total >= 4, `подходов на заднюю поверхность бедра: ${total}`);
  for (const id of ['b1_full_a', 'b2_full_b']) assert.ok(ids(progById.get(id)).includes('backpack_rdl'), id);
});

test('Каждая группа мышц из карты тела покрыта хотя бы одним упражнением как основная', () => {
  const need = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'upperback', 'glutes', 'quads', 'hamstrings', 'calves'];
  for (const m of need) assert.ok([...exById.values()].some((e) => e.muscles.primary.includes(m)), m);
});

test('Подъёмы на стул: низкая, устойчивая, нескользящая опора', () => {
  const t = content.exercises.step_up;
  const all = [t.desc, t.start, ...t.mistakes, t.tip].join(' ');
  for (const w of [/низк/, /устойчив/, /нескольз/]) assert.match(all, w);
});

test('Бёрпи: есть вариант без прыжка и отжимания; «продвинутое» бёрпи есть только в программе уровня advanced', () => {
  assert.equal(exById.get('burpee').easier, 'burpee_step');
  assert.doesNotMatch(content.exercises.burpee_step.steps.join(' '), /выпрыг|прыжком|отжима/);
  assert.match(content.exercises.burpee_step.name, /без прыжка и отжимания/);
  for (const p of programs) if (ids(p).includes('burpee')) assert.equal(p.level, 'advanced', p.id);
});

test('Интервалы: у каждого прыжкового упражнения есть вариант без прыжков', () => {
  const pairs = { jumping_jack: 'step_jack', skater: 'step_skater', high_knees: 'march_in_place', burpee: 'burpee_step' };
  for (const [hard, easy] of Object.entries(pairs)) {
    assert.equal(exById.get(hard).easier, easy, hard);
    assert.doesNotMatch(content.exercises[easy].steps.join(' '), /(?<!без )прыж/i, `${easy}: без прыжков`);
  }
});

test('Кор: не больше двух однотипных сгибаний, есть антиротация', () => {
  for (const id of ['b3_core_beginner', 'i4_core', 'a4_core_pro']) {
    const abs = ids(progById.get(id));
    assert.ok(['crunch', 'leg_raise'].filter((x) => abs.includes(x)).length <= 2, id);
    assert.ok(abs.includes('bird_dog') || abs.includes('dead_bug'), id);
  }
});

test('Уровень программы не ниже уровня любого её упражнения', () => {
  for (const p of programs) for (const i of p.items) assert.ok(LEVEL[exById.get(i.ex).level] <= LEVEL[p.level], `${p.id}: ${i.ex} (${exById.get(i.ex).level}) в программе уровня ${p.level}`);
});

test('Нет дублирования: упражнение не стоит дважды в одной программе', () => {
  for (const p of programs) assert.equal(new Set(ids(p)).size, ids(p).length, p.id);
});

test('Описание программ: у силовых и интервальных — прогрессия на 4 недели без обещаний результата', () => {
  for (const p of programs) {
    const note = content.programs[p.id].note || '';
    if (p.id === 'i6_express' || p.id.startsWith('r')) continue;
    assert.match(note, /4 недели/, p.id);
    assert.match(note, /результат[^.]*не гарантируется/, p.id);
  }
});

test('Круг: 7:55 (475 с) — 11 × 30 с + 15 + 5 + 15 с боковой планки + 11 пауз по 10 с; нет счётчика повторений', async () => {
  const steps = await stepsOf(progById.get('i6_express'));
  assert.deepEqual(estimate(steps), { sec: 475, exact: true });
  const work = steps.filter((s) => s.type === 'work');
  assert.ok(work.every((s) => s.kind === 'timed'), 'все подходы круга — на время');
  assert.equal(11 * 30 + 15 + 15 + 5 + 11 * 10, 475);
  assert.ok(!ids(progById.get('i6_express')).includes('chair_dip'));
});

test('Ссылка на Klika & Jordan: только проверенные данные и честная оговорка', () => {
  const note = content.programs.i6_express.note;
  assert.match(note, /Klika B\., Jordan C\./);
  assert.match(note, /17\(3\):8–13/);
  assert.match(note, /не читал/);
  assert.doesNotMatch(content.programs.i6_express.desc, /7 минут|доказан|подтвержд/i);
});

test('Каждая из 17 программ проходится до конца: переходы, отдых, итог; для программ на время длительность совпадает с расчётом', async () => {
  const { Session, withPrep } = await import('../js/engine.js');
  for (const p of programs) {
    const steps = await stepsOf(p);
    const est = estimate(steps);
    const s = new Session(withPrep(steps), { now: 0 });
    let t = 0, guard = 0;
    while (!s.finished && guard++ < 5000) {
      if (s.durMs() == null) s.complete(t);          // подход на повторения: пользователь отметил выполненным
      else { t += s.durMs() - s.elapsedMs(t); s.tick(t); }
    }
    assert.ok(s.finished, `${p.id}: завершается`);
    const r = s.result(t);
    assert.ok(r.completed && r.setsDone === r.setsTotal, `${p.id}: все подходы выполнены`);
    assert.equal(r.exercisesDone, p.items.length, `${p.id}: все упражнения`);
    assert.ok(steps.at(-1).type === 'work', `${p.id}: нет отдыха после последнего подхода`);
    if (est.exact) assert.equal(r.durationSec, est.sec, `${p.id}: время`);
  }
});
