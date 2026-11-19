import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartProgram, hasPremium, isPremiumProgram } from '../js/access.js';
import { programs, exById } from './helpers.mjs';

const prem = programs.find((p) => p.access === 'premium'), free = programs.find((p) => p.access === 'free');
const NOW = 1_800_000_000_000;

test('Пока оплата не включена, ничего не блокируется', () => {
  assert.equal(canStartProgram(prem, { account: null, enforced: false }), true);
});
test('При включённом Premium: free открыта всем, premium — только с активной подпиской, свои программы всегда', () => {
  assert.equal(canStartProgram(free, { account: null, enforced: true }), true);
  assert.equal(canStartProgram(prem, { account: null, enforced: true }), false);
  assert.equal(canStartProgram(prem, { account: { premium: { active: true, until: NOW + 1000 } }, enforced: true, now: NOW }), true);
  assert.equal(canStartProgram(prem, { account: { premium: { active: true, until: NOW - 1 } }, enforced: true, now: NOW }), false, 'срок истёк');
  assert.equal(canStartProgram({ custom: true, access: 'premium' }, { account: null, enforced: true }), true);
  assert.equal(hasPremium({ premium: { active: false } }), false);
});
test('Финальная модель: все упражнения free; ровно 9 программ free и 8 premium; premium-программ нет среди «входных»', () => {
  for (const e of exById.values()) assert.equal(e.access, 'free');
  assert.equal(programs.filter((p) => p.access === 'free').length, 9);
  assert.equal(programs.filter(isPremiumProgram).length, 8);
  for (const id of ['b1_full_a', 'b2_full_b', 'b3_core_beginner', 'b4_light_cardio']) assert.equal(programs.find((p) => p.id === id).access, 'free', id);
});
test('Бесплатного набора достаточно для нормы силовых занятий: 2+ силовые free-программы на все основные группы мышц', () => {
  const free = programs.filter((p) => p.access === 'free');
  const muscles = new Set(free.flatMap((p) => p.items.flatMap((i) => exById.get(i.ex).muscles.primary)));
  for (const m of ['chest', 'quads', 'glutes', 'hamstrings', 'upperback', 'abs', 'shoulders', 'calves']) assert.ok(muscles.has(m), m);
});
