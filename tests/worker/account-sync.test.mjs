import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../worker/src/index.js';
import { _resetJwksCache } from '../../worker/src/google.js';
import { makeD1, makeInitData, makeGoogle, req, BOT, CLIENT_ID } from './helpers.mjs';

const env = () => ({ DB: makeD1(), TELEGRAM_BOT_TOKEN: BOT, GOOGLE_CLIENT_ID: CLIENT_ID, ALLOWED_ORIGINS: '' });
const call = async (e, r, o) => { try { const res = await handle(r, e, o); return { status: res.status, body: await res.json() }; } catch (x) { if (x.status) return { status: x.status, body: { error: { code: x.code } } }; throw x; } };
const tg = async (e, id = 777) => (await call(e, req('POST', '/auth/telegram', { body: { initData: await makeInitData({ id, first_name: 'U' + id }) } }))).body;
const goog = async (e, g, sub = 'g-1') => (await call(e, req('POST', '/auth/google', { body: { idToken: await g.sign(g.claims({ sub })) } }), { googleOpts: { fetchJwks: g.fetchJwks } })).body;
const W = (id, at = 1_760_000_000_000) => ({ id, at, startedAt: at - 600_000, durationSec: 600, programId: 'b1_full_a', title: 'T', setsDone: 8, exercisesDone: 4, exerciseIds: ['squat'], completed: true });
const push = (e, token, body) => call(e, req('POST', '/sync', { token, body }));
const T0 = Date.now();

