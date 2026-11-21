import test from 'node:test';
import assert from 'node:assert/strict';
import { store, useNamespace, resetAll } from '../js/store.js';

test('Личные данные: у разных пользователей Telegram хранилища не пересекаются', () => {
  useNamespace(null); store.set('todos', { '2026-11-21': [{ id: 'a', t: 'без аккаунта', d: false }] });
  useNamespace(111); assert.equal(store.get('todos', null), null, 'второй пользователь не видит чужое');
  store.set('todos', { '2026-11-21': [{ id: 'b', t: 'первый', d: false }] });
  useNamespace(222); assert.equal(store.get('todos', null), null);
  store.set('favorites', ['squat']);
  assert.deepEqual(store.keys(), ['favorites']);
  useNamespace(111); assert.equal(store.get('todos')['2026-11-21'][0].t, 'первый');
  assert.equal(store.get('favorites', null), null);
  useNamespace(null); assert.equal(store.get('todos')['2026-11-21'][0].t, 'без аккаунта');
  assert.deepEqual(store.keys(), ['todos'], 'без аккаунта чужие ключи не видны и не сбрасываются');
  resetAll(); useNamespace(111); assert.ok(store.get('todos', null), 'сброс данных не трогает чужие');
});
