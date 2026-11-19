// @ts-check
// Worker «fit»: API ZAVEZEN_FIT. Маршруты и защита (CORS, лимиты, единый формат ошибок).
import { HttpError, json, readJson, corsHeaders } from './http.js';
import { verifyInitData } from './telegram.js';
import { verifyGoogleIdToken } from './google.js';
import { rateLimit, cleanup } from './ratelimit.js';
import * as acc from './accounts.js';
import * as sync from './sync.js';

const ipOf = (req) => req.headers.get('CF-Connecting-IP') || 'unknown';

async function loginResponse(env, provider, subject, info, now) {
  const { accountId, isNew } = await acc.loginWithIdentity(env.DB, provider, subject, info, now);
  const session = await acc.createSession(env.DB, accountId, provider, now);
  return { token: session.token, expiresAt: session.expiresAt, isNew, account: await acc.getMe(env.DB, accountId, now) };
}

/** @param {Request} request @param {any} env @param {{now?: number, googleOpts?: any}} [opts] */
export async function handle(request, env, opts = {}) {
  const now = opts.now ?? Date.now();
  const url = new URL(request.url);
  const { pathname: path } = url, method = request.method;
  const db = env.DB;

  if (method === 'GET' && path === '/health') return json({ ok: true });

  if (Math.random() < 0.02) { try { await cleanup(db, now); } catch { /* не критично */ } }

  // ---- вход
  if (method === 'POST' && path === '/auth/telegram') {
    await rateLimit(db, 'auth:' + ipOf(request), 30, 600, now);
    const body = await readJson(request);
    const r = await verifyInitData(body.initData, String(env.TELEGRAM_BOT_TOKEN || '').trim(), now);
    if (!r.ok) console.warn('telegram auth failed: ' + r.reason);
    if (!r.ok) throw new HttpError(r.reason === 'not_configured' ? 503 : 401, 'auth_failed', r.reason === 'not_configured' ? 'Вход через Telegram не настроен' : 'Не удалось подтвердить вход через Telegram');
    const name = [r.user.first_name, r.user.last_name].filter(Boolean).join(' ');
    return json(await loginResponse(env, 'telegram', String(r.user.id), { displayName: name, username: r.user.username }, now));
  }
  if (method === 'POST' && path === '/auth/google') {
    await rateLimit(db, 'auth:' + ipOf(request), 30, 600, now);
    const body = await readJson(request);
    const r = await verifyGoogleIdToken(body.idToken, env.GOOGLE_CLIENT_ID, { nowMs: now, nonce: typeof body.nonce === 'string' ? body.nonce : undefined, ...(opts.googleOpts || {}) });
    if (!r.ok) throw new HttpError(r.reason === 'not_configured' ? 503 : 401, 'auth_failed', r.reason === 'not_configured' ? 'Вход через Google не настроен' : 'Не удалось подтвердить вход через Google');
    return json(await loginResponse(env, 'google', r.sub, { displayName: r.name }, now));
  }

  // ---- всё остальное — только с сессией
  const auth = await acc.authenticate(request, db, now);

  if (method === 'POST' && path === '/auth/logout') { await acc.revokeSession(db, auth.tokenHash); return json({ ok: true }); }
  if (method === 'GET' && path === '/me') return json(await acc.getMe(db, auth.accountId, now));
  if (method === 'DELETE' && path === '/me') {
    const body = await readJson(request);
    if (body.confirm !== 'DELETE') throw new HttpError(400, 'confirm_required', 'Нужно подтверждение удаления');
    await acc.deleteAccount(db, auth.accountId);
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/link/start') return json(await acc.startLink(db, auth.accountId, now));
  if (method === 'POST' && path === '/link/preview') { const b = await readJson(request); return json(await acc.previewLink(db, auth.accountId, b.code, now)); }
  if (method === 'POST' && path === '/link/complete') {
    const b = await readJson(request);
    if (b.confirm !== true) throw new HttpError(400, 'confirm_required', 'Подтвердите объединение');
    const r = await acc.completeLink(db, auth.accountId, auth.provider, b.code, now);
    return json({ token: r.session.token, expiresAt: r.session.expiresAt, account: await acc.getMe(db, r.accountId, now) });
  }
  if (method === 'POST' && path === '/link/unlink') {
    const b = await readJson(request);
    await acc.unlinkIdentity(db, auth.accountId, auth.provider, b.provider, now);
    return json({ account: await acc.getMe(db, auth.accountId, now) });
  }

  if (method === 'GET' && path === '/sync') return json(await sync.pull(db, auth.accountId, Number(url.searchParams.get('since') || 0)));
  if (method === 'POST' && path === '/sync') {
    const b = await readJson(request);
    const { conflicts } = await sync.push(db, auth.accountId, b, now);
    return json({ ...(await sync.pull(db, auth.accountId, Number.isSafeInteger(b.baseRev) ? b.baseRev : 0)), conflicts });
  }
  throw new HttpError(404, 'not_found', 'Маршрут не найден');
}

export default {
  /** @param {Request} request @param {any} env */
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // запросы из браузера с чужого источника не обслуживаются (Origin есть, но не в списке)
    const origin = request.headers.get('Origin');
    if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: { code: 'forbidden_origin', message: 'Источник не разрешён' } }, 403, cors);
    try {
      const res = await handle(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status, cors);
      console.error('internal', /** @type {any} */ (e)?.message);
      return json({ error: { code: 'internal', message: 'Внутренняя ошибка' } }, 500, cors);
    }
  },
};