// ---------- синхронизация
test('Синхронизация: отправка → получение на другом устройстве; повтор не дублирует', async () => {
  const e = env(); const a = await tg(e);
  const body = { baseRev: 0, docs: { favorites: { value: ['squat'], updatedAt: T0 } }, sessions: [W('w1'), W('w2')] };
  const r1 = await push(e, a.token, body), r2 = await push(e, a.token, body);
  assert.equal(r1.status, 200); assert.equal(r1.body.sessions.length, 2);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM workout_sessions').get().n, 2);
  const dev2 = await tg(e); // тот же аккаунт, второе устройство
  const pulled = (await call(e, req('GET', '/sync?since=0', { token: dev2.token }))).body;
  assert.equal(pulled.sessions.length, 2); assert.deepEqual(pulled.docs[0].value, ['squat']);
  const inc = (await call(e, req('GET', '/sync?since=' + pulled.rev, { token: dev2.token }))).body;
  assert.equal(inc.sessions.length, 0); assert.equal(inc.docs.length, 0);
  assert.equal(r2.body.conflicts.length, 0);
});
test('Конфликт: более поздняя запись побеждает, проигравшая сторона получает серверное значение', async () => {
  const e = env(); const a = await tg(e);
  await push(e, a.token, { docs: { settings: { value: { sound: false }, updatedAt: T0 + 2000 } } });
  const r = await push(e, a.token, { docs: { settings: { value: { sound: true }, updatedAt: T0 + 1000 } } });
  assert.equal(r.body.conflicts.length, 1); assert.deepEqual(r.body.conflicts[0].value, { sound: false });
  const pulled = (await call(e, req('GET', '/sync', { token: a.token }))).body;
  assert.deepEqual(pulled.docs.find((d) => d.key === 'settings').value, { sound: false });
});
test('Удаление записи — надгробие, которое не отменяется повторной отправкой', async () => {
  const e = env(); const a = await tg(e);
  await push(e, a.token, { sessions: [W('w1')] });
  await push(e, a.token, { deleted: ['w1'] });
  await push(e, a.token, { sessions: [W('w1')] });
  const p = (await call(e, req('GET', '/sync', { token: a.token }))).body;
  assert.equal(p.sessions.find((s) => s.id === 'w1').deleted, true);
});
test('Данные разных пользователей полностью изолированы', async () => {
  const e = env(); const a = await tg(e, 1), b = await tg(e, 2);
  await push(e, a.token, { sessions: [W('secret1')], docs: { profile: { value: { age: 30 }, updatedAt: T0 } } });
  const pb = (await call(e, req('GET', '/sync', { token: b.token }))).body;
  assert.equal(pb.sessions.length, 0); assert.equal(pb.docs.length, 0);
  await push(e, b.token, { deleted: ['secret1'] });                       // чужой id нельзя удалить
  const pa = (await call(e, req('GET', '/sync', { token: a.token }))).body;
  assert.equal(pa.sessions.find((s) => s.id === 'secret1').deleted, false);
});
test('Проверка входных данных: неизвестный документ, неверные типы, лишние поля, будущее время, квота, размер', async () => {
  const e = env(); const a = await tg(e);
  assert.equal((await push(e, a.token, { docs: { admin: { value: {}, updatedAt: T0 } } })).status, 400);
  assert.equal((await push(e, a.token, { docs: { favorites: { value: 'squat', updatedAt: T0 } } })).status, 400);
  assert.equal((await push(e, a.token, { docs: { favorites: { value: ['bad id!'], updatedAt: T0 } } })).status, 400);
  assert.equal((await push(e, a.token, { sessions: [{ id: 'x', at: 5 }] })).status, 400);
  assert.equal((await push(e, a.token, { sessions: Array.from({ length: 201 }, (_, i) => W('s' + i)) })).status, 413);
  const long = await push(e, a.token, { sessions: [{ ...W('z1'), evil: '<script>', title: 'ok' }] });
  assert.equal(long.status, 200); assert.equal('evil' in long.body.sessions[0].data, false);
  const far = await push(e, a.token, { docs: { settings: { value: { sound: true }, updatedAt: T0 + 10 * 365 * 24 * 3600e3 } } });
  assert.ok(e.DB.raw.prepare('SELECT updated_at FROM user_docs').get().updated_at < Date.now() + 10 * 60_000, 'время клиента ограничено');
  assert.equal(far.status, 200);
  const hugeProg = Array.from({ length: 101 }, (_, i) => ({ id: 'p' + i, name: 'n', items: [] }));
  assert.equal((await push(e, a.token, { docs: { programs: { value: hugeProg, updatedAt: T0 } } })).status, 400);
});
test('Постраничная выдача: при >500 записей клиент докачивает по ревизии', async () => {
  const e = env(); const a = await tg(e);
  for (let k = 0; k < 6; k++) await push(e, a.token, { sessions: Array.from({ length: 100 }, (_, i) => W(`s${k}_${i}`, 1_760_000_000_000 + k * 1000 + i)) });
  let since = 0, got = new Set(), guard = 0, more = true;
  while (more && guard++ < 10) { const p = (await call(e, req('GET', '/sync?since=' + since, { token: a.token }))).body; p.sessions.forEach((s) => got.add(s.id)); since = p.rev; more = p.more; }
  assert.equal(got.size, 600);
});

// ---------- привязка и объединение
async function twoAccounts(withData = true) {
  const e = env(), g = await makeGoogle(); _resetJwksCache();
  const t = await tg(e, 100), gg = await goog(e, g, 'g-100');
  if (withData) {
    await push(e, t.token, { sessions: [W('t1'), W('t2'), W('common')], docs: { favorites: { value: ['squat', 'plank'], updatedAt: T0 }, settings: { value: { sound: true }, updatedAt: T0 } } });
    await push(e, gg.token, { sessions: [W('g1'), W('common')], docs: { favorites: { value: ['plank', 'pushup'], updatedAt: T0 }, settings: { value: { sound: false }, updatedAt: T0 + 100 } } });
  }
  return { e, g, t, gg };
}

