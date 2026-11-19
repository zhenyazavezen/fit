// Service worker ZAVEZEN_FIT: офлайн-оболочка приложения. Версия подставляется при сборке (tools/stamp.sh), старый кэш удаляется.
// Что кэшируется: страница, стили, скрипты, данные каталога, иллюстрации. Запросы к API (другой домен) НЕ кэшируются и не перехватываются.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'zfit-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('zfit-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;      // API и внешние ресурсы — напрямую
  if (req.mode === 'navigate') {                                                 // страница: сеть, при отсутствии связи — кэш
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
