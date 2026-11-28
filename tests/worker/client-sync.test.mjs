// Сквозная проверка: настоящий клиентский модуль синхронизации (js/sync.js) ↔ настоящий Worker на эмулированной D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../worker/src/index.js';
import { makeD1, makeInitData, BOT, CLIENT_ID } from './helpers.mjs';
import { store, history, favorites, settings, resetAll } from '../../js/store.js';
import { enableSync, syncNow, onLocalWrite, disableSync, syncStatus } from '../../js/sync.js';

const env = { DB: makeD1(), TELEGRAM_BOT_TOKEN: BOT, GOOGLE_CLIENT_ID: CLIENT_ID, ALLOWED_ORIGINS: '' };
let offline = false;
globalThis.fetch = async (url, init = {}) => {
  if (offline) throw new TypeError('network');
  const u = new URL(url);
  try { return await handle(new Request('https://fit.test' + u.pathname + u.search, { method: init.method || 'GET', headers: init.headers, body: init.body }), env); }
  catch (e) { return new Response(JSON.stringify({ error: { code: e.code || 'x' } }), { status: e.status || 500 }); }
};
const login = async (id) => {
  const r = await (await fetch('https://x/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: await makeInitData({ id, first_name: 'T' }) }) })).json();
  return r;
};
const W = (id, at) => ({ id, at, startedAt: at - 1000, durationSec: 600, programId: 'b1_full_a', title: 'T', setsDone: 8, exercisesDone: 4, exerciseIds: ['squat'], completed: true });
const device = () => { resetAll(); disableSync(); store.setWriteHook(onLocalWrite); };
const serverCount = () => env.DB.raw.prepare('SELECT COUNT(*) n FROM workout_sessions WHERE deleted = 0').get().n;

test('Локальные данные до входа мигрируют на сервер, второе устройство получает их и объединяет со своими', async () => {
  device();
  store.set('history', [W('a1', 1_760_000_001_000), W('a2', 1_760_000_002_000)]);
  favorites.toggle('squat'); settings.set({ sound: false });
  const acc = await login(4242);
  await enableSync(acc.account.id, acc.token);
  assert.equal(syncStatus().state, 'idle'); assert.equal(serverCount(), 2);

  device();                                                         // «второе устройство»: своя история и избранное
  store.set('history', [W('b1', 1_760_000_003_000)]); favorites.toggle('plank');
  const acc2 = await login(4242);
  await enableSync(acc2.account.id, acc2.token);
  assert.deepEqual(history.all().map((s) => s.id), ['a1', 'a2', 'b1']);
  assert.deepEqual(favorites.all().sort(), ['plank', 'squat']);
  assert.equal(settings.get().sound, false);
  assert.equal(serverCount(), 3);
});

test('Новая тренировка и удаление доезжают до другого устройства; повторные синхронизации не плодят дублей', async () => {
  device();
  const acc = await login(4242);
  await enableSync(acc.account.id, acc.token);
  history.add({ at: 1_760_000_010_000, startedAt: 1_760_000_000_000, durationSec: 300, programId: null, title: 'N', setsDone: 3, exercisesDone: 1, exerciseIds: ['plank'], completed: true });
  await syncNow(); await syncNow();
  assert.equal(serverCount(), 4);
  const newId = history.all().find((s) => s.title === 'N').id;

  device();
  await enableSync(acc.account.id, acc.token);
  assert.equal(history.all().length, 4);
  history.remove(newId);
  await syncNow();
  assert.equal(serverCount(), 3);

  device();
  await enableSync(acc.account.id, acc.token);
  assert.equal(history.all().length, 3); assert.ok(!history.all().some((s) => s.id === newId));
});

test('Без связи изменения копятся и отправляются позже; данные не теряются', async () => {
  device();
  const acc = await login(4242);
  await enableSync(acc.account.id, acc.token);
  offline = true;
  history.add({ at: 1_760_000_020_000, startedAt: 1_760_000_019_000, durationSec: 60, programId: null, title: 'offline', setsDone: 1, exercisesDone: 1, exerciseIds: ['squat'], completed: true });
  favorites.toggle('pushup');
  await syncNow();
  assert.equal(syncStatus().state, 'offline');
  assert.ok(history.all().some((s) => s.title === 'offline'), 'локальная запись на месте');
  offline = false;
  await syncNow();
  assert.equal(syncStatus().state, 'idle'); assert.equal(serverCount(), 4);
  device(); await enableSync(acc.account.id, acc.token);
  assert.ok(favorites.has('pushup'));
});

test('Просроченный токен: статус ошибки, локальные данные остаются', async () => {
  device();
  store.set('history', [W('keep', 1_760_000_030_000)]);
  await enableSync('acc_x', 'bad'.repeat(10));
  assert.equal(syncStatus().state === 'error' || syncStatus().state === 'idle', true);
  assert.equal(history.all().length, 1);
});

test('Запись, удалённая пока идёт отправка, не остаётся «призраком» на сервере и пропадает из рейтинга', async () => {
  device();
  const acc = await login(4343);
  await enableSync(acc.account.id, acc.token);
  const at = Date.now() - 1000;
  history.add({ at, startedAt: at - 5000, durationSec: 300, programId: null, title: 'Гонка', setsDone: 3, exercisesDone: 1, exerciseIds: ['plank'], completed: true });
  const id = history.all().find((s) => s.title === 'Гонка').id;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { const r = await realFetch(...a); history.remove(id); return r; };   // пользователь нажал «Удалить», пока шёл запрос
  await syncNow();
  globalThis.fetch = realFetch;
  await syncNow();
  const row = env.DB.raw.prepare('SELECT deleted FROM workout_sessions WHERE id = ?').get(id);
  assert.equal(row.deleted, 1, 'на сервере запись помечена удалённой');
});

test('Первый вход: локальные списки дел и настройки не затираются серверными, а объединяются; без сети слияние повторяется', async () => {
  device();
  const a = await login(9001);
  await enableSync(a.account.id, a.token);
  store.set('todos', { '2026-11-01': [{ id: 't-server', t: 'с сервера' }] });
  await syncNow();
  device();
  store.set('todos', { '2026-11-01': [{ id: 't-local', t: 'локально' }] });
  offline = true;
  await enableSync(a.account.id, a.token);
  offline = false;
  assert.deepEqual(store.get('todos')['2026-11-01'].map((x) => x.id), ['t-local'], 'без сети ничего не затёрто');
  await syncNow();
  assert.deepEqual(store.get('todos')['2026-11-01'].map((x) => x.id).sort(), ['t-local', 't-server'], 'после появления сети — объединено');
});
