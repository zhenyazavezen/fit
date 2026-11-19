// Поиск и фильтрация упражнений. Чистые функции: данные и тексты передаются параметрами.
import { normalize } from './util.js';

export const emptyFilter = () => ({ q: '', cats: new Set(), levels: new Set(), equip: new Set(), modes: new Set(), muscles: new Set(), favsOnly: false });

export const activeCount = (f) => f.levels.size + f.equip.size + f.modes.size + f.muscles.size + (f.favsOnly ? 1 : 0);
export const isEmpty = (f) => !f.q.trim() && !f.cats.size && !activeCount(f);

/** content: id → {name, aliases}. Поиск по названию и синонимам, ё = е, частичное совпадение слов. */
export function matchesQuery(ex, content, q) {
  const words = normalize(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const c = content[ex.id] || {};
  const hay = normalize([c.name, ...(c.aliases || [])].join(' '));
  return words.every((w) => hay.includes(w));
}

const any = (set, values) => !set.size || values.some((v) => set.has(v));

export function filterExercises(list, content, f, favs = new Set()) {
  return list.filter((ex) =>
    matchesQuery(ex, content, f.q) &&
    any(f.cats, ex.categories) &&
    any(f.levels, [ex.level]) &&
    any(f.equip, ex.equipment) &&
    any(f.modes, [ex.mode]) &&
    any(f.muscles, [...ex.muscles.primary, ...ex.muscles.secondary]) &&
    (!f.favsOnly || favs.has(ex.id)));
}

export const sortByName = (list, content, lang = 'ru') =>
  [...list].sort((a, b) => (content[a.id]?.name || a.id).localeCompare(content[b.id]?.name || b.id, lang));
