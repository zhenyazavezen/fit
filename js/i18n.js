// Локализация. Интерфейс: locales/<lang>.json. Тексты упражнений и программ: data/content.<lang>.json (см. data.js).
// Русский — базовый язык: чего нет в другом языке, берётся из русского, поэтому добавление языка не ломает приложение.
import { CONFIG, BUILD } from './config.js';

let lang = CONFIG.defaultLang;
let dict = {};
let base = {};
let rules = new Intl.PluralRules(lang);

async function fetchJson(url) {
  const r = await fetch(`${url}?v=${BUILD}`);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function pickLang(preferred) {
  const enabled = CONFIG.enabledLangs;
  const short = (s) => String(s || '').toLowerCase().slice(0, 2);
  for (const c of [preferred, ...(navigator.languages || [navigator.language])]) {
    if (enabled.includes(short(c))) return short(c);
  }
  return CONFIG.defaultLang;
}

export async function initI18n(preferred) {
  lang = pickLang(preferred);
  base = await fetchJson('locales/' + CONFIG.defaultLang + '.json');
  dict = lang === CONFIG.defaultLang ? base : await fetchJson('locales/' + lang + '.json').catch(() => ({}));
  rules = new Intl.PluralRules(lang);
  document.documentElement.lang = lang;
  return lang;
}

export const getLang = () => lang;

/** t('key', {n: 3, name: 'x'}). Значение-объект {one, few, many, other} выбирается по vars.n. */
export function t(key, vars = {}) {
  let v = dict[key] ?? base[key];
  if (v == null) { console.warn('[i18n] нет ключа', key); return key; }
  if (typeof v === 'object') v = v[rules.select(vars.n ?? 0)] ?? v.other ?? v.many ?? Object.values(v)[0];
  return String(v).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

/** Для тестов и валидации: подмена словарей без сети. */