test('Привязка: код из Telegram + вход Google → один аккаунт, история объединена без потерь и дублей', async () => {
  const { e, t, gg } = await twoAccounts();
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  assert.match(code, /^[A-Z2-9]{8}$/);
  const prev = await call(e, req('POST', '/link/preview', { token: gg.token, body: { code } }));
  assert.equal(prev.body.other.workouts, 3); assert.equal(prev.body.mine.workouts, 2); assert.equal(prev.body.conflict, null);
  assert.equal((await call(e, req('POST', '/link/complete', { token: gg.token, body: { code } }))).status, 400, 'без confirm — нельзя');
  const done = await call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } }));
  assert.equal(done.status, 200);
  assert.deepEqual(done.body.account.identities.map((i) => i.provider).sort(), ['google', 'telegram']);
  const p = (await call(e, req('GET', '/sync', { token: done.body.token }))).body;
  assert.deepEqual(p.sessions.map((s) => s.id).sort(), ['common', 'g1', 't1', 't2']);
  assert.deepEqual(p.docs.find((d) => d.key === 'favorites').value.sort(), ['plank', 'pushup', 'squat']);
  assert.deepEqual(p.docs.find((d) => d.key === 'settings').value, { sound: false }, 'настройки: более новые');
  // входы разными способами ведут в один аккаунт
  const again = await tg(e, 100);
  assert.equal(again.account.id, done.body.account.id);
  assert.equal(again.account.identities.length, 2);
});
test('Код одноразовый, неверный/свой/просроченный коды отклоняются, перебор ограничен', async () => {
  const { e, t, gg } = await twoAccounts(false);
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  assert.equal((await call(e, req('POST', '/link/preview', { token: t.token, body: { code } }))).body.error.code, 'same_account');
  assert.equal((await call(e, req('POST', '/link/preview', { token: gg.token, body: { code: 'AAAAAAAA' } }))).body.error.code, 'bad_code');
  assert.equal((await call(e, req('POST', '/link/preview', { token: gg.token, body: { code } }), { now: Date.now() + 11 * 60_000 })).body.error.code, 'bad_code');
  const done = await call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } }));
  assert.equal(done.status, 200);
  const r = await call(e, req('POST', '/link/complete', { token: done.body.token, body: { code, confirm: true } }));
  assert.equal(r.status, 400);
  let limited = false;                       // окно лимита фиксированное: на границе окна счётчик обнуляется, поэтому попыток с запасом
  for (let i = 0; i < 25; i++) if ((await call(e, req('POST', '/link/preview', { token: done.body.token, body: { code: 'ZZZZZZZZ' } }))).status === 429) limited = true;
  assert.equal(limited, true);
});
test('Два аккаунта с одним и тем же типом входа не объединяются (нет дублей входа)', async () => {
  const e = env(); const a = await tg(e, 1), b = await tg(e, 2);
  const code = (await call(e, req('POST', '/link/start', { token: a.token }))).body.code;
  const p = await call(e, req('POST', '/link/preview', { token: b.token, body: { code } }));
  assert.equal(p.body.conflict, 'telegram');
  assert.equal((await call(e, req('POST', '/link/complete', { token: b.token, body: { code, confirm: true } }))).body.error.code, 'provider_conflict');
});
test('Старые сессии поглощённого аккаунта отзываются, данные поглощённого аккаунта удалены с него', async () => {
  const { e, t, gg } = await twoAccounts();
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  const done = await call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } }));
  const old = [t.token, gg.token].filter(async () => true);
  const statuses = await Promise.all(old.map(async (tok) => (await call(e, req('GET', '/me', { token: tok }))).status));
  assert.ok(statuses.includes(401), 'сессия поглощённого аккаунта отозвана');
  assert.equal(e.DB.raw.prepare('SELECT COUNT(DISTINCT account_id) n FROM workout_sessions').get().n, 1);
  assert.equal((await call(e, req('GET', '/me', { token: done.body.token }))).status, 200);
});
test('Premium при объединении не теряется (берётся максимальный срок)', async () => {
  const { e, t, gg } = await twoAccounts(false);
  e.DB.raw.prepare('UPDATE accounts SET premium_until = ? WHERE id = ?').run(Date.now() + 86400e3, gg.account.id);
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  const done = await call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } }));
  assert.equal(done.body.account.premium.active, true);
});
test('Отвязка: нельзя отвязать единственный и текущий способ; после отвязки сессия этого способа отзывается', async () => {
  const { e, t, gg } = await twoAccounts(false);
  assert.equal((await call(e, req('POST', '/link/unlink', { token: t.token, body: { provider: 'telegram' } }))).body.error.code, 'use_other_session');
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  const done = await call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } }));
  const tgLogin = await tg(e, 100), tok = tgLogin.token;
  assert.equal((await call(e, req('POST', '/link/unlink', { token: tok, body: { provider: 'telegram' } }))).body.error.code, 'use_other_session');
  const googleSession = done.body.token;
  const r = await call(e, req('POST', '/link/unlink', { token: googleSession, body: { provider: 'telegram' } }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.account.identities.map((i) => i.provider), ['google']);
  assert.equal((await call(e, req('GET', '/me', { token: tok }))).status, 401, 'сессия Telegram отозвана');
  assert.equal((await call(e, req('POST', '/link/unlink', { token: googleSession, body: { provider: 'google' } }))).status, 400);
  // восстановление доступа: Telegram можно привязать заново — он снова станет отдельным новым аккаунтом, который можно присоединить кодом
  assert.equal((await tg(e, 100)).isNew, true);
});
test('Ошибка посреди объединения откатывает всё (транзакция batch)', async () => {
  const { e, t, gg } = await twoAccounts();
  const code = (await call(e, req('POST', '/link/start', { token: t.token }))).body.code;
  const real = e.DB.batch; let n = 0;
  e.DB.batch = async (s) => { if (s.length > 5) { const raw = e.DB.raw; raw.exec('BEGIN'); try { for (let i = 0; i < s.length - 1; i++) await s[i].run(); throw new Error('boom'); } catch (x) { raw.exec('ROLLBACK'); throw x; } } return real(s); };
  await assert.rejects(call(e, req('POST', '/link/complete', { token: gg.token, body: { code, confirm: true } })));
  e.DB.batch = real;
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM identities').get().n, 2);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(DISTINCT account_id) n FROM identities').get().n, 2, 'аккаунты не слиты');
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM accounts WHERE merged_into IS NOT NULL').get().n, 0);
});

