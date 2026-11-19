import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, exName, allPrograms, progText } from '../data.js';
import { history } from '../store.js';
import { userProfile } from '../profile-data.js';
import { exercisesForMuscles, programsForMuscles, loadAdvice, MAX_GROUPS } from '../planner.js';
import { REGIONS, REGION_IDS, VIEWS, musclesOf } from '../bodymap.js';
import { topbar, segmented, noteBox } from '../ui.js';
import { haptic } from '../feedback.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k);
  return el;
};

// Контуры областей в системе координат 200×440; центр тела x = 100. Фигура — стилизованный силуэт робота-манекена.
const shape = {
  shoulders: [['ellipse', { cx: 56, cy: 92, rx: 17, ry: 14 }], ['ellipse', { cx: 144, cy: 92, rx: 17, ry: 14 }]],
  chest: [['path', { d: 'M71 82 Q100 74 129 82 L127 118 Q100 126 73 118 Z' }]],
  abs: [['rect', { x: 77, y: 124, width: 46, height: 66, rx: 14 }]],
  biceps: [['rect', { x: 36, y: 108, width: 18, height: 46, rx: 9 }], ['rect', { x: 146, y: 108, width: 18, height: 46, rx: 9 }]],
  triceps: [['rect', { x: 36, y: 108, width: 18, height: 46, rx: 9 }], ['rect', { x: 146, y: 108, width: 18, height: 46, rx: 9 }]],
  forearms: [['rect', { x: 29, y: 160, width: 17, height: 58, rx: 8 }], ['rect', { x: 154, y: 160, width: 17, height: 58, rx: 8 }]],
  back: [['path', { d: 'M73 80 Q100 72 127 80 L125 116 Q100 122 75 116 Z' }], ['rect', { x: 77, y: 122, width: 46, height: 52, rx: 14 }]],
  glutes: [['ellipse', { cx: 86, cy: 198, rx: 20, ry: 20 }], ['ellipse', { cx: 114, cy: 198, rx: 20, ry: 20 }]],
  quads: [['rect', { x: 68, y: 202, width: 30, height: 96, rx: 14 }], ['rect', { x: 102, y: 202, width: 30, height: 96, rx: 14 }]],
  hamstrings: [['rect', { x: 68, y: 222, width: 30, height: 76, rx: 14 }], ['rect', { x: 102, y: 222, width: 30, height: 76, rx: 14 }]],
  calves: [['rect', { x: 72, y: 308, width: 22, height: 88, rx: 10 }], ['rect', { x: 106, y: 308, width: 22, height: 88, rx: 10 }]],
};

function figure(view, selected, onToggle) {
  const svg = s('svg', { viewBox: '0 0 200 420', class: 'bodymap', role: 'group', 'aria-label': t('map.' + view) });
  // нейтральный силуэт (не интерактивен)
  svg.append(s('g', { class: 'bm-base', 'aria-hidden': 'true' },
    s('circle', { cx: 100, cy: 36, r: 21 }), s('rect', { x: 90, y: 56, width: 20, height: 20, rx: 6 }),
    s('rect', { x: 68, y: 76, width: 64, height: 120, rx: 22 }), s('rect', { x: 64, y: 192, width: 72, height: 24, rx: 12 }),
    s('rect', { x: 66, y: 200, width: 34, height: 104, rx: 16 }), s('rect', { x: 100, y: 200, width: 34, height: 104, rx: 16 }),
    s('rect', { x: 70, y: 304, width: 26, height: 96, rx: 12 }), s('rect', { x: 104, y: 304, width: 26, height: 96, rx: 12 }),
    s('rect', { x: 34, y: 100, width: 22, height: 120, rx: 11 }), s('rect', { x: 144, y: 100, width: 22, height: 120, rx: 11 })));
  for (const id of VIEWS[view]) {
    const g = s('g', { class: 'bm-region', tabindex: '0', role: 'button', 'aria-pressed': String(selected.has(id)), 'aria-label': t('region.' + id), 'data-region': id });
    for (const [tag, attrs] of shape[id]) g.append(s(tag, attrs));
    const fire = () => { haptic('select'); onToggle(id); };
    g.addEventListener('click', fire);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    svg.append(g);
  }
  return svg;
}

export default function bodymap() {
  const profile = userProfile.get(), hist = history.all();
  const ctx = { exById: D.exById, history: hist, programs: allPrograms(), now: Date.now() };
  const state = { view: 'front', sel: new Set(), full: false };
  const el = h('div', { class: 'pad' });
  const fig = h('div', { class: 'bm-fig' }), out = h('div', { class: 'bm-out' }), chips = h('div', { class: 'chipset', style: { marginBottom: '12px' } });

  const effective = () => (state.full ? new Set(REGION_IDS) : state.sel);
  const toggle = (id) => { state.full = false; state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id); render(); };

  const fullBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onClick: () => { state.full = !state.full; state.sel.clear(); render(); } }, t('region.fullbody'));

  function render() {
    fullBtn.setAttribute('aria-pressed', String(state.full));
    fig.replaceChildren(figure(state.view, effective(), toggle));
    const sel = [...effective()];
    chips.replaceChildren(...sel.map((id) => h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', onClick: () => toggle(id) }, t('region.' + id), icon('x', 14))));
    out.replaceChildren();
    if (!sel.length) { out.append(noteBox(t('map.hint'))); return; }
    const muscles = musclesOf(sel);
    const adv = loadAdvice(state.full ? 1 : sel.length, muscles, hist, D.exById);
    if (adv.tooMany) out.append(noteBox(t('map.tooMany', { n: MAX_GROUPS }), 'info'));
    if (adv.recovering.length) out.append(noteBox(t('map.recovering', { list: adv.recovering.map((m) => t('muscle.' + m)).join(', ') }), 'clock'));

    const progs = programsForMuscles(muscles, profile, ctx);
    if (progs.length) {
      out.append(h('h2', { class: 'h3 group-title' }, t('map.programs')));
      out.append(h('div', { class: 'list' }, ...progs.map((r) => h('button', { class: 'item', onClick: () => router.go('program', { id: r.program.id }) },
        icon('workouts'), h('div', { class: 'grow' }, h('div', { class: 't' }, progText(r.program).name), h('div', { class: 's' }, t('map.coverage', { p: Math.round(r.coverage * 100) }))), icon('chev-r', 18)))));
    }
    const exs = exercisesForMuscles(muscles, profile, ctx, { limit: state.full ? 12 : 8 });
    out.append(h('h2', { class: 'h3 group-title' }, t('map.exercises')));
    if (!exs.length) out.append(noteBox(t('map.none')));
    else out.append(h('div', { class: 'list' }, ...exs.map((r) => h('button', { class: 'item', onClick: () => router.go('exercise', { id: r.id }) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, exName(r.id)), h('div', { class: 's' }, t('level.' + r.level) + (r.recovering.length ? ' · ' + t('map.restNote') : ''))), icon('chev-r', 18)))));
    out.append(h('p', { class: 'small muted', style: { marginTop: '16px' } }, t('map.disclaimer')));
  }

  el.append(topbar({ title: t('map.title') }),
    segmented([{ value: 'front', label: t('map.front') }, { value: 'back', label: t('map.back') }], state.view, (v) => { state.view = v; render(); }),
    fig,
    h('div', { class: 'row-flex', style: { justifyContent: 'center', margin: '8px 0' } }, fullBtn,
      h('button', { class: 'link-btn', onClick: () => { state.full = false; state.sel.clear(); render(); } }, t('map.clear'))),
    chips, out);
  render();
  return { el };
}
