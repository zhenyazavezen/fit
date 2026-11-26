import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../worker/src/index.js';
import { periodRange } from '../../worker/src/comp.js';
import { makeD1, makeInitData, req, BOT, CLIENT_ID } from './helpers.mjs';

const env = () => ({ DB: makeD1(), TELEGRAM_BOT_TOKEN: BOT, GOOGLE_CLIENT_ID: CLIENT_ID, ALLOWED_ORIGINS: '' });
const call = async (e, r) => { try { const res = await handle(r, e); return { status: res.status, body: await res.json() }; } catch (x) { if (x.status) return { status: x.status, body: { error: { code: x.code } } }; throw x; } };
const login = async (e, id, name) => (await call(e, req('POST', '/auth/telegram', { body: { initData: await makeInitData({ id, first_name: name }) } }))).body;
const post = (e, tok, path, body) => call(e, req('POST', path, { token: tok, body }));
const get = (e, tok, path) => call(e, req('GET', path, { token: tok }));
const work = (e, tok, id, min) => post(e, tok, '/sync', { sessions: [{ id, at: Date.now(), durationSec: min * 60, completed: true }] });

test('период: неделя начинается в понедельник (UTC), месяц — с 1 числа', () => {
  const r = periodRange('week', Date.UTC(2026, 10, 22, 12)); // воскресенье
  assert.equal(new Date(r.from).toISOString(), '2026-11-16T00:00:00.000Z');
  assert.equal(r.to - r.from, 7 * 86400000);
  assert.equal(new Date(periodRange('month', Date.UTC(2026, 10, 22)).from).toISOString(), '2026-11-01T00:00:00.000Z');
});

test('общий рейтинг: только по согласию, ник виден, итоги считает сервер', async () => {
  const e = env();
  const a = await login(e, 1, 'A'), b = await login(e, 2, 'B'), c = await login(e, 3, 'C');
  await work(e, a.token, 'w1', 20); await work(e, b.token, 'w2', 35); await work(e, c.token, 'w3', 99);
  assert.equal((await get(e, a.token, '/comp/board?scope=global')).status, 403);
  assert.equal((await post(e, a.token, '/comp/global', { on: true })).status, 400);        // нужен ник
  assert.equal((await post(e, a.token, '/comp/global', { on: true, nick: 'x' })).status, 400);
  await post(e, a.token, '/comp/global', { on: true, nick: 'Альфа' });
  await post(e, b.token, '/comp/global', { on: true, nick: 'Бета' });
  const r = (await get(e, a.token, '/comp/board?scope=global&period=week')).body;
  assert.deepEqual(r.rows.map((x) => [x.rank, x.nick, x.minutes, x.me]), [[1, 'Бета', 35, false], [2, 'Альфа', 20, true]]);
  assert.equal(r.me.rank, 2);
  assert.ok(!JSON.stringify(r).includes('acc_'));            // чужие идентификаторы не раскрываются
  await post(e, b.token, '/comp/global', { on: false });
  assert.equal((await get(e, a.token, '/comp/board?scope=global')).body.rows.length, 1);
  assert.equal((await get(e, b.token, '/comp/board?scope=global')).status, 403);
});

test('комнаты: создание, вход по коду, закрытость, выход, удаление пустой', async () => {
  const e = env();
  const a = await login(e, 1, 'A'), b = await login(e, 2, 'B'), c = await login(e, 3, 'C');
  await work(e, a.token, 'w1', 10); await work(e, b.token, 'w2', 30);
  const room = (await post(e, a.token, '/comp/rooms', { name: 'Друзья', nick: 'Альфа' })).body;
  assert.match(room.code, /^[A-Z0-9]{6}$/);
  assert.equal((await post(e, b.token, '/comp/rooms/join', { code: 'ZZZZZZ', nick: 'Бета' })).status, 404);
  assert.equal((await post(e, b.token, '/comp/rooms/join', { code: room.code.toLowerCase(), nick: 'Бета' })).status, 200);
  const bd = (await get(e, a.token, '/comp/board?scope=' + room.id)).body;
  assert.deepEqual(bd.rows.map((x) => [x.nick, x.minutes]), [['Бета', 30], ['Альфа', 10]]);
  assert.equal(bd.title, 'Друзья');
  assert.equal((await get(e, c.token, '/comp/board?scope=' + room.id)).status, 403);   // посторонний
  assert.equal((await get(e, b.token, '/comp/me')).body.rooms[0].members, 2);
  await post(e, a.token, '/comp/rooms/leave', { id: room.id });                           // владелец ушёл — комната остаётся
  assert.equal((await get(e, b.token, '/comp/me')).body.rooms[0].mine, true);
  await post(e, b.token, '/comp/rooms/leave', { id: room.id });
  assert.equal((await post(e, c.token, '/comp/rooms/join', { code: room.code, nick: 'Цэ' })).status, 404);
});

test('удаление аккаунта убирает его из рейтингов; чужие данные не затронуты', async () => {
  const e = env();
  const a = await login(e, 1, 'A'), b = await login(e, 2, 'B');
  await post(e, a.token, '/comp/global', { on: true, nick: 'Альфа' }); await post(e, b.token, '/comp/global', { on: true, nick: 'Бета' });
  assert.equal((await call(e, req('DELETE', '/me', { token: a.token, body: { confirm: 'DELETE' } }))).status, 200);
  assert.deepEqual((await get(e, b.token, '/comp/board?scope=global')).body.rows.map((x) => x.nick), ['Бета']);
});

test('фото в рейтинге: маленький JPEG или ссылка Telegram; чужие форматы отклоняются; видно другим участникам', async () => {
  const e = env();
  const a = await login(e, 1, 'A'), b = await login(e, 2, 'B');
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.equal((await post(e, a.token, '/comp/global', { on: true, nick: 'Альфа', photo: jpeg })).status, 200);
  assert.equal((await post(e, b.token, '/comp/global', { on: true, nick: 'Бета', photo: 'https://t.me/i/userpic/320/x.jpg' })).status, 200);
  assert.equal((await post(e, b.token, '/comp/photo', { photo: 'https://evil.example/x.jpg' })).status, 400);
  assert.equal((await post(e, b.token, '/comp/photo', { photo: 'data:image/svg+xml;base64,AAAA' })).status, 400);
  assert.equal((await post(e, b.token, '/comp/photo', { photo: 'data:image/jpeg;base64,' + 'A'.repeat(5000) })).status, 400);
  const rows = (await get(e, a.token, '/comp/board?scope=global')).body.rows;
  assert.deepEqual(rows.map((r) => [r.nick, r.photo]).sort(), [['Альфа', jpeg], ['Бета', 'https://t.me/i/userpic/320/x.jpg']]);
  await post(e, b.token, '/comp/photo', { photo: '' });
  assert.equal((await get(e, b.token, '/comp/me')).body.photo, '');
});

test('рейтинг считает и незавершённые тренировки (как «Прогресс»)', async () => {
  const e = env();
  const a = await login(e, 7, 'A');
  await post(e, a.token, '/sync', { sessions: [{ id: 'p1', at: Date.now(), durationSec: 120, completed: false }, { id: 'p2', at: Date.now(), durationSec: 60, completed: true }] });
  await post(e, a.token, '/comp/global', { on: true, nick: 'Альфа' });
  const r = (await get(e, a.token, '/comp/board?scope=global&period=week')).body;
  assert.deepEqual([r.rows[0].workouts, r.rows[0].minutes], [2, 3]);
});
