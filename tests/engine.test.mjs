import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, estimate, withPrep, Session, resolveItem } from '../js/engine.js';
import { exById, progById, programs, stepsOf } from './helpers.mjs';

const T0 = 1_000_000;
const circuit = () => progById.get('i6_express');

test('Круг: 12 упражнений — расчётная длительность 7:55 (475 с), точная', async () => {
  const steps = await stepsOf(circuit());
  assert.deepEqual(estimate(steps), { sec: 475, exact: true });
});

test('Круг: состав шагов — 13 рабочих, 11 пауз по 10 с, 1 смена стороны 5 с', async () => {
  const steps = await stepsOf(circuit());
  const work = steps.filter((s) => s.type === 'work'), rest = steps.filter((s) => s.type === 'rest'), sw = steps.filter((s) => s.type === 'switch');
  assert.equal(work.length, 13);
  assert.equal(rest.length, 11);
  assert.ok(rest.every((s) => s.dur === 10));
  assert.equal(sw.length, 1);
  assert.equal(sw[0].dur, 5);
  assert.equal(work.reduce((a, s) => a + s.dur, 0), 360);
});

test('Круг: боковая планка — правая 15 с, смена 5 с, левая 15 с; после неё отдыха нет', async () => {
  const steps = await stepsOf(circuit());
  const tail = steps.slice(-3);
  assert.deepEqual(tail.map((s) => [s.type, s.side ?? null, s.dur]), [['work', 'right', 15], ['switch', null, 5], ['work', 'left', 15]]);
  assert.equal(tail[0].ex, 'side_plank');
  assert.equal(steps.at(-1).type, 'work');
});

test('Круг: порядок упражнений как в программе', async () => {
  const steps = await stepsOf(circuit());
  const order = [...new Set(steps.filter((s) => s.type === 'work').map((s) => s.ex))];
  assert.deepEqual(order, ['jumping_jack', 'glute_bridge', 'knee_pushup', 'crunch', 'march_in_place', 'squat', 'dead_bug', 'plank', 'high_knees', 'sumo_squat', 'pushup_rotation', 'side_plank']);
});

test('Подход на время не имеет счётчика повторений; подход на повторения — не имеет таймера', async () => {
  const steps = await stepsOf(circuit());
  const pushup = steps.find((s) => s.ex === 'knee_pushup' && s.type === 'work');
  assert.equal(pushup.kind, 'timed'); assert.equal(pushup.dur, 30); assert.equal(pushup.reps, undefined);
  const squat = buildSteps([{ ex: 'squat' }], exById, 45).find((s) => s.type === 'work');
  assert.equal(squat.kind, 'reps'); assert.equal(squat.dur, undefined); assert.equal(squat.reps, 15);
});

test('Секундомер круга: от старта до конца ровно 475 с (шаг 1 с), события и итог', async () => {
  const steps = await stepsOf(circuit());
  const s = new Session(steps, { now: T0 });
  let finishedAt = null;
  for (let sec = 1; sec <= 600 && finishedAt == null; sec++) {
    const ev = s.tick(T0 + sec * 1000);
    if (ev.some((e) => e.type === 'finish')) finishedAt = sec;
  }
  assert.equal(finishedAt, 475);
  const r = s.result(T0 + 475_000);
  assert.equal(r.durationSec, 475);
  assert.equal(r.setsDone, 12); assert.equal(r.setsTotal, 12);
  assert.equal(r.exercisesDone, 12);
  assert.equal(r.completed, true);
});

test('Подготовка 5 с не входит в расчёт, но идёт перед стартом', async () => {
  const steps = withPrep(await stepsOf(circuit()));
  assert.equal(steps[0].type, 'prep');
  assert.equal(estimate(steps).sec, 475);
  const s = new Session(steps, { now: T0 });
  s.tick(T0 + 4_999); assert.equal(s.step.type, 'prep');
  s.tick(T0 + 5_000); assert.equal(s.step.type, 'work');
});

test('Возврат из фона: большой скачок времени засчитывается целиком, шаги проходятся по фактическому времени', async () => {
  const steps = await stepsOf(circuit());
  const s = new Session(steps, { now: T0 });
  const ev = s.tick(T0 + 100_000);                  // 100 с «в фоне»
  assert.ok(ev.length >= 3);
  // 100 с = 30 (прыжки) + 10 + 30 (стульчик) + 10 + 20 из 30 у отжиманий
  assert.equal(s.step.ex, 'knee_pushup');
  assert.equal(Math.round(s.remainingMs(T0 + 100_000) / 1000), 10);
  const end = s.tick(T0 + 10_000_000);
  assert.ok(end.some((e) => e.type === 'finish'));
  assert.equal(s.result(T0 + 10_000_000).durationSec, 475);
});