// ---------- фото профиля (документ avatar)
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' + 'A'.repeat(200);
test('Фото профиля: сохраняется, приходит на втором устройстве, удаление распространяется', async () => {
  const e = env(); const a = await tg(e);
  const r = await push(e, a.token, { docs: { avatar: { value: { img: JPG }, updatedAt: T0 } } });
  assert.equal(r.status, 200);
  const dev2 = await tg(e);
  const pulled = (await call(e, req('GET', '/sync?since=0', { token: dev2.token }))).body;
  assert.equal(pulled.docs.find((d) => d.key === 'avatar').value.img, JPG);
  await push(e, a.token, { docs: { avatar: { value: { img: '' }, updatedAt: T0 + 1000 } } });
  const again = (await call(e, req('GET', '/sync?since=0', { token: dev2.token }))).body;
  assert.equal(again.docs.find((d) => d.key === 'avatar').value.img, '');
});
test('Фото профиля: чужие форматы, скрипты и большие файлы отклоняются', async () => {
  const e = env(); const a = await tg(e);
  for (const img of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'https://evil.example/x.jpg', 'data:image/jpeg;base64,' + 'A'.repeat(60001), 42]) {
    const r = await push(e, a.token, { docs: { avatar: { value: { img }, updatedAt: T0 } } });
    assert.ok(r.status === 400 || r.status === 413, String(img).slice(0, 30) + ' → ' + r.status);
  }
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) n FROM user_docs WHERE doc_key = 'avatar'").get().n, 0);
});
test('Удаление аккаунта стирает и фото профиля', async () => {
  const e = env(); const a = await tg(e);
  await push(e, a.token, { docs: { avatar: { value: { img: JPG }, updatedAt: T0 } } });
  assert.equal((await call(e, req('DELETE', '/me', { token: a.token, body: { confirm: 'DELETE' } }))).status, 200);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) n FROM user_docs").get().n, 0);
});
