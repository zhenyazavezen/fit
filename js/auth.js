// Вход и аккаунт. Ничего не включается само: пользователь сам нажимает «Продолжить через …».
import { CONFIG } from './config.js';
import { store } from './store.js';
import { api, ApiError } from './api.js';
import { tg } from './tg.js';
import { enableSync, disableSync, setSyncToken, syncNow } from './sync.js';

const listeners = new Set();
const read = () => store.get('auth', null);
const emit = () => listeners.forEach((f) => f(read()));

export const auth = {
  get state() { const a = read(); return a && a.expiresAt > Date.now() ? a : null; },
  get signedIn() { return !!this.state; },
  get account() { return this.state?.account || null; },
  get token() { return this.state?.token || null; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

async function accept(res) {
  store.setSilent('auth', { token: res.token, expiresAt: res.expiresAt, account: res.account });
  emit();
  await enableSync(res.account.id, res.token);
  return res.account;
}

export async function loginWithTelegram() {
  const initData = tg.initData;
  if (!initData) throw new ApiError(0, 'not_in_telegram', 'Откройте приложение внутри Telegram');
  return accept(await api('/auth/telegram', { method: 'POST', body: { initData } }));
}

export async function logout() {
  const tok = auth.token;
  disableSync();
  store.remove('auth'); emit();
  if (tok) { try { await api('/auth/logout', { method: 'POST', token: tok }); } catch { /* сессия истечёт сама */ } }
}

/** Вернуть сессию после перезапуска; при 401 локальный токен стирается, данные остаются. */
export async function resume() {
  const a = auth.state;
  if (!a) { if (read()) { store.remove('auth'); emit(); } return null; }
  setSyncToken(a.token);
  try { const me = await api('/me', { token: a.token }); store.setSilent('auth', { ...a, account: me }); emit(); await enableSync(me.id, a.token); return me; }
  catch (e) { if (e instanceof ApiError && e.status === 401) { store.remove('auth'); disableSync(); emit(); } return null; }
}

export async function refreshAccount() {
  const a = auth.state; if (!a) return null;
  const me = await api('/me', { token: a.token });
  store.setSilent('auth', { ...a, account: me }); emit();
  return me;
}

export async function deleteAccount() {
  await api('/me', { method: 'DELETE', token: auth.token, body: { confirm: 'DELETE' } });
  disableSync(); store.remove('auth'); store.remove('syncmeta'); emit();
}
