// Клиент серверного API (Cloudflare Worker). Токен хранится только на устройстве (ключ auth).
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
export const apiEnabled = () => !!CONFIG.apiBase;

/** @param {string} path @param {{method?:string, body?:any, token?:string|null, timeoutMs?:number}} [o] */
export async function api(path, { method = 'GET', body, token = null, timeoutMs = 15000 } = {}) {
  if (!CONFIG.apiBase) throw new ApiError(0, 'disabled', 'Сервер не подключён');
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(CONFIG.apiBase + path, {
      method, signal: ctl?.signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError(0, 'network', 'Нет связи с сервером'); } finally { if (timer) clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || 'http_' + res.status, data?.error?.message);
  return data;
}
