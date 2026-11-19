import test from 'node:test';
import assert from 'node:assert/strict';
import { filterExercises, emptyFilter, matchesQuery, sortByName, activeCount, isEmpty } from '../js/catalog.js';
import { readJson } from './helpers.mjs';

const list = readJson('data/exercises.json');
const content = readJson('data/content.ru.json').exercises;
const F = (o = {}) => ({ ...emptyFilter(), ...o });
const ids = (l) => l.map((e) => e.id);

test('Пустой фильтр возвращает всё', () => { assert.equal(filterExercises(list, content, F()).length, list.length); assert.ok(isEmpty(F())); });

test('Поиск: ё = е, регистр, синонимы, несколько слов', () => {
  assert.ok(ids(filterExercises(list, content, F({ q: 'ПЛАНКА' }))).includes('plank'));
  assert.ok(ids(filterExercises(list, content, F({ q: 'берпи' }))).includes('burpee'));      // алиас «берпи»
  assert.ok(ids(filterExercises(list, content, F({ q: 'бёрпи' }))).includes('burpee'));
  assert.ok(ids(filterExercises(list, content, F({ q: 'отжимания колен' }))).includes('knee_pushup'));
  assert.equal(filterExercises(list, content, F({ q: 'нет такого упражнения' })).length, 0);
});

test('Категории: упражнение в нескольких категориях находится по каждой', () => {
  const legs = ids(filterExercises(list, content, F({ cats: new Set(['legs']) })));
  const glutes = ids(filterExercises(list, content, F({ cats: new Set(['glutes']) })));
  assert.ok(legs.includes('squat') && glutes.includes('squat'));
  const both = ids(filterExercises(list, content, F({ cats: new Set(['legs', 'glutes']) })));
  assert.equal(new Set(both).size, both.length);
  assert.ok(both.length >= Math.max(legs.length, glutes.length));
});

test('Фильтры: уровень, инвентарь, тип, мышцы, избранное — и их сочетание', () => {
  assert.ok(filterExercises(list, content, F({ levels: new Set(['advanced']) })).every((e) => e.level === 'advanced'));
  assert.ok(filterExercises(list, content, F({ equip: new Set(['chair']) })).every((e) => e.equipment.includes('chair')));
  assert.ok(filterExercises(list, content, F({ modes: new Set(['time']) })).every((e) => e.mode === 'time'));
  assert.ok(filterExercises(list, content, F({ muscles: new Set(['triceps']) })).every((e) => [...e.muscles.primary, ...e.muscles.secondary].includes('triceps')));
  const r = filterExercises(list, content, F({ favsOnly: true }), new Set(['squat', 'plank']));
  assert.deepEqual(ids(r).sort(), ['plank', 'squat']);
  const c = filterExercises(list, content, F({ cats: new Set(['abs']), levels: new Set(['beginner']), modes: new Set(['time']) }));
  assert.ok(c.length > 0 && c.every((e) => e.categories.includes('abs') && e.level === 'beginner' && e.mode === 'time'));
  assert.equal(activeCount(F({ levels: new Set(['beginner']), favsOnly: true })), 2);
});

test('Сортировка по названию на русском', () => {
  const s = sortByName(list, content);
  const names = s.map((e) => content[e.id].name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ru')));
});

test('matchesQuery: пустой запрос подходит всем', () => { assert.ok(matchesQuery(list[0], content, '  ')); });
