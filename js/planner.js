// Прозрачный подбор программ и упражнений по профилю. Чистые функции без DOM и без ИИ:
// каждый балл и каждое ограничение возвращается вместе с причиной (reasons / warnings),
// чтобы интерфейс мог объяснить пользователю, почему выбрано именно это.
// Все пороги — рабочие правила практики (docs/PROGRESSION.md), а не медицинские выводы.
import { buildSteps, estimate } from './engine.js';
import { bmi } from './profile-data.js';

const LV = { beginner: 0, intermediate: 1, advanced: 2 };
const GOAL_TAGS = { strength: ['strength'], muscle: ['muscle'], lose: ['weight', 'activity'], health: ['home', 'activity'], shape: ['shape', 'activity', 'home'] };
export const RECOVERY_HOURS = 48;
export const BREAK_DAYS = 21;
export const MAX_GROUPS = 3;

const isLoad = (ex) => !ex.categories.includes('stretch') && !ex.categories.includes('mobility');

/** Сколько часов прошло с последней нагрузки на каждую основную мышцу (по истории: exerciseIds). */
export function muscleRecovery(history, exById, now = Date.now()) {
  const last = new Map();
  for (const s of history || []) {
    for (const id of s.exerciseIds || []) {
      const ex = exById.get(id);
      if (!ex || !isLoad(ex)) continue;
      for (const m of ex.muscles.primary) last.set(m, Math.max(last.get(m) || 0, s.at));
    }
  }
  return new Map([...last].map(([m, at]) => [m, (now - at) / 3_600_000]));
}
export const recentMuscles = (rec) => new Set([...rec].filter(([, h]) => h < RECOVERY_HOURS).map(([m]) => m));

const sessionAges = (history, now) => (history || []).map((s) => (now - s.at) / 86_400_000);
export const returningAfterBreak = (history, now = Date.now()) => { const a = sessionAges(history, now); return a.length > 0 && Math.min(...a) > BREAK_DAYS; };

export const lowImpactPreferred = (profile) => (profile.age ?? 0) >= 60 || (bmi(profile) ?? 0) >= 30 || profile.limits.includes('impact');

const itemSets = (it, ex) => it.sets ?? ex.defaults.sets;
export function programMinutes(p, exById) { const e = estimate(buildSteps(p.items, exById, p.restBetween)); return Math.max(1, Math.round(e.sec / 60)); }

/** Недостающее оборудование программы относительно профиля. */
export function missingEquipment(items, exById, profile) {
  const have = new Set(['none', ...profile.equipment]);
  const miss = new Set();
  for (const it of items) for (const e of exById.get(it.ex).equipment) if (!have.has(e)) miss.add(e);
  return [...miss];
}

/** Сколько упражнений программы конфликтуют с исключёнными пользователем нагрузками. */
export const conflicts = (items, exById, profile) => items.filter((it) => (exById.get(it.ex).stress || []).some((s) => profile.limits.includes(s)));

export function scoreProgram(p, profile, ctx) {
  const { exById, history = [], now = Date.now() } = ctx;
  const reasons = [], warnings = [];
  let score = 0, excluded = null;
  const isRecovery = p.id.startsWith('r');

  if (LV[p.level] > LV[profile.level]) excluded = 'level';
  if ((profile.age ?? 0) >= 60 && p.level === 'advanced') excluded = 'age';
  if (excluded) return { program: p, score: -Infinity, reasons, warnings, excluded };

  if (p.level === profile.level) { score += 3; reasons.push({ key: 'level' }); } else if (!isRecovery) { score += 1; reasons.push({ key: 'levelBelow' }); }

  const tags = GOAL_TAGS[profile.goal] || [];
  if ((p.goals || []).some((g) => tags.includes(g))) { score += 3; reasons.push({ key: 'goal' }); }

  const min = programMinutes(p, exById);
  if (min <= profile.minutes) { score += 2; reasons.push({ key: 'time', min }); }
  else if (min <= profile.minutes + 5) { score += 0; warnings.push({ key: 'timeOver', min }); }
  else { score -= 3; warnings.push({ key: 'timeOver', min }); }

  const miss = missingEquipment(p.items, exById, profile);
  if (miss.length) { score -= 2 * miss.length; warnings.push({ key: 'equipment', list: miss }); }

  const bad = conflicts(p.items, exById, profile);
  if (bad.length) {
    if (bad.length / p.items.length > 0.25) { return { program: p, score: -Infinity, reasons, warnings: [...warnings, { key: 'limits', n: bad.length }], excluded: 'limits' }; }
    score -= 3 * bad.length; warnings.push({ key: 'limits', n: bad.length });
  } else if (profile.limits.length) reasons.push({ key: 'noConflicts' });

  const impact = p.items.some((it) => (exById.get(it.ex).stress || []).includes('impact'));
  if (lowImpactPreferred(profile) && impact) { score -= 2; warnings.push({ key: 'impact' }); }

  const rec = recentMuscles(muscleRecovery(history, exById, now));
  if (!isRecovery && rec.size) {
    let total = 0, hit = 0;
    for (const it of p.items) { const ex = exById.get(it.ex); if (!isLoad(ex)) continue; const n = itemSets(it, ex); total += n; if (ex.muscles.primary.some((m) => rec.has(m))) hit += n; }
    if (total && hit / total > 0.5) { score -= 3; warnings.push({ key: 'recovering', muscles: [...rec] }); }
  }
  if (isRecovery && rec.size) { score += 1; reasons.push({ key: 'recoveryDay' }); }

  if (returningAfterBreak(history, now) && p.level !== 'beginner') { score -= 2; warnings.push({ key: 'afterBreak' }); }
  if (returningAfterBreak(history, now) && p.level === 'beginner' && !isRecovery) { score += 1; reasons.push({ key: 'afterBreakOk' }); }
  return { program: p, score, reasons, warnings, excluded: null, minutes: min };
}

