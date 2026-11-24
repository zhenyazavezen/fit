// Тренировочный движок. Не зависит от DOM и браузера: время передаётся параметром now (мс),
// поэтому весь ход тренировки проверяется тестами без реального ожидания.
//
// Шаги (steps):
//   prep    — подготовка перед стартом (не входит в расчётную длительность)
//   work    — рабочий подход; kind 'reps' (цель по повторениям, завершает пользователь)
//             или 'timed' (обратный отсчёт, подход на время без счётчика повторений)
//   switch  — пауза на смену стороны (только для sides = 'sequential')
//   rest    — отдых
// Режимы сторон упражнения (ex.sides):
//   none        — без сторон
//   sequential  — сначала вся работа на правой стороне, затем пауза switchSec и вся работа на левой;
//                 значения времени и повторений заданы на каждую сторону
//   alternating — стороны чередуются внутри одного блока; значения заданы на весь блок
const ENGINE = { prepSec: 5, repSec: 3, restFallback: 30 };

/** Параметры элемента программы с учётом значений упражнения по умолчанию. */
export function resolveItem(item, ex, restBetween) {
  const d = ex.defaults || {};
  const kind = item.seconds != null ? 'timed' : item.reps != null ? 'reps' : ex.mode === 'time' ? 'timed' : 'reps';
  return {
    ex: ex.id,
    kind,
    sets: item.sets ?? d.sets ?? 1,
    reps: kind === 'reps' ? (item.reps ?? d.reps ?? 10) : null,
    seconds: kind === 'timed' ? (item.seconds ?? d.seconds ?? 30) : null,
    rest: item.rest ?? restBetween ?? d.rest ?? ENGINE.restFallback,
    kg: item.kg > 0 ? item.kg : 0,
    sides: ex.sides || 'none',
    switchSec: item.switchSec ?? ex.switchSec ?? 0,
  };
}

/** Строит плоский список шагов. Отдыха после последнего подхода последнего упражнения нет. */
export function buildSteps(items, exById, restBetween) {
  const steps = [];
  items.forEach((raw, itemIdx) => {
    const ex = exById.get ? exById.get(raw.ex) : exById[raw.ex];
    if (!ex) throw new Error('Нет упражнения: ' + raw.ex);
    const it = resolveItem(raw, ex, restBetween);
    for (let set = 1; set <= it.sets; set++) {
      const sides = it.sides === 'sequential' ? ['right', 'left'] : [null];
      sides.forEach((side, k) => {
        const w = { type: 'work', kind: it.kind, itemIdx, ex: it.ex, set, sets: it.sets, side, alternating: it.sides === 'alternating' };
        if (it.kind === 'timed') w.dur = it.seconds; else w.reps = it.reps;
        steps.push(w);
        if (k === 0 && sides.length > 1 && it.switchSec > 0) steps.push({ type: 'switch', dur: it.switchSec, itemIdx, ex: it.ex, set, nextSide: sides[1] });
      });
      const isLast = itemIdx === items.length - 1 && set === it.sets;
      if (!isLast && it.rest > 0) steps.push({ type: 'rest', dur: it.rest, itemIdx, ex: it.ex, set });
    }
  });
  return steps;
}

export const withPrep = (steps, sec = ENGINE.prepSec) => (sec > 0 ? [{ type: 'prep', dur: sec }, ...steps] : steps);

/** Расчётная длительность: точная, если в программе нет подходов на повторения, иначе оценка (repSec на повторение). */
export function estimate(steps) {
  let sec = 0, exact = true;
  for (const s of steps) {
    if (s.type === 'prep') continue;
    if (s.dur != null) sec += s.dur;
    else { sec += s.reps * ENGINE.repSec; exact = false; }
  }
  return { sec, exact };
}

export class Session {
  constructor(steps, { now = Date.now() } = {}) {
    this.steps = steps;
    this.i = 0;
    this.t0 = now;            // начало текущего шага
    this.startedAt = now;
    this.paused = false;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.prepMs = 0;          // время подготовки: в длительность тренировки не входит
    this.done = {};           // индекс шага → 'done' | 'skipped'
    this.extra = {};          // индекс шага → добавленные секунды
    this.finished = false;
    this.endAt = 0;
  }

  get step() { return this.steps[this.i] || null; }
  durMs(i = this.i) { const s = this.steps[i]; return s && s.dur != null ? (s.dur + (this.extra[i] || 0)) * 1000 : null; }
  elapsedMs(now) { return Math.max(0, (this.paused ? this.pausedAt : now) - this.t0); }
  remainingMs(now) { const d = this.durMs(); return d == null ? null : Math.max(0, d - this.elapsedMs(now)); }
  workIndex() { return this.steps.slice(0, this.i + 1).filter((s) => s.type === 'work').length; }
  totalWork() { return this.steps.filter((s) => s.type === 'work').length; }
  itemIdx() { const s = this.step; return s ? s.itemIdx ?? -1 : -1; }

  /** Следующий рабочий шаг после текущего (для подсказки «Далее»). */
  nextWork() { for (let k = this.i + 1; k < this.steps.length; k++) if (this.steps[k].type === 'work') return this.steps[k]; return null; }

