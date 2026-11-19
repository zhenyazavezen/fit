import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handle } from '../../worker/src/index.js';
import { verifyInitData } from '../../worker/src/telegram.js';
import { verifyGoogleIdToken, _resetJwksCache } from '../../worker/src/google.js';
import { makeD1, makeInitData, makeGoogle, req, BOT, CLIENT_ID } from './helpers.mjs';

const env = () => ({ DB: makeD1(), TELEGRAM_BOT_TOKEN: BOT, GOOGLE_CLIENT_ID: CLIENT_ID, ALLOWED_ORIGINS: 'https://zhenyazavezen.github.io, https://fit.pages.dev' });
const call = async (e, r, o) => { try { const res = await handle(r, e, o); return { status: res.status, body: await res.json() }; } catch (x) { if (x.status) return { status: x.status, body: { error: { code: x.code } } }; throw x; } };
const U = { id: 777, first_name: 'Женя', username: 'zhenya' };
const loginTg = async (e, user = U) => (await call(e, req('POST', '/auth/telegram', { body: { initData: await makeInitData(user) } }))).body;

// ---------- Telegram initData
test('Telegram: корректная подпись принимается', async () => {
  const r = await verifyInitData(await makeInitData(U), BOT);
  assert.equal(r.ok, true); assert.equal(r.user.id, 777);
});
test('Telegram: подделка, чужой токен, отсутствие hash, просрочка, будущее, нет user', async () => {
  const good = await makeInitData(U);
  assert.equal((await verifyInitData(good.replace('777', '778'), BOT)).reason, 'signature');
  assert.equal((await verifyInitData(good, '999:OTHER')).reason, 'signature');
  assert.equal((await verifyInitData(good.replace(/hash=[0-9a-f]+/, ''), BOT)).reason, 'format');
  assert.equal((await verifyInitData('', BOT)).reason, 'format');
  const old = await makeInitData(U, { authDate: Math.floor(Date.now() / 1000) - 25 * 3600 });
  assert.equal((await verifyInitData(old, BOT)).reason, 'expired');
  const fut = await makeInitData(U, { authDate: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal((await verifyInitData(fut, BOT)).reason, 'future');
  const nouser = await makeInitData(U, { extra: {} });
  const noUserData = new URLSearchParams(nouser); noUserData.delete('user');
  assert.notEqual((await verifyInitData(noUserData.toString(), BOT)).ok, true);
  assert.equal((await verifyInitData(good, '')).reason, 'not_configured');
});

// ---------- Google ID token
test('Google: корректный токен принимается; чужая аудитория/издатель/срок/подпись/ключ/alg/nonce — нет', async () => {
  const g = await makeGoogle();
  const opts = { fetchJwks: g.fetchJwks };
  _resetJwksCache();
  const ok = await verifyGoogleIdToken(await g.sign(g.claims()), CLIENT_ID, opts);
  assert.equal(ok.ok, true); assert.equal(ok.sub, 'g-111'); assert.equal(ok.email, 'a@example.com');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims({ aud: 'other' })), CLIENT_ID, opts)).reason, 'audience');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims({ iss: 'https://evil.example' })), CLIENT_ID, opts)).reason, 'issuer');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims({ exp: Math.floor(Date.now() / 1000) - 3600 })), CLIENT_ID, opts)).reason, 'expired');
  const other = await makeGoogle();
  assert.equal((await verifyGoogleIdToken(await other.sign(g.claims()), CLIENT_ID, opts)).reason, 'signature');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims(), { header: { kid: 'zzz' } }), CLIENT_ID, opts)).reason, 'unknown_key');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims(), { header: { alg: 'none' } }), CLIENT_ID, opts)).reason, 'alg');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims({ nonce: 'a' })), CLIENT_ID, { ...opts, nonce: 'b' })).reason, 'nonce');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims({ nonce: 'a' })), CLIENT_ID, { ...opts, nonce: 'a' })).ok, true);
  assert.equal((await verifyGoogleIdToken('a.b', CLIENT_ID, opts)).reason, 'format');
  assert.equal((await verifyGoogleIdToken(await g.sign(g.claims()), '', opts)).reason, 'not_configured');
  const unver = await verifyGoogleIdToken(await g.sign(g.claims({ email_verified: false })), CLIENT_ID, opts);
  assert.equal(unver.email, null);
});