export function recommendPrograms(profile, ctx, { limit = 3, programs } = {}) {
  const list = (programs || ctx.programs || []).filter((p) => !p.custom).map((p) => scoreProgram(p, profile, ctx)).filter((r) => !r.excluded);
  return list.sort((a, b) => b.score - a.score || LV[b.program.level] - LV[a.program.level] || a.program.id.localeCompare(b.program.id)).slice(0, limit);
}

/** Упражнения для выбранных мышц с учётом профиля: основной вклад — primary, затем secondary. */
export function exercisesForMuscles(muscles, profile, ctx, { limit = 10 } = {}) {
  const { exById, history = [], now = Date.now() } = ctx;
  const want = new Set(muscles), rec = recentMuscles(muscleRecovery(history, exById, now));
  const have = new Set(['none', ...profile.equipment]);
  const out = [];
  for (const ex of exById.values()) {
    if (ex.custom || !isLoad(ex)) continue;
    const prim = ex.muscles.primary.filter((m) => want.has(m)), sec = ex.muscles.secondary.filter((m) => want.has(m));
    if (!prim.length) continue;
    if (LV[ex.level] > LV[profile.level]) continue;
    if (ex.equipment.some((e) => !have.has(e))) continue;
    if ((ex.stress || []).some((s) => profile.limits.includes(s))) continue;
    out.push({ id: ex.id, score: 2 * prim.length + sec.length, level: ex.level, recovering: [...new Set(prim.filter((m) => rec.has(m)))] });
  }
  return out.sort((a, b) => b.score - a.score || Math.abs(LV[a.level] - LV[profile.level]) - Math.abs(LV[b.level] - LV[profile.level]) || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Программы, у которых основная часть рабочих подходов приходится на выбранные мышцы. */
export function programsForMuscles(muscles, profile, ctx, { limit = 3, programs } = {}) {
  const { exById } = ctx, want = new Set(muscles);
  const res = [];
  for (const p of (programs || ctx.programs || []).filter((x) => !x.custom && !x.id.startsWith('r'))) {
    let total = 0, hit = 0;
    for (const it of p.items) { const ex = exById.get(it.ex); if (!isLoad(ex)) continue; const n = itemSets(it, ex); total += n; if (ex.muscles.primary.some((m) => want.has(m))) hit += n; }
    if (!total || hit / total < 0.3) continue;
    const s = scoreProgram(p, profile, ctx);
    if (s.excluded) continue;
    res.push({ ...s, coverage: hit / total });
  }
  return res.sort((a, b) => b.coverage - a.coverage || b.score - a.score).slice(0, limit);
}

/** Предупреждения о перегрузке для выбранных групп. */
export function loadAdvice(groupCount, muscles, history, exById, now = Date.now()) {
  const rec = recentMuscles(muscleRecovery(history, exById, now));
  return { tooMany: groupCount > MAX_GROUPS, recovering: muscles.filter((m) => rec.has(m)) };
}
