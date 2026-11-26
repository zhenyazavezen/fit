// Экран тренировки: крупный таймер или число повторений, инструкция текстом, пауза, переходы, выход, итог.
import { h, icon, fmtClock, countUp, svgEl } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { tg } from '../tg.js';
import { settings, activeSession, history } from '../store.js';
import { Session, withPrep } from '../engine.js';
import { D, exText, exName, stepsOfItems, resolved } from '../data.js';
import { doseLabel, sideLabel, spentLabel } from '../format.js';
import { beep, haptic } from '../feedback.js';
import { startMusic, stopMusic } from '../music.js';
import { sheet, toast } from '../ui.js';
import { streak } from '../stats.js';
import { CONFIG } from '../config.js';
import { api, apiEnabled } from '../api.js';
import { auth } from '../auth.js';
import { syncNow } from '../sync.js';

// Последняя запись нагрузки по упражнению из прошлых тренировок.
const lastLog = (hist, ex) => { for (let i = hist.length - 1; i >= 0; i--) { const l = hist[i].log?.find((x) => x.ex === ex); if (l) return l; } return null; };
/** Сравнение с прошлым разом: «+2 повт.», «+5 кг», «Без изменений», «Новое». */
function changeText(cur, prev) {
  if (!prev) return t('finish.new');
  const vol = (l) => (l.seconds != null ? l.sets * l.seconds : l.sets * (l.reps || 0));
  const sameKind = (prev.seconds != null) === (cur.seconds != null);
  const parts = [], dv = sameKind ? vol(cur) - vol(prev) : 0, dk = Math.round(((cur.kg || 0) - (prev.kg || 0)) * 10) / 10;
  const sign = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
  if (dv) parts.push(t(cur.seconds != null ? 'finish.secs' : 'finish.reps', { n: sign(dv) }));
  if (dk) parts.push(t('finish.kg', { n: sign(dk) }));
  return parts.length ? parts.join(' · ') : t('finish.same');
}

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
    if (events.length === 1 && s.type === 'work') { beep('go'); haptic('medium'); } else if (events.length === 1) { if (s.type === 'rest' || s.type === 'switch') beep('rest'); haptic('light'); }
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
    if (!over) { update(now); if (now - saved > 10_000) persist(now); session.paused ? stopMusic() : startMusic(); }
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
    const now = Date.now(), r = session.result(now), before = history.all();
    let savedOk = true, log = [];
    if (r.setsDone > 0) {
      savedOk = !!history.add({ at: now, startedAt: now - r.durationSec * 1000, durationSec: r.durationSec, title: plan.title, programId: plan.programId, kind: plan.kind,
        setsDone: r.setsDone, exercisesDone: r.exercisesDone, exerciseIds: r.exerciseIds, completed: r.completed,
        log: (log = r.exerciseIds.map((id) => plan.items.find((i) => i.ex === id)).filter(Boolean).map((i) => { const x = resolved(i, plan.restBetween); const o = { ex: x.ex, sets: x.sets }; if (x.kind === 'reps') o.reps = x.reps; else o.seconds = x.seconds; if (x.kg) o.kg = x.kg; return o; })) });
    }
    activeSession.clear();
    tg.confirmClose(false);
    beep('done'); haptic('success');
    if (!savedOk) toast(t('player.saveFailed'), 4000);
    const days = streak(history.all(), now), mins = Math.max(1, Math.round(r.durationSec / 60));
    const changes = log.map((l) => ({ ex: l.ex, text: changeText(l, lastLog(before, l.ex)) }));
    const rankBox = h('div', { class: 'card row-flex seq', style: { '--i': '0' }, hidden: true });
    const shareText = t('finish.shareText', { min: mins, sets: r.setsDone, days: Math.max(1, days) });
    const nums = { mins: h('div', { class: 'v' }), sets: h('div', { class: 'v' }), days: h('div', { class: 'v' }) };
    let seq = 0; const s = (extra, style = {}) => ({ class: 'seq' + (extra ? ' ' + extra : ''), style: { '--i': String(seq++), ...style } });
    const ring = svgEl('svg', { class: 'fin-ring', viewBox: '0 0 84 84', 'aria-hidden': 'true' }, svgEl('circle', { cx: 42, cy: 42, r: 36 }), svgEl('path', { d: 'M27 43l10 10 20-22' }));
    el.replaceChildren(h('div', { class: 'p-body p-finish', style: { overflowY: 'auto' } },
      ring,
      h('h1', s('p-name', { marginTop: '0' }), t('finish.title')),
      h('div', s('muted', { textAlign: 'center' }), t(r.completed ? 'finish.sub' : 'player.finishPartial')),
      h('div', s('facts', { marginTop: '16px' }),
        h('div', { class: 'fact' }, nums.mins, h('div', { class: 'l' }, t('finish.minutes'))),
        h('div', { class: 'fact' }, nums.sets, h('div', { class: 'l' }, t('finish.sets'))),
        h('div', { class: 'fact' }, nums.days, h('div', { class: 'l' }, t('finish.streak')))),
      changes.length ? h('div', s('stack', { gap: '8px', marginTop: '16px', textAlign: 'left' }), h('h2', { class: 'h3' }, t('finish.changed')),
        h('div', { class: 'list' }, ...changes.map((c) => h('div', { class: 'item', style: { cursor: 'default' } }, h('div', { class: 'grow t' }, exName(c.ex)), h('div', { class: 'value' }, c.text))))) : null,
      rankBox,
      h('div', s('p-controls', { gridTemplateColumns: '1fr', marginTop: '16px' }),
        h('button', { class: 'btn', onClick: () => router.openTab('home') }, t('finish.done')),
        h('button', { class: 'btn ghost', onClick: () => tg.openLink('https://t.me/share/url?url=' + encodeURIComponent(CONFIG.siteUrl) + '&text=' + encodeURIComponent(shareText)) }, t('finish.share')))));
    countUp(nums.mins, mins, 700, 450); countUp(nums.sets, r.setsDone, 700, 550); countUp(nums.days, days, 700, 650);
    loadRank(rankBox, savedOk);
  }

  // Место в общем рейтинге недели: только если вы вошли и участвуете; иначе блока нет.
  async function loadRank(box, saved) {
    try {
      if (!apiEnabled() || !auth.signedIn || !saved) return;
      await Promise.race([syncNow(), new Promise((res) => setTimeout(res, 3000))]);
      const b = await api('/comp/board?scope=global&period=week', { token: auth.token });
      if (!b?.me || !b.rows?.length) return;
      const lead = b.rows[0].minutes, mine = b.me.minutes;
      box.replaceChildren(icon('trophy', 26), h('div', { class: 'grow', style: { textAlign: 'left' } },
        h('div', { class: 'h3' }, b.me.rank === 1 ? t('finish.rankFirst') : t('finish.rank', { n: b.me.rank })),
        b.me.rank === 1 ? null : h('div', { class: 'muted small' }, t('finish.toFirst', { n: Math.max(1, lead - mine) }))));
      box.hidden = false;
    } catch { /* без сети или без участия — блока нет */ }
  }

  function cleanup(keepGuard) {
    stopMusic();
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
      if (!params.resume && session.step?.type === 'prep') beep('prep');
      if (!session.paused) startMusic();
      timerId = setInterval(loop, 200);
    },
    destroy() { if (!over && !exiting) { persist(); } cleanup(); },
  };
}