test('Пауза не засчитывается в длительность и не сдвигает таймер', async () => {
  const s = new Session(await stepsOf(circuit()), { now: T0 });
  s.tick(T0 + 10_000);
  s.pause(T0 + 10_000);
  s.tick(T0 + 500_000);                             // на паузе ничего не происходит
  assert.equal(s.step.ex, 'jumping_jack');
  s.resume(T0 + 70_000);                            // пауза 60 с
  assert.equal(Math.round(s.remainingMs(T0 + 70_000) / 1000), 20);
  s.tick(T0 + 70_000 + 465_000);
  assert.equal(s.finished, true);
  assert.equal(s.result(T0 + 70_000 + 465_000).durationSec, 475);
});

test('Подходы на повторения: ждут нажатия; отдыха после последнего подхода нет', () => {
  const steps = buildSteps([{ ex: 'squat', sets: 3, reps: 12, rest: 45 }], exById);
  assert.deepEqual(steps.map((s) => s.type), ['work', 'rest', 'work', 'rest', 'work']);
  const s = new Session(steps, { now: T0 });
  assert.equal(s.tick(T0 + 999_999).length, 0);     // сам не уходит дальше
  assert.equal(s.complete(T0 + 20_000)[0].type, 'step');
  assert.equal(s.step.type, 'rest');
  s.tick(T0 + 20_000 + 44_999); assert.equal(s.step.type, 'rest');
  s.tick(T0 + 20_000 + 45_000); assert.equal(s.step.type, 'work');
  s.complete(T0 + 70_000); s.tick(T0 + 70_000 + 45_000);
  const ev = s.complete(T0 + 130_000);
  assert.equal(ev[0].type, 'finish');
  const r = s.result(T0 + 130_000);
  assert.equal(r.setsDone, 3); assert.equal(r.exercisesDone, 1); assert.equal(r.completed, true);
  assert.deepEqual(estimate(steps), { sec: 12 * 3 * 3 + 90, exact: false });
});

test('Последовательные стороны (reps): правая → смена 5 с → левая; значения на каждую сторону', () => {
  const steps = buildSteps([{ ex: 'reverse_lunge', sets: 2, reps: 10, rest: 30 }], exById);
  assert.deepEqual(steps.map((s) => [s.type, s.side ?? '-']), [
    ['work', 'right'], ['switch', '-'], ['work', 'left'], ['rest', '-'],
    ['work', 'right'], ['switch', '-'], ['work', 'left']]);
  assert.ok(steps.filter((s) => s.type === 'work').every((s) => s.reps === 10));
});

test('Чередование внутри блока не удваивает время и повторения', () => {
  const steps = buildSteps([{ ex: 'dead_bug', sets: 3, reps: 8 }], exById, 30);
  assert.equal(steps.filter((s) => s.type === 'work').length, 3);
  assert.ok(steps.filter((s) => s.type === 'work').every((s) => s.alternating && s.reps === 8));
  const t = buildSteps([{ ex: 'dead_bug', sets: 1, seconds: 30 }], exById);
  assert.equal(estimate(t).sec, 30);
});

test('Последовательные стороны во времени: 2 × значение + смена', () => {
  const steps = buildSteps([{ ex: 'hamstring_stretch', sets: 1, seconds: 30 }], exById);
  assert.equal(estimate(steps).sec, 30 + 5 + 30);
  assert.equal(steps.length, 3);
});

test('Пропуск подхода не засчитывается; предыдущий шаг возвращает на рабочий подход', () => {
  const steps = buildSteps([{ ex: 'squat', sets: 2, reps: 10, rest: 20 }], exById);
  const s = new Session(steps, { now: T0 });
  s.skip(T0 + 1000);                                // пропуск подхода 1
  s.skip(T0 + 2000);                                // пропуск отдыха
  s.complete(T0 + 5000);                            // подход 2 выполнен
  const r = s.result(T0 + 5000);
  assert.equal(r.setsDone, 1); assert.equal(r.completed, false); assert.equal(r.exercisesDone, 0);
  const s2 = new Session(steps, { now: T0 });
  s2.complete(T0 + 1000); s2.skip(T0 + 1000);
  assert.equal(s2.step.set, 2);
  s2.prev(T0 + 2000);
  assert.equal(s2.step.set, 1); assert.equal(s2.done[0], undefined);
});

