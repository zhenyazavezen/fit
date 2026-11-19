// Общие помощники e2e: статический сервер, браузер, сбор ошибок консоли.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

// E2E_DIR — что отдавать (по умолчанию корень проекта; для проверки сборки — каталог _site),
// E2E_BASE — подпапка, в которой «опубликован» сайт, например /fit/ (как https://user.github.io/fit/).
export function serve(dir = process.env.E2E_DIR ? path.resolve(process.env.E2E_DIR) : root) {
  const reqs = [];
  const base = (process.env.E2E_BASE || '/').replace(/\/?$/, '/');
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    reqs.push(u);
    if (!u.startsWith(base)) { res.writeHead(404); res.end('not found'); return; }   // всё вне подпапки недоступно: абсолютные пути сразу ломаются
    u = '/' + u.slice(base.length);
    let f = path.join(dir, u === '/' ? 'index.html' : u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}${base}`, close: () => srv.close(), reqs })));
}

export async function launch() {
  let pw;
  try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/usr/local/lib/node_modules', 'playwright')); }
  return pw.chromium.launch();
}

export async function open(browser, url, { w = 390, h = 844, tgMock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => failed.push(r.url()));
  if (tgMock) await page.addInitScript(tgMock);
  return { ctx, page, errors, failed };
}
