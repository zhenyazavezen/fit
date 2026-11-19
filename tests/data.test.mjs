import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../tools/validate.mjs';

test('Данные каталога проходят валидатор (нет медиа-полей, обещаний, битых ссылок)', () => {
  const r = validate();
  assert.deepEqual(r.errors, []);
  assert.equal(r.counts.exercises, 61);
});
