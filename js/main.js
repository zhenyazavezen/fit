// Точка входа: Telegram → хранилище → язык → данные → маршруты.
import { CONFIG } from './config.js';
import { tg } from './tg.js';
import { migrate, store } from './store.js';
import { onLocalWrite, startSyncTriggers } from './sync.js';
import { resume } from './auth.js';
import { initI18n, t } from './i18n.js';
import { loadData } from './data.js';
import * as router from './router.js';
import { h, icon } from './util.js';

const TABS = [['home', 'home'], ['workouts', 'workouts'], ['catalog', 'catalog'], ['progress', 'progress'], ['profile', 'profile']];

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
}

async function boot() {
  await loadTelegram();
  tg.init();
  migrate();
  try { await initI18n(tg.user?.language_code); await loadData(); } catch (e) { console.error(e); showFatal(t('app.loadError')); return; }

  const load = (p) => p.then((m) => m.default);
  const [home, workouts, catalog, progress, profile, program, builder, exercise, player, about, plan, bodymap, account] = await Promise.all([
    load(import('./screens/home.js')), load(import('./screens/workouts.js')), load(import('./screens/catalog.js')), load(import('./screens/progress.js')),
    load(import('./screens/profile.js')), load(import('./screens/program.js')), load(import('./screens/builder.js')), load(import('./screens/exercise.js')),
    load(import('./screens/player.js')), load(import('./screens/about.js')), load(import('./screens/plan.js')), load(import('./screens/bodymap.js')), load(import('./screens/account.js'))]);

  router.register('home', home, { tab: 'home' });
  router.register('workouts', workouts, { tab: 'workouts' });
  router.register('catalog', catalog, { tab: 'catalog' });
  router.register('progress', progress, { tab: 'progress' });
  router.register('profile', profile, { tab: 'profile' });
  router.register('program', program, { tab: 'workouts' });
  router.register('builder', builder, { tab: 'workouts' });
  router.register('exercise', exercise, { tab: 'catalog' });
  router.register('about', about, { tab: 'profile' });
  router.register('plan', plan, { tab: 'profile' });
  router.register('bodymap', bodymap, { tab: 'catalog' });
  router.register('account', account, { tab: 'profile' });
  router.register('player', player, { tabs: false });

  const tabbar = document.getElementById('tabbar');
  tabbar.replaceChildren(...TABS.map(([name, ic]) => h('button', { dataset: { tab: name }, type: 'button' }, icon(ic), h('span', null, t('tab.' + name)))));
  document.title = CONFIG.appName;
  store.setWriteHook(onLocalWrite);
  startSyncTriggers();
  const wantAuth = /[?&]auth=google\b/.test(location.search);
  await router.start({ screen: document.getElementById('screen'), tabbar, initial: wantAuth ? 'account' : 'home' });
  resume().catch(() => {});                      // тихо вернуть сессию и синхронизироваться; без входа ничего не происходит
  registerServiceWorker();
}

boot().catch((e) => { console.error(e); showFatal(String(e?.message || e)); });
