// Service worker ZAVEZEN_FIT: офлайн-оболочка приложения. Версия подставляется при сборке (tools/stamp.sh), старый кэш удаляется.
// Что кэшируется: страница, стили, скрипты, данные каталога, иллюстрации. Запросы к API (другой домен) НЕ кэшируются и не перехватываются.
// Правило свежести: страница и файлы БЕЗ метки версии (?v=…) берутся из сети в первую очередь, кэш — только без связи.
// Это важно, если сайт опубликован «как есть» (без меток): иначе старые скрипты застревают в кэше навсегда.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'zfit-' + VERSION + '-r3';        // «r3» — ревизия логики кэша; смена удаляет кэши прежних версий
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('zfit-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = (req, key) => fetch(req, { cache: 'no-cache' }).then((r) => {
  if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key || req, copy)); }
  return r;
}).catch(() => caches.match(key || req));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;      // API и внешние ресурсы — напрямую
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, 'index.html')); return; }
  if (url.searchParams.has('v')) {                                               // файл с меткой версии: содержимое не меняется — кэш первым
    e.respondWith(caches.match(req).then((hit) => hit || networkFirst(req)));
    return;
  }
  e.respondWith(networkFirst(req));                                              // без метки версии — сеть первой
});
