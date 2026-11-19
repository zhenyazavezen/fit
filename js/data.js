// Загрузка и индексация данных каталога. Структура (data/*.json) не зависит от языка,
// тексты — в data/content.<lang>.json; русский — базовый, недостающее берётся из него.
import { CONFIG, BUILD, isStandalone } from './config.js';
import { getLang } from './i18n.js';
import { customPrograms } from './store.js';
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
}

export const exText = (id) => D.content.exercises[id] || { name: id, steps: [], mistakes: [], aliases: [] };
export const exName = (id) => exText(id).name;

/** Встроенные программы + собственные пользователя. */
export const allPrograms = () => [...D.programs, ...customPrograms.all().map((p) => ({ ...p, custom: true, goals: [], level: null }))];
export const getProgram = (id) => D.progById.get(id) || (customPrograms.get(id) ? { ...customPrograms.get(id), custom: true, goals: [], level: null } : null);
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
