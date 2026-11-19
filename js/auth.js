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
export async function loginWithGoogle(idToken, nonce) { return accept(await api('/auth/google', { method: 'POST', body: { idToken, nonce } })); }

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

// ---- привязка второго способа входа
export const startLink = () => api('/link/start', { method: 'POST', token: auth.token });
export const previewLink = (code) => api('/link/preview', { method: 'POST', token: auth.token, body: { code } });
export async function completeLink(code) {
  const res = await api('/link/complete', { method: 'POST', token: auth.token, body: { code, confirm: true } });
  return accept(res);
}
export async function unlink(provider) {
  const r = await api('/link/unlink', { method: 'POST', token: auth.token, body: { provider } });
  store.setSilent('auth', { ...auth.state, account: r.account }); emit();
  return r.account;
}
export async function deleteAccount() {
  await api('/me', { method: 'DELETE', token: auth.token, body: { confirm: 'DELETE' } });
  disableSync(); store.remove('auth'); store.remove('syncmeta'); emit();
}

// ---- Google Identity Services (кнопка «Продолжить через Google»)
let gsiPromise = null;
const loadGsi = () => gsiPromise || (gsiPromise = new Promise((resolve, reject) => {
  if (window.google?.accounts?.id) return resolve();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => resolve(); s.onerror = () => { gsiPromise = null; reject(new ApiError(0, 'gsi_blocked', 'Google недоступен')); };
  document.head.append(s);
}));
export const googleConfigured = () => !!CONFIG.googleClientId && !!CONFIG.apiBase;
/** Внутри Telegram OAuth Google часто блокируется во встроенном браузере: предлагается открыть внешний браузер. */
export const googleNeedsExternalBrowser = () => tg.available;

export async function renderGoogleButton(container, { onDone, onError }) {
  const nonce = crypto.randomUUID?.() || String(Math.random()).slice(2);
  await loadGsi();
  window.google.accounts.id.initialize({
    client_id: CONFIG.googleClientId, nonce, ux_mode: 'popup', auto_select: false,
    callback: async (r) => { try { onDone(await loginWithGoogle(r.credential, nonce)); } catch (e) { onError(e); } },
  });
  window.google.accounts.id.renderButton(container, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: Math.min(320, container.clientWidth || 320) });
}
export const openGoogleInBrowser = () => tg.openLink(CONFIG.siteUrl + '?auth=google');
