import { h, icon } from '../util.js';
import { t, getLang } from '../i18n.js';
import * as router from '../router.js';
import { history } from '../store.js';
import { period, byDay, groupByDay, streak, bestStreak, bestWeekSec, monthActive } from '../stats.js';
import { dayKey, startOfDay, addDays } from '../dates.js';
import { spentLabel, doseLabel } from '../format.js';
import { exName } from '../data.js';
import { segmented, empty, sheet, confirmDialog, toast } from '../ui.js';

const state = { mode: 'week', offset: 0, day: null };
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
    svg.append(sv('rect', { class: 'cbar' + (b.sec ? '' : ' zero') + (b.sec && b.sec === peak ? ' peak' : ''), x, y: base - hgt, width: bw, height: hgt, rx: Math.min(3, bw / 2), style: `animation-delay:${Math.min(i, 30) * 14}ms` }));
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

// Единый календарь: неделя — одна строка, месяц — сетка. Дни с тренировками отмечены; нажатие на день показывает его тренировки ниже.
function calendarCard(p, onPick) {
  const days = byDay(history.all()), today = dayKey(Date.now()), first = new Date(p.start);
  const pad = p.mode === 'month' ? (first.getDay() + 6) % 7 : 0;
  const cells = [...Array.from({ length: pad }, () => h('div', { class: 'cal-cell empty' })), ...p.bars.map((b) => {
    const num = p.mode === 'month' ? b.i + 1 : new Date(addDays(startOfDay(p.start), b.i)).getDate();
    return h('button', { class: 'cal-cell' + (days.get(b.key) ? ' done' : '') + (b.key === today ? ' today' : '') + (state.day === b.key ? ' sel' : ''), type: 'button',
      'aria-label': `${num}${days.get(b.key) ? ', ' + t('cal.has') : ''}`, 'aria-pressed': String(state.day === b.key), onClick: () => onPick(b.key) }, String(num));
  })];
  return h('div', { class: 'card cal-card', style: { marginTop: '12px' } },
    h('div', { class: 'cal-head' }, ...[0, 1, 2, 3, 4, 5, 6].map((i) => h('span', null, t('day.' + i)))), h('div', { class: 'cal-grid' }, ...cells));
}

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
      segmented([{ value: 'week', label: t('progress.week') }, { value: 'month', label: t('progress.month') }], state.mode, (v) => { state.mode = v; state.offset = 0; state.day = null; draw(); }),
      h('div', { class: 'period-nav' },
        h('button', { class: 'icon-btn', 'aria-label': t('progress.prev'), onClick: () => { state.offset -= 1; state.day = null; draw(); } }, icon('chev-l')),
        h('div', { class: 'lbl' }, label),
        h('button', { class: 'icon-btn', 'aria-label': t('progress.next'), disabled: state.offset >= 0, onClick: () => { state.offset += 1; state.day = null; draw(); } }, icon('chev-r'))),
      calendarCard(p, (k) => { state.day = state.day === k ? null : k; draw(); }),
      h('div', { class: 'tiles', style: { marginTop: '12px' } },
        tile(String(p.total.workouts), t('progress.workouts')), tile(p.total.sec ? spentLabel(p.total.sec) : '0', t('progress.time')), tile(String(p.total.sets), t('progress.sets'))),
      h('div', { class: 'card', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('progress.chartTitle')), p.bars.some((b) => b.sec) ? chart(p) : h('p', { class: 'muted small', style: { padding: '12px 0' } }, t('progress.noData')), vs ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, vs) : null),
      ...stats(now),
      h('h2', { class: 'h3', style: { margin: '28px 0 0' } }, state.day ? t('cal.dayList') : t('progress.history')),
      ...(state.day && !groupByDay(hist).some((g) => g.key === state.day) ? [h('p', { class: 'muted small' }, t('cal.noDay'))] : []),
      ...groupByDay(hist).filter((g) => !state.day || g.key === state.day).flatMap((g) => [h('div', { class: 'day-title' }, dayTitle(g.ts, now)),
        h('div', { class: 'list' }, ...g.items.map((s) => h('div', { class: 'item' },
          h('button', { class: 'row-flex grow', type: 'button', style: { textAlign: 'left', gap: '12px' }, onClick: () => openRecord(s) },
            h('div', { class: 'grow' }, h('div', { class: 't' }, s.title || t('progress.customWorkout')), h('div', { class: 's' }, `${timeOf(s.at)} · ${t('n.sets', { n: s.setsDone })}`)),
            h('div', { class: 'end' }, spentLabel(s.durationSec))),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.delete'), onClick: () => askDelete(s) }, icon('trash', 18)))))]));
  };
  const row = (label, value) => h('div', { class: 'item', style: { cursor: 'default' } }, h('div', { class: 'grow t' }, label), h('div', { class: 'value' }, value));
  const mins = (sec) => (sec >= 60 ? spentLabel(sec) : t('dur.s', { s: Math.round(sec) }));
  const stats = (now) => {
    const ma = monthActive(hist, now), cur = streak(hist, now), best = Math.max(bestStreak(hist), cur);
    const group = (title, ...rows) => [h('h2', { class: 'h3 group-title' }, title), h('div', { class: 'list' }, ...rows)];
    return [...group(t('progress.records'), row(t('progress.bestWeek'), mins(bestWeekSec(hist))), row(t('progress.totalWorkouts'), String(hist.length))),
      ...group(t('progress.activeTime'), row(t('progress.monthActive'), mins(ma.sec)), row(t('progress.avgDay'), t('progress.avgDayValue', { n: mins(ma.avgSec) }))),
      ...group(t('progress.streakTitle'), row(t('progress.streakNow'), t('progress.days', { n: cur })), row(t('progress.streakBest'), t('progress.days', { n: best })))];
  };
  const tile = (v, l) => h('div', { class: 'fact' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));

  const logOf = (s, id, i) => { const l = (s.log || [])[i]?.ex === id ? s.log[i] : (s.log || []).find((x) => x.ex === id); return l ? doseLabel({ kind: l.seconds != null ? 'timed' : 'reps', ...l }) : ''; };
  async function askDelete(s) {
    if (!(await confirmDialog({ title: t('progress.deleteTitle'), text: t('progress.deleteText'), confirm: t('common.delete'), danger: true }))) return false;
    history.remove(s.id); toast(t('progress.deleted')); router.refresh(); return true;
  }
  function openRecord(s) {
    const ids = s.exerciseIds || [];
    const sh = sheet({
      title: s.title || t('progress.customWorkout'),
      body: [h('div', { class: 'small muted' }, `${fmtDate(s.at, { weekday: 'long', day: 'numeric', month: 'long' })}, ${timeOf(s.at)} · ${s.completed ? t('progress.completed') : t('progress.partial')}`),
        h('div', { class: 'facts' }, tile(spentLabel(s.durationSec), t('progress.time')), tile(String(s.setsDone), t('progress.sets')), tile(String(s.exercisesDone), t('player.finishExercises'))),
        ids.length ? h('div', { class: 'list' }, ...ids.map((id, i) => h('div', { class: 'item', style: { minHeight: '52px' } }, h('div', { class: 'lead' }, String(i + 1)), h('div', { class: 'grow' }, h('div', { class: 't' }, exName(id)), logOf(s, id, i) ? h('div', { class: 's' }, logOf(s, id, i)) : null))))
          : h('p', { class: 'small muted' }, t('progress.noExercises'))],
      foot: [h('button', { class: 'btn danger', onClick: async () => { if (await askDelete(s)) sh.close(); } }, icon('trash', 18), t('common.delete'))],
    });
  }
  draw();
  return { el };
}
