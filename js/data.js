// Загрузка и индексация данных каталога. Структура (data/*.json) не зависит от языка,
// тексты — в data/content.<lang>.json; русский — базовый, недостающее берётся из него.
import { CONFIG, BUILD, isStandalone } from './config.js';
import { getLang, t } from './i18n.js';
import { customPrograms, customEx, store, weekPlan } from './store.js';
import { buildSteps, estimate, resolveItem } from './engine.js';

export const D = { cards: {}, meta: null, exercises: [], exById: new Map(), programs: [], progById: new Map(), content: { exercises: {}, programs: {} } };

const j = async (url) => { const r = await fetch(`${url}?v=${BUILD}`); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

export async function loadData() {
  const lang = getLang();
  const [meta, exercises, programs, base, cards] = await Promise.all([j('data/meta.json'), j('data/exercises.json'), j('data/programs.json'), j('data/content.' + CONFIG.defaultLang + '.json'), j('data/cards.json').catch(() => ({}))]);
  let over = { exercises: {}, programs: {} };
  if (lang !== CONFIG.defaultLang) over = await j('data/content.' + lang + '.json').catch(() => over);
  D.cards = isStandalone() ? {} : cards; D.meta = meta; D.exercises = exercises; D.programs = programs;
  D.exById = new Map(exercises.map((e) => [e.id, e]));
  D.progById = new Map(programs.map((p) => [p.id, p]));
  D.content = {
    exercises: Object.fromEntries(exercises.map((e) => [e.id, { ...base.exercises[e.id], ...(over.exercises?.[e.id] || {}) }])),
    programs: Object.fromEntries(programs.map((p) => [p.id, { ...base.programs[p.id], ...(over.programs?.[p.id] || {}) }])),
  };
  applyCustomEx();
}

/** Свои упражнения пользователя: добавляются в индекс (exById), но не в каталог и не в подбор по мышцам. */
export function applyCustomEx() {
  for (const [id, e] of [...D.exById]) if (e.custom) { D.exById.delete(id); delete D.content.exercises[id]; }
  for (const c of customEx.all()) {
    const time = c.mode === 'time';
    D.exById.set(c.id, { id: c.id, custom: true, categories: [c.cat || 'fullbody'], muscles: { primary: [], secondary: [] }, level: 'beginner', mode: time ? 'time' : 'reps', sides: 'none', switchSec: 0, review: 'user', access: 'free', equipment: ['none'], defaults: time ? { sets: 3, seconds: 30, rest: 30 } : { sets: 3, reps: 12, rest: 30 } });
    D.content.exercises[c.id] = { name: c.name, aliases: [], desc: c.note || '', start: '', steps: [], mistakes: [] };
  }
}
store.onChange((_e, k) => { if (k === 'myex' && D.exById.size) applyCustomEx(); });

export const exText = (id) => D.content.exercises[id] || { name: id, steps: [], mistakes: [], aliases: [] };
export const exName = (id) => exText(id).name;

/** Встроенные программы + собственные пользователя. */
const mine = (p) => ({ ...p, items: (p.items || []).filter((i) => D.exById.has(i.ex)), custom: true, goals: [], level: null });
export const allPrograms = () => [...D.programs, ...customPrograms.all().map(mine)];
/** Упражнения дня недели: свой список или (старый формат) состав выбранной программы. */
export function weekItems(wd) {
  const own = weekPlan.own(wd);
  if (own) return own.filter((i) => D.exById.has(i.ex));
  const id = weekPlan.get(wd), p = id && id !== 'rest' ? getProgram(id) : null;
  return p ? p.items.map((i) => ({ ...i })) : [];
}
const weekProgram = (wd) => ({ id: 'wk' + wd, name: t('week.dayWorkout', { day: t('dayfull.' + (wd - 1)) }), items: weekItems(wd), restBetween: 30, custom: true, goals: [], level: null });
export const getProgram = (id) => (/^wk[1-7]$/.test(id) ? weekProgram(+id[2]) : D.progById.get(id) || (customPrograms.get(id) ? mine(customPrograms.get(id)) : null));
export const progText = (p) => (p.custom ? { name: p.name, desc: '' } : D.content.programs[p.id] || { name: p.id, desc: '' });

export const stepsOfItems = (items, restBetween) => buildSteps(items, D.exById, restBetween);
const stepsOfProgram = (p) => stepsOfItems(p.items, p.restBetween);
export const programEstimate = (p) => estimate(stepsOfProgram(p));
export const resolved = (item, restBetween) => resolveItem(item, D.exById.get(item.ex), restBetween);

/** План тренировки для одного упражнения («Попробовать»). */
export function planForExercise(id) {
  const ex = D.exById.get(id);
  return { title: exName(id), programId: null, kind: 'exercise', items: [{ ex: id }], restBetween: ex.defaults.rest };
}
export function planForProgram(p) {
  return { title: progText(p).name, programId: p.id, kind: p.custom ? 'custom' : 'program', items: p.items, restBetween: p.restBetween };
}
