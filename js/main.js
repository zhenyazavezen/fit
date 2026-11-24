// Точка входа: Telegram → хранилище → язык → данные → маршруты.
import { CONFIG } from './config.js';
import { tg } from './tg.js';
import { migrate, store, useNamespace } from './store.js';
import { onLocalWrite, startSyncTriggers } from './sync.js';
import { resume } from './auth.js';
import { initI18n, t } from './i18n.js';
import { loadData } from './data.js';
import * as router from './router.js';
import { h } from './util.js';
import { initTabbar } from './tabs.js';


/** Скрипт Telegram подключается только внутри Telegram: в обычном браузере лишнего запроса нет. */
function loadTelegram() {
  const inTg = /tgWebAppData|tgWebAppVersion/.test(location.hash) || /Telegram/i.test(navigator.userAgent) || window.TelegramWebviewProxy;
  if (!inTg || window.Telegram?.WebApp) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    const done = () => resolve();
    s.onload = done; s.onerror = done;
    setTimeout(done, 2500);
    document.head.append(s);
  });
}

function showFatal(msg) {
  const screen = document.getElementById('screen');
  screen.replaceChildren(h('div', { class: 'empty', style: { paddingTop: '30vh' } }, h('p', null, msg),
    h('button', { class: 'btn small', onClick: () => location.reload() }, 'OK')));
}

function registerServiceWorker() {
  if (document.getElementById('app-bundle')) return;          // автономный файл: рядом нет sw.js
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.origin)) return;
  const build = document.querySelector('meta[name="build"]')?.content || 'dev';
  navigator.serviceWorker.register('sw.js?v=' + build).catch(() => { /* офлайн-режим недоступен, приложение работает как обычно */ });
  refreshIfStale(build);
}

// Самолечение кэша: если на сервере уже новая сборка, а открыта старая (кэш Telegram/сервис-воркера),
// сбрасываем кэш приложения и один раз перезагружаемся. Данные пользователя (localStorage) не затрагиваются.
async function refreshIfStale(build) {
  if (build === 'dev' || !navigator.onLine) return;
  try {
    const res = await fetch('index.html?_=' + Date.now(), { cache: 'no-store' });
    const latest = /name="build" content="([^"]+)"/.exec(await res.text())?.[1];
    if (!latest || latest === build || latest === 'dev') return;
    if (sessionStorage.getItem('zfit-refreshed') === latest) return;      // не больше одного раза на сборку
    sessionStorage.setItem('zfit-refreshed', latest);
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    for (const k of await caches.keys()) if (k.startsWith('zfit-')) await caches.delete(k);
    location.reload();
  } catch { /* нет связи — работаем как есть */ }
}

async function boot() {
  await loadTelegram();
  tg.init();
  useNamespace(tg.user?.id);                   // личное пространство данных: у каждого аккаунта Telegram свои
  migrate();
  try { await initI18n(tg.user?.language_code); await loadData(); } catch (e) { console.error(e); showFatal(t('app.loadError')); return; }

  const load = (p) => p.then((m) => m.default);
  const [home, workouts, catalog, progress, profile, program, builder, exercise, player, about, plan, bodymap, account, ctab, calendar, compete, myday, level, week, weekday] = await Promise.all([
    load(import('./screens/home.js')), load(import('./screens/workouts.js')), load(import('./screens/catalog.js')), load(import('./screens/progress.js')),
    load(import('./screens/profile.js')), load(import('./screens/program.js')), load(import('./screens/builder.js')), load(import('./screens/exercise.js')),
    load(import('./screens/player.js')), load(import('./screens/about.js')), load(import('./screens/plan.js')), load(import('./screens/bodymap.js')), load(import('./screens/account.js')), load(import('./screens/ctab.js')), load(import('./screens/calendar.js')), load(import('./screens/compete.js')), load(import('./screens/myday.js')), load(import('./screens/level.js')), load(import('./screens/week.js')), load(import('./screens/weekday.js'))]);

  router.register('home', home, { tab: 'home' });
  router.register('workouts', workouts, { tab: 'workouts' });
  router.register('catalog', catalog, { tab: 'catalog' });
  router.register('progress', progress, { tab: 'progress' });
  router.register('profile', profile, { tab: 'profile' });
  router.register('program', program, { tab: 'workouts' });
  router.register('builder', builder, { tab: 'workouts' });
  router.register('exercise', exercise, { tab: 'catalog' });
  router.register('about', about, { tab: 'profile' });
  router.register('plan', plan, { tab: 'workouts' });
  router.register('bodymap', bodymap, { tab: 'workouts' });
  router.register('account', account, { tab: 'profile' });
  router.register('compete', compete, { tab: 'compete' });
  router.register('myday', myday, { tab: 'home' });
  router.register('level', level, { tab: 'workouts' });
  router.register('week', week, { tab: 'workouts' });
  router.register('weekday', weekday, { tab: 'workouts' });
  router.register('ctab', ctab, { tab: (p) => p.id });
  router.register('calendar', calendar, { tab: 'home' });
  router.register('player', player, { tabs: false });

  const tabbar = document.getElementById('tabbar');
  initTabbar(tabbar);
  document.title = CONFIG.appName;
  store.setWriteHook(onLocalWrite);
  startSyncTriggers();
  await router.start({ screen: document.getElementById('screen'), tabbar, initial: startScreen() });
  resume().catch(() => {});                      // тихо вернуть сессию и синхронизироваться; без входа ничего не происходит
  registerServiceWorker();
}

// Ссылки вида t.me/ZAVEZEN_FIT_BOT/app?startapp=plan открывают нужный экран. Только белый список, остальное игнорируется.
const START_SCREENS = { compete: 'compete', home: 'home', workouts: 'workouts', catalog: 'catalog', progress: 'progress', profile: 'profile', plan: 'plan', map: 'bodymap', account: 'account' };
function startScreen() { return START_SCREENS[tg.startParam] || 'home'; }

boot().catch((e) => { console.error(e); showFatal(String(e?.message || e)); });