// ---------- вход и сессии
test('Вход через Telegram создаёт аккаунт, повторный вход возвращает тот же; сессия работает; выход отзывает', async () => {
  const e = env();
  const a = await loginTg(e), b = await loginTg(e);
  assert.equal(a.isNew, true); assert.equal(b.isNew, false); assert.equal(a.account.id, b.account.id);
  assert.equal(a.account.identities[0].provider, 'telegram');
  assert.equal((await call(e, req('GET', '/me', { token: a.token }))).body.id, a.account.id);
  await call(e, req('POST', '/auth/logout', { token: a.token }));
  assert.equal((await call(e, req('GET', '/me', { token: a.token }))).status, 401);
});
test('Без токена, с мусорным токеном и с истёкшей сессией — 401', async () => {
  const e = env(); const a = await loginTg(e);
  assert.equal((await call(e, req('GET', '/me'))).status, 401);
  assert.equal((await call(e, req('GET', '/me', { token: 'x'.repeat(40) }))).status, 401);
  assert.equal((await call(e, req('GET', '/me', { token: a.token }), { now: Date.now() + 31 * 24 * 3600e3 })).status, 401);
});
test('Токены в базе хранятся только хэшем', async () => {
  const e = env(); const a = await loginTg(e);
  const rows = e.DB.raw.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(rows.every((r) => r.token_hash !== a.token && r.token_hash.length === 64));
});
test('Поддельный вход не создаёт аккаунт', async () => {
  const e = env();
  const bad = await makeInitData(U, { botToken: 'x:y' });
  assert.equal((await call(e, req('POST', '/auth/telegram', { body: { initData: bad } }))).status, 401);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM accounts').get().n, 0);
});
test('Ограничение частоты: после 30 попыток входа — 429', async () => {
  const e = env(); let limited = false;       // окно фиксированное: на его границе счётчик обнуляется, поэтому попыток с запасом
  for (let i = 0; i < 70; i++) if ((await call(e, req('POST', '/auth/telegram', { body: { initData: 'x' } }))).status === 429) limited = true;
  assert.equal(limited, true);
});
test('Вход через Google работает и не склеивается с Telegram автоматически (даже при том же имени)', async () => {
  const e = env(); const g = await makeGoogle(); _resetJwksCache();
  const t = await loginTg(e, { id: 1, first_name: 'G User' });
  const r = await call(e, req('POST', '/auth/google', { body: { idToken: await g.sign(g.claims()) } }), { googleOpts: { fetchJwks: g.fetchJwks } });
  assert.equal(r.status, 200); assert.equal(r.body.account.identities[0].provider, 'google');
  assert.notEqual(r.body.account.id, t.account.id);
});
test('Google не настроен → 503, а не ложный вход', async () => {
  const e = env(); e.GOOGLE_CLIENT_ID = '';
  assert.equal((await call(e, req('POST', '/auth/google', { body: { idToken: 'a.b.c' } }))).status, 503);
});

// ---------- CORS и защита
test('CORS: чужой Origin → 403; разрешённый получает заголовки; preflight 204', async () => {
  const e = env();
  const bad = await worker.fetch(req('GET', '/health', { origin: 'https://evil.example' }), e);
  assert.equal(bad.status, 403);
  const ok = await worker.fetch(req('GET', '/health', { origin: 'https://zhenyazavezen.github.io' }), e);
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://zhenyazavezen.github.io');
  const pre = await worker.fetch(req('OPTIONS', '/sync', { origin: 'https://fit.pages.dev' }), e);
  assert.equal(pre.status, 204); assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});
test('Внутренняя ошибка не раскрывает подробности', async () => {
  const e = env(); e.DB = { prepare() { throw new Error('secret SQL details'); }, batch() { throw new Error('x'); } };
  const res = await worker.fetch(req('POST', '/auth/telegram', { body: { initData: 'x' } }), e);
  assert.equal(res.status, 500); assert.doesNotMatch(await res.text(), /secret/);
});
test('Некорректный JSON и слишком большой запрос', async () => {
  const e = env(); const a = await loginTg(e);
  const r = new Request('https://fit.test/sync', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token }, body: '{oops' });
  assert.equal((await call(e, r)).status, 400);
  const big = new Request('https://fit.test/sync', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token }, body: JSON.stringify({ x: 'a'.repeat(300_000) }) });
  assert.equal((await call(e, big)).status, 413);
});
test('Удаление аккаунта стирает данные и сессии', async () => {
  const e = env(); const a = await loginTg(e);
  await call(e, req('POST', '/sync', { token: a.token, body: { docs: { favorites: { value: ['squat'], updatedAt: Date.now() } } } }));
  assert.equal((await call(e, req('DELETE', '/me', { token: a.token, body: {} }))).status, 400);
  assert.equal((await call(e, req('DELETE', '/me', { token: a.token, body: { confirm: 'DELETE' } }))).status, 200);
  for (const t of ['accounts', 'identities', 'sessions', 'user_docs']) assert.equal(e.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
});