  _advance(at) {
    if (this.step.type === 'prep') this.prepMs += Math.max(0, at - this.t0);
    this.i += 1;
    this.t0 = at;
    if (this.i >= this.steps.length) { this.finished = true; this.endAt = at; this.i = this.steps.length - 1; return [{ type: 'finish' }]; }
    return [{ type: 'step', i: this.i }];
  }

  /** Вызывать часто (и после возвращения из фона). Автоматически завершает шаги с таймером; прошедшее время учитывается целиком. */
  tick(now) {
    const events = [];
    if (this.paused || this.finished) return events;
    for (;;) {
      const d = this.durMs();
      if (d == null) break;                         // шаг на повторения ждёт пользователя
      if (now - this.t0 < d) break;
      if (this.step.type === 'work') this.done[this.i] = 'done';
      const endOfStep = this.t0 + d;                // «перенос» остатка: следующий шаг начался в момент окончания этого
      events.push(...this._advance(endOfStep));
      if (this.finished) break;
    }
    return events;
  }

  /** Пользователь отметил подход на повторения выполненным. */
  complete(now) {
    if (this.finished) return [];
    const s = this.step;
    if (s.type === 'work') this.done[this.i] = s.kind === 'reps' ? 'done' : 'skipped';
    return this._advance(this.paused ? this.pausedAt : now);
  }

  /** Пропустить текущий шаг. */
  skip(now) {
    if (this.finished) return [];
    if (this.step.type === 'work') this.done[this.i] = 'skipped';
    return this._advance(this.paused ? this.pausedAt : now);
  }

  /** Вернуться к предыдущему рабочему шагу (или заново начать первый). */
  prev(now) {
    if (this.finished) return [];
    let k = this.i - 1;
    while (k >= 0 && this.steps[k].type !== 'work') k--;
    if (k < 0) k = this.steps.findIndex((s) => s.type === 'work');
    if (k < 0) return [];
    for (let j = k; j < this.steps.length; j++) delete this.done[j];
    this.i = k;
    this.t0 = this.paused ? this.pausedAt : now;
    return [{ type: 'step', i: this.i }];
  }

  /** Досрочное завершение: невыполненные подходы остаются невыполненными. */
  end(now) { if (this.finished) return; this.endAt = this.paused ? this.pausedAt : now; this.finished = true; }

  pause(now) { if (this.paused || this.finished) return; this.paused = true; this.pausedAt = now; }
  resume(now) {
    if (!this.paused) return;
    const gap = now - this.pausedAt;
    this.t0 += gap; this.pausedTotal += gap; this.paused = false;
  }
  addTime(sec) { if (this.step && this.step.dur != null && this.step.type !== 'work') this.extra[this.i] = (this.extra[this.i] || 0) + sec; }

  activeMs(now) {
    const end = this.finished ? this.endAt : this.paused ? this.pausedAt : now;
    return Math.max(0, end - this.startedAt - this.pausedTotal - this.prepMs);
  }

  /** Итог: считаются только выполненные подходы (пропущенные — нет). Подход со сторонами выполнен, если выполнены обе стороны. */
  result(now) {
    const groups = new Map();                       // «упражнение:подход» → все рабочие шаги выполнены
    const byItem = new Map();
    this.steps.forEach((s, idx) => {
      if (s.type !== 'work') return;
      const key = `${s.itemIdx}:${s.set}`;
      groups.set(key, (groups.get(key) ?? true) && this.done[idx] === 'done');
      const it = byItem.get(s.itemIdx) || { ex: s.ex, keys: [] };
      if (!it.keys.includes(key)) it.keys.push(key);
      byItem.set(s.itemIdx, it);
    });
    const setsDone = [...groups.values()].filter(Boolean).length;
    const doneItems = [...byItem.values()].filter((it) => it.keys.every((k) => groups.get(k)));
    const workDone = Object.values(this.done).filter((v) => v === 'done').length;
    return {
      durationSec: Math.round(this.activeMs(now) / 1000),
      setsDone, setsTotal: groups.size,
      exercisesDone: doneItems.length, exercisesTotal: byItem.size,
      exerciseIds: doneItems.map((it) => it.ex),
      completed: this.finished && setsDone === groups.size,
      workDone,
    };
  }

  snapshot(now) {
    return { v: 1, i: this.i, n: this.steps.length, stepElapsedMs: this.elapsedMs(now), done: { ...this.done }, extra: { ...this.extra }, activeMs: this.activeMs(now), finished: this.finished };
  }

  /** Восстановление после закрытия приложения: время «вне приложения» не засчитывается, сессия на паузе. */
  static restore(steps, snap, { now = Date.now() } = {}) {
    if (!snap || snap.v !== 1 || snap.n !== steps.length || snap.finished) return null;
    const s = new Session(steps, { now });
    s.i = Math.min(snap.i, steps.length - 1);
    s.done = { ...snap.done }; s.extra = { ...snap.extra };
    s.t0 = now - snap.stepElapsedMs;
    s.startedAt = now - snap.activeMs;
    s.paused = true; s.pausedAt = now;
    return s;
  }
}
