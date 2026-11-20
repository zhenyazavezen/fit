// Единая точка настройки приложения. Всё, что может поменяться при публикации, — здесь.
export const CONFIG = {
  appName: 'ZAVEZEN_FIT',
  version: '0.1.0',
  // Языки, которые видит пользователь. Чтобы добавить украинский:
  // 1) locales/uk.json  2) data/content.uk.json  3) добавить 'uk' сюда (см. README).
  enabledLangs: ['ru'],
  defaultLang: 'ru',
  // Куда ведёт «Написать в поддержку». Замените на свой чат, когда он появится.
  supportUrl: 'https://t.me/zhenya_zavezen',
  storePrefix: 'seven:',
  // Серверная часть (Cloudflare Worker «fit»). Пустая строка выключает вход и синхронизацию: приложение работает локально.
  apiBase: 'https://fit.zavezenz.workers.dev',
  // Публичный OAuth Client ID Google (не секрет). Пусто — вход через Google выключен до настройки (см. docs/GOOGLE_OAUTH.md).
  googleClientId: '',
  // Модель доступа: упражнения бесплатны, часть программ — Premium (поле access в data/programs.json).
  // Пока оплата не подключена, false: все программы открыты, Premium лишь помечены. Включайте true вместе с платежами.
  premiumEnforced: false,
  siteUrl: 'https://zhenyazavezen.github.io/fit/',
};

const buildMeta = typeof document === 'undefined' ? null : document.querySelector('meta[name="build"]');
export const BUILD = (buildMeta && buildMeta.content) || 'dev';

/** Автономный файл (один HTML): рядом нет папки assets, иллюстрации не запрашиваются. */
export const isStandalone = () => typeof document !== 'undefined' && !!document.getElementById('app-bundle');
