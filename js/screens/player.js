// Экран тренировки: крупный таймер или число повторений, инструкция текстом, пауза, переходы, выход, итог.
import { h, icon, fmtClock } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { tg } from '../tg.js';
import { settings, activeSession, history } from '../store.js';
import { Session, withPrep } from '../engine.js';
import { D, exText, exName, stepsOfItems, resolved } from '../data.js';
import { doseLabel, sideLabel, spentLabel } from '../format.js';
import { beep, haptic } from '../feedback.js';
import { sheet, toast } from '../ui.js';

export default function player(params = {}) {
  let plan, steps, session;
  const fail = (msg) => { toast(msg); setTimeout(() => router.openTab('home'), 0); return { el: h('div') }; };
  try {
    if (params.resume) {
      const saved = activeSession.get();
      plan = saved.plan; steps = withPrep(stepsOfItems(plan.items, plan.restBetween));
      session = Session.restore(steps, saved.snap, { now: Date.now() });
      if (!session) { activeSession.clear(); return fail(t('player.resumeFailed')); }
    } else {
      plan = params.plan; steps = withPrep(stepsOfItems(plan.items, plan.restBetween));
      session = new Session(steps, { now: Date.now() });
    }
  } catch (e) { console.error(e); activeSession.clear(); return fail(t('player.resumeFailed')); }

  const nItems = plan.items.length;
  const el = h('div', { class: 'player' });
  const top = h('div', { class: 'p-top' }), segs = h('div', { class: 'p-segs', 'aria-hidden': 'true' }), body = h('div', { class: 'p-body' }), controls = h('div', { class: 'p-controls' });
  el.append(top, segs, body, controls);

  let timerId = null, lastCue = null, saved = 0, wake = null, offBack = null, howOpen = false, over = false, exiting = false;
  let timeEl = null, barEl = null, segEls = [];

  const focusStep = () => { const s = session.step; return s.type === 'work' ? s : (s.type === 'prep' ? steps.find((x) => x.type === 'work') : session.nextWork() || steps.filter((x) => x.type === 'work').pop()); };

  function persist(now = Date.now()) {
    if (over) return;
    activeSession.set({ plan, snap: session.snapshot(now), savedAt: now });
    saved = now;
  }

  // ----- отрисовка шага
  function render() {
    const s = session.step, f = focusStep(), now = Date.now();
    const paused = session.paused, timedWork = s.type === 'work' && s.kind === 'timed';
    const itemI = f.itemIdx;
    lastCue = null;

    top.replaceChildren(
      h('button', { class: 'icon-btn', 'aria-label': t('player.exit'), onClick: openExit }, icon('x')),
      h('div', { class: 'p-count' }, t('player.counter', { i: itemI + 1, n: nItems })),
      timedWork ? h('div', { class: 'icon-btn', style: { visibility: 'hidden' } })
        : h('button', { class: 'icon-btn', 'aria-label': paused ? t('player.resume') : t('player.pause'), onClick: togglePause }, icon(paused ? 'play' : 'pause')));

    segEls = plan.items.map((_, i) => { const b = h('b'); return { i, b, wrap: h('i', null, b) }; });
    segs.replaceChildren(...segEls.map((x) => x.wrap));

    const phaseKey = paused ? 'paused' : s.type === 'prep' ? 'prep' : s.type === 'work' ? 'work' : s.type === 'switch' ? 'switch' : 'rest';
    const parts = [];
    if (f.sets > 1) parts.push(t('player.set', { i: f.set, n: f.sets }));
    if (f.side) parts.push(sideLabel(f.side)); else if (f.alternating) parts.push(t('player.alternating'));
    const ex = D.exById.get(f.ex), text = exText(f.ex);

    const big = h('div', { class: 'p-big num' + (s.type === 'work' && s.kind === 'reps' ? ' reps' : ''), 'aria-live': 'off' });
    let sub = null, bar = null;
    if (s.type === 'work' && s.kind === 'reps') { big.textContent = String(s.reps); sub = h('div', { class: 'p-sub' }, t('player.repsLabel')); timeEl = null; barEl = null; }
    else { timeEl = big; big.textContent = fmtClock(session.remainingMs(now) / 1000); barEl = h('b'); bar = h('div', { class: 'p-bar' }, barEl); }

    const how = h('div', { class: 'p-how' }, h('div', { class: 'start' }, text.start));
    if (howOpen) how.append(h('ol', { class: 'steps' }, ...text.steps.map((x) => h('li', null, h('span', null, x)))));
    how.append(h('button', { class: 'link-btn', onClick: () => { howOpen = !howOpen; render(); } }, howOpen ? t('player.hideTechnique') : t('player.technique')));

    const nw = session.nextWork();
    let next = '';
    if (s.type === 'work') {
      if (!nw) next = t('player.lastOne');
      else if (nw.itemIdx === f.itemIdx) next = nw.side === 'left' ? t('player.nextSide') : '';
      else next = `${t('player.nextUp')}: ${exName(nw.ex)} · ${doseLabel(resolved(plan.items[nw.itemIdx], plan.restBetween))}`;
    }
    const nameShown = s.type === 'prep' ? plan.title : text.name;

    body.replaceChildren(...[
      h('div', { class: 'p-phase' + (phaseKey === 'work' ? ' work' : '') }, t('player.' + phaseKey)),
      s.type === 'rest' || s.type === 'switch' ? h('div', { class: 'eyebrow' }, t('player.nextUp')) : null,
      h('h1', { class: 'p-name' }, nameShown), parts.length ? h('div', { class: 'p-meta' }, parts.join(' · ')) : null,
      big, sub, bar,
      s.type === 'rest' || s.type === 'switch' ? h('button', { class: 'chip p-extra', onClick: () => { session.addTime(15); haptic('light'); update(); persist(); } }, t('player.addTime')) : null,
      s.type === 'prep' ? null : how,
      next ? h('div', { class: 'p-next' }, next) : null].filter(Boolean));
    body.scrollTop = 0;

    // главная кнопка и соседние
    const mainLabel = paused ? t('player.resume') : s.type === 'work' && s.kind === 'reps' ? t('player.done') : timedWork ? t('player.pause') : t('player.skip');
    const mainIcon = paused ? 'play' : s.type === 'work' && s.kind === 'reps' ? 'check' : timedWork ? 'pause' : 'next';
    controls.replaceChildren(
      h('button', { class: 'icon-btn', 'aria-label': t('player.prev'), onClick: () => { act(() => session.prev(Date.now())); } }, icon('prev')),
      h('button', { class: 'btn', onClick: onMain }, icon(mainIcon), mainLabel),
      h('button', { class: 'icon-btn', 'aria-label': t('player.skip'), onClick: () => { act(() => session.skip(Date.now())); } }, icon('next')));
    update(now);
  }

  function update(now = Date.now()) {
    if (timeEl) {
      const rem = session.remainingMs(now) / 1000;
      timeEl.textContent = fmtClock(rem);
      const d = session.durMs();
      if (barEl && d) barEl.style.setProperty('--p', String(Math.min(1, session.elapsedMs(now) / d)));
      const sec = Math.ceil(rem);
      if (!session.paused && sec <= 3 && sec > 0 && sec !== lastCue) { lastCue = sec; beep('tick'); }
    }
    const cur = session.step?.itemIdx;
    segEls.forEach(({ i, b }) => {
      let p = 0;
      if (cur != null && i < cur) p = 1;
      else if (i === cur) { const own = steps.map((s, k) => [s, k]).filter(([s]) => s.type === 'work' && s.itemIdx === i); p = own.filter(([, k]) => session.done[k]).length / own.length; }
      if (session.finished) p = 1;
      b.style.setProperty('--p', String(p));
    });
  }

  // ----- действия
  function handle(events) {
    if (!events.length) return;
    if (events.some((e) => e.type === 'finish')) { finish(); return; }
    const s = session.step;
    if (events.length === 1 && s.type === 'work') { beep('go'); haptic('medium'); } else if (events.length === 1) haptic('light');
    render(); persist();
  }
  function act(fn) { handle(fn()); }
  function onMain() {
    const s = session.step, now = Date.now();
    if (session.paused) { togglePause(); return; }
    if (s.type === 'work' && s.kind === 'reps') { haptic('medium'); act(() => session.complete(now)); }
    else if (s.type === 'work') togglePause();
    else act(() => session.skip(now));
  }
  function togglePause() {
    const now = Date.now();
    if (session.paused) { session.resume(now); lock(); } else session.pause(now);
    haptic('light'); render(); persist(now);
  }
  function loop() {
    const now = Date.now();
    handle(session.tick(now));
    if (!over) { update(now); if (now - saved > 10_000) persist(now); }
  }
  const onVis = () => { if (document.hidden) persist(); else { loop(); lock(); } };

  async function lock() {
    if (!settings.get().wake || over) return;
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
  }

  // ----- выход и итог
  function openExit() {
    if (over) return;
    const wasPaused = session.paused;
    if (!wasPaused) { session.pause(Date.now()); render(); }
    const r = session.result(Date.now());
    let decided = false;
    const choose = (fn) => { decided = true; s.close(); fn(); };
    const s = sheet({
      title: t('player.exitTitle'),
      body: [h('p', { class: 'muted' }, t('player.exitText'))],
      foot: null,
      onClose: () => { if (!decided && !wasPaused && !over) { session.resume(Date.now()); render(); persist(); } },
    });
    const col = h('div', { class: 'stack', style: { gap: '10px', padding: '0 20px 16px' } },
      h('button', { class: 'btn', onClick: () => s.close() }, t('player.exitContinue')),
      h('button', { class: 'btn secondary', onClick: () => choose(() => { persist(); leave(); }) }, t('player.exitLater')),
      r.setsDone > 0 ? h('button', { class: 'btn secondary', onClick: () => choose(() => { session.end(Date.now()); finish(); }) }, t('player.exitSave')) : null,
      h('button', { class: 'btn danger', onClick: () => choose(() => { activeSession.clear(); over = true; toast(t('player.sessionCleared')); leave(); }) }, t('player.exitDiscard')));
    s.root.querySelector('.sheet').append(col);
  }
  function leave() { exiting = true; cleanup(); router.back(); }

  function finish() {
    if (over) return;
    over = true; cleanup(true);
    const now = Date.now(), r = session.result(now);
    let savedOk = true;
    if (r.setsDone > 0) {
      savedOk = !!history.add({ at: now, startedAt: now - r.durationSec * 1000, durationSec: r.durationSec, title: plan.title, programId: plan.programId, kind: plan.kind,
        setsDone: r.setsDone, exercisesDone: r.exercisesDone, exerciseIds: r.exerciseIds, completed: r.completed });
    }
    activeSession.clear();
    tg.confirmClose(false);
    beep('done'); haptic('success');
    if (!savedOk) toast(t('player.saveFailed'), 4000);
    el.replaceChildren(h('div', { class: 'p-body p-finish' },
      h('div', { class: 'p-phase work' }, t(r.completed ? 'player.finishTitle' : 'player.finishPartial')),
      h('h1', { class: 'p-name' }, plan.title),
      h('div', { class: 'p-big num', style: { fontSize: '64px' } }, spentLabel(r.durationSec)),
      h('div', { class: 'facts', style: { marginTop: '16px' } },
        h('div', { class: 'fact' }, h('div', { class: 'v' }, `${r.setsDone}/${r.setsTotal}`), h('div', { class: 'l' }, t('player.finishSets'))),
        h('div', { class: 'fact' }, h('div', { class: 'v' }, `${r.exercisesDone}/${r.exercisesTotal}`), h('div', { class: 'l' }, t('player.finishExercises'))),
        h('div', { class: 'fact' }, h('div', { class: 'v' }, spentLabel(r.durationSec)), h('div', { class: 'l' }, t('player.finishTime'))))),
      h('div', { class: 'p-controls', style: { gridTemplateColumns: '1fr' } },
        h('button', { class: 'btn', onClick: () => router.openTab('home') }, t('player.finishHome')),
        h('button', { class: 'btn ghost', onClick: () => router.openTab('progress') }, t('player.finishProgress'))));
  }

  function cleanup(keepGuard) {
    clearInterval(timerId); timerId = null;
    document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', persistHide);
    try { wake?.release?.(); } catch { /* ignore */ }
    wake = null;
    if (!keepGuard) { offBack?.(); offBack = null; }
    else { offBack?.(); offBack = null; }
    tg.confirmClose(false);
  }
  const persistHide = () => persist();

  return {
    el,
    onShow() {
      tg.confirmClose(true);
      offBack = router.onBack(openExit);
      document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', persistHide);
      if (params.resume) session.paused = true;
      if (!session.paused) lock();
      render(); persist();
      timerId = setInterval(loop, 200);
    },
    destroy() { if (!over && !exiting) { persist(); } cleanup(); },
  };
}
