// Личный профиль: параметры хранятся на устройстве (ключ profile) и синхронизируются при входе в аккаунт.
// Профиль нужен только для прозрачных подсказок (см. planner.js): никакого ИИ, каждая подсказка объясняется.
import { store } from './store.js';

export const LEVELS = ['beginner', 'intermediate', 'advanced'];
export const PROFILE_GOALS = ['lose', 'muscle', 'strength', 'health', 'shape'];
const LEGACY_GOAL = { fitness: 'health', endurance: 'shape', gpp: 'shape' };   // старые значения профиля
export const PROFILE_EQUIP = ['chair', 'wall', 'backpack', 'towel'];
export const PROFILE_LIMITS = ['impact', 'wrist', 'knee', 'shoulder', 'back'];

export const DEFAULT_PROFILE = Object.freeze({
  age: null, heightCm: null, weightKg: null,
  level: 'beginner', goal: 'health', days: [], time: '', equipment: ['chair', 'wall'], minutes: 20, limits: [],
  updatedAt: 0,
});

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
const pick = (arr, allowed) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => allowed.includes(x)))];

/** Приводит любые данные к допустимому профилю: неверное значение заменяется значением по умолчанию. */
export function normalizeProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    age: num(p.age, 14, 99), heightCm: num(p.heightCm, 100, 230), weightKg: num(p.weightKg, 30, 300),
    level: LEVELS.includes(p.level) ? p.level : DEFAULT_PROFILE.level,
    goal: PROFILE_GOALS.includes(LEGACY_GOAL[p.goal] || p.goal) ? (LEGACY_GOAL[p.goal] || p.goal) : DEFAULT_PROFILE.goal,
    days: [...new Set((Array.isArray(p.days) ? p.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    time: typeof p.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) ? p.time : '',
    equipment: pick(p.equipment, PROFILE_EQUIP),
    minutes: [5, 10, 15, 20, 30].includes(Number(p.minutes)) ? Number(p.minutes) : Number(p.minutes) > 30 ? 30 : DEFAULT_PROFILE.minutes,
    limits: pick(p.limits, PROFILE_LIMITS),
    updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
  };
}

export const userProfile = {
  has() { return !!store.get('profile', null); },
  get() { return normalizeProfile(store.get('profile', null)); },
  set(patch) { return store.set('profile', { ...normalizeProfile({ ...this.get(), ...patch }), updatedAt: Date.now() }); },
};

export const bmi = (p) => (p.heightCm && p.weightKg ? p.weightKg / ((p.heightCm / 100) ** 2) : null);
