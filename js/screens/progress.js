import { h, icon } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as router from '../router.js';
import { history } from '../store.js';
import { period, groupByDay, streak } from '../stats.js';
import { dayKey, startOfDay, addDays } from '../dates.js';
import { spentLabel } from '../format.js';
import { exName } from '../data.js';
import { segmented, empty, sheet, confirmDialog, toast } from '../ui.js';

const state = { mode: 'week', offset: 0 };
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };

function chart(p) {
  const W = 320, H = 150, L = 8, R = 8, T = 18, B = 22, n = p.bars.length;
  const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('progress.chartTitle') });
  const maxMin = Math.max(10, ...p.bars.map((b) => b.sec / 60));
  const top = Math.ceil(maxMin / 10) * 10;
  const base = H - B, ph = base - T, slot = (W - L - R) / n, bw = Math.min(26, slot * 0.62);
  svg.append(sv('line', { class: 'grid', x1: L, x2: W - R, y1: base, y2: base }), sv('line', { class: 'grid', x1: L, x2: W - R, y1: T, y2: T }));
  svg.append(sv('text', { x: L, y: T - 5 }, `${top} ${t('common.min')}`));
  const peak = Math.max(...p.bars.map((b) => b.sec));
  p.bars.forEach((b, i) => {
    const x = L + slot * i + (slot - bw) / 2, hgt = b.sec ? Math.max(3, (b.sec / 60 / top) * ph) : 2;
    svg.append(sv('rect', { class: 'bar' + (b.sec ? '' : ' zero') + (b.sec && b.sec === peak ? ' peak' : ''), x, y: base - hgt, width: bw, height: hgt, rx: Math.min(3, bw / 2) }));
    const label = p.mode === 'week' ? t('day.' + i) : (b.i === 0 || (b.i + 1) % 7 === 1 ? String(b.i + 1) : '');
    if (label) svg.append(sv('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, label));
  });
  return svg;
}

const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString(getLang(), opts);
function dayTitle(ts, now) {
  const k = dayKey(ts);
  if (k === dayKey(now)) return t('progress.today');
  if (k === dayKey(addDays(startOfDay(now), -1))) return t('progress.yesterday');
  return fmtDate(ts, { weekday: 'long', day: 'numeric', month: 'long' });
}
const timeOf = (ts) => new Date(ts).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });

export default function progress() {
  const el = h('div', { class: 'pad' });
  const body = h('div');
  const hist = history.all();
  el.append(h('h1', { class: 'h1 page-title' }, t('progress.title')), body);

  if (!hist.length) {
    body.append(empty({ icon: 'progress', title: t('progress.emptyTitle'), text: t('progress.emptyText'),
      action: h('button', { class: 'btn small', onClick: () => router.openTab('workouts') }, t('progress.emptyCta')) }));
    return { el };
  }

  const draw = () => {
    const now = Date.now(), p = period(hist, state.mode, state.offset, now);
    const label = state.mode === 'week'
      ? `${fmtDate(p.start, { day: 'numeric', month: 'short' })} – ${fmtDate(p.end - 1, { day: 'numeric', month: 'short' })}`
      : fmtDate(p.start, { month: 'long', year: 'numeric' });
    const delta = Math.round((p.total.sec - p.prev.sec) / 60);
    const vs = p.prev.sec === 0 && p.total.sec === 0 ? null : delta === 0 ? t('progress.vsSame')
      : t(state.mode === 'week' ? 'progress.vsPrev' : 'progress.vsPrevMonth', { delta: `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${t('common.min')}` });
    body.replaceChildren(
      segmented([{ value: 'week', label: t('progress.week') }, { value: 'month', label: t('progress.month') }], state.mode, (v) => { state.mode = v; state.offset = 0; draw(); }),
      h('div', { class: 'period-nav' },
        h('button', { class: 'icon-btn', 'aria-label': t('progress.prev'), onClick: () => { state.offset -= 1; draw(); } }, icon('chev-l')),
        h('div', { class: 'lbl' }, label),
        h('button', { class: 'icon-btn', 'aria-label': t('progress.next'), disabled: state.offset >= 0, onClick: () => { state.offset += 1; draw(); } }, icon('chev-r'))),
      h('div', { class: 'tiles' },
        tile(String(p.total.workouts), t('progress.workouts')), tile(p.total.sec ? spentLabel(p.total.sec) : '0', t('progress.time')), tile(String(p.total.sets), t('progress.sets'))),
      h('div', { class: 'card', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('progress.chartTitle')), chart(p), vs ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, vs) : null),
      h('div', { class: 'card row-flex', style: { marginTop: '12px' } }, icon('bolt'), h('div', { class: 'grow' }, h('div', { class: 'h3' }, t('home.streakDays', { n: streak(hist, now) })), h('div', { class: 'small muted' }, t('progress.streak')))),
      h('h2', { class: 'h3', style: { margin: '28px 0 0' } }, t('progress.history')),
      ...groupByDay(hist).flatMap((g) => [h('div', { class: 'day-title' }, dayTitle(g.ts, now)),
        h('div', { class: 'list' }, ...g.items.map((s) => h('button', { class: 'item', onClick: () => openRecord(s) },
          h('div', { class: 'grow' }, h('div', { class: 't' }, s.title || t('progress.customWorkout')), h('div', { class: 's' }, `${timeOf(s.at)} · ${t('n.sets', { n: s.setsDone })}`)),
          h('div', { class: 'end' }, spentLabel(s.durationSec)), icon('chev-r', 18))))]));
  };
  const tile = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));

  function openRecord(s) {
    const ids = s.exerciseIds || [];
    const sh = sheet({
      title: s.title || t('progress.customWorkout'),
      body: [h('div', { class: 'small muted' }, `${fmtDate(s.at, { weekday: 'long', day: 'numeric', month: 'long' })}, ${timeOf(s.at)} · ${s.completed ? t('progress.completed') : t('progress.partial')}`),
        h('div', { class: 'facts' }, tile(spentLabel(s.durationSec), t('progress.time')), tile(String(s.setsDone), t('progress.sets')), tile(String(s.exercisesDone), t('player.finishExercises'))),
        ids.length ? h('div', { class: 'list' }, ...ids.map((id, i) => h('div', { class: 'item', style: { minHeight: '52px' } }, h('div', { class: 'lead' }, String(i + 1)), h('div', { class: 't' }, exName(id)))))
          : h('p', { class: 'small muted' }, t('progress.noExercises'))],
      foot: [h('button', { class: 'btn danger', onClick: async () => {
        if (await confirmDialog({ title: t('progress.deleteTitle'), text: t('progress.deleteText'), confirm: t('common.delete'), danger: true })) { history.remove(s.id); sh.close(); toast(t('progress.deleted')); router.refresh(); }
      } }, icon('trash', 18), t('common.delete'))],
    });
  }
  draw();
  return { el };
}