test('+15 с к отдыху увеличивает его; на рабочем шаге не действует', () => {
  const s = new Session(buildSteps([{ ex: 'squat', sets: 2, reps: 10, rest: 20 }], exById), { now: T0 });
  s.addTime(15); assert.equal(s.extra[0], undefined);
  s.complete(T0);
  s.addTime(15);
  assert.equal(s.remainingMs(T0), 35_000);
});

test('Снимок и восстановление: время «вне приложения» не засчитывается', async () => {
  const steps = await stepsOf(circuit());
  const a = new Session(steps, { now: T0 });
  a.tick(T0 + 40_000);                              // конец прыжков, пауза, стульчик 0 → 30 с
  a.tick(T0 + 50_000);                              // 10 с ушло в стульчик? (30+10=40 → вошли в glute_bridge, 10 с)
  const snap = a.snapshot(T0 + 50_000);
  const later = T0 + 9_999_999;
  const b = Session.restore(steps, JSON.parse(JSON.stringify(snap)), { now: later });
  assert.equal(b.paused, true);
  assert.equal(b.i, a.i);
  assert.equal(Math.round(b.remainingMs(later) / 1000), Math.round(a.remainingMs(T0 + 50_000) / 1000));
  b.resume(later + 5_000);
  assert.equal(Math.round(b.activeMs(later + 5_000) / 1000), 50);
  assert.equal(Session.restore(steps.slice(1), snap, { now: later }), null);   // другая структура → не восстанавливаем
});

test('Все программы собираются, ссылки на упражнения верны, отдыха после последнего шага нет, длительность > 0', async () => {
  for (const p of programs) {
    const steps = await stepsOf(p);
    assert.ok(steps.length > 0, p.id);
    assert.equal(steps.at(-1).type, 'work', p.id);
    assert.ok(estimate(steps).sec > 0, p.id);
  }
});

test('resolveItem: значения по умолчанию, приоритет элемента программы над упражнением', () => {
  const ex = exById.get('plank');
  assert.deepEqual(resolveItem({ ex: 'plank' }, ex, 25), { ex: 'plank', kind: 'timed', sets: 3, reps: null, seconds: 30, rest: 25, kg: 0, sides: 'none', switchSec: 0 });
  assert.equal(resolveItem({ ex: 'plank', sets: 1, seconds: 15, rest: 5 }, ex, 25).rest, 5);
  assert.equal(resolveItem({ ex: 'pushup', seconds: 30 }, exById.get('pushup')).kind, 'timed');
});

test('Досрочное завершение: время до момента завершения, невыполненное не засчитывается', () => {
  const s = new Session(buildSteps([{ ex: 'squat', sets: 3, reps: 10, rest: 20 }], exById), { now: T0 });
  s.complete(T0 + 30_000);                          // подход 1
  s.tick(T0 + 50_000);                              // отдых прошёл
  s.end(T0 + 60_000);
  const r = s.result(T0 + 999_999);
  assert.equal(s.finished, true);
  assert.equal(r.durationSec, 60);
  assert.equal(r.setsDone, 1); assert.equal(r.setsTotal, 3); assert.equal(r.completed, false);
});

test('Подготовка не входит в длительность тренировки (в том числе при паузе и пропуске)', async () => {
  const steps = withPrep(await stepsOf(circuit()));
  const s = new Session(steps, { now: T0 });
  s.pause(T0 + 2_000); s.resume(T0 + 12_000);        // 10 с паузы внутри подготовки
  s.tick(T0 + 15_000);                              // подготовка закончилась (3 с после паузы + 2 до неё = 5 с)
  assert.equal(s.step.type, 'work');
  s.tick(T0 + 15_000 + 475_000);
  assert.equal(s.finished, true);
  assert.equal(s.result(T0 + 99_999_999).durationSec, 475);
  const k = new Session(steps, { now: T0 });
  k.skip(T0 + 1_000);                               // подготовку пропустили на 1-й секунде
  k.tick(T0 + 1_000 + 475_000);
  assert.equal(k.result(T0 + 99_999_999).durationSec, 475);
});
