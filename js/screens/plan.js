import { h, icon } from '../util.js';
import { t } from '../i18n.js';
import * as router from '../router.js';
import { D, allPrograms, progText, programEstimate } from '../data.js';
import { history } from '../store.js';
import { userProfile, LEVELS, PROFILE_GOALS, PROFILE_EQUIP, PROFILE_LIMITS, bmi } from '../profile-data.js';
import { recommendPrograms } from '../planner.js';
import { topbar, chip, segmented, noteBox } from '../ui.js';
import { durationLabel } from '../format.js';

const reasonText = (r) => t('rec.' + r.key, { ...r, min: r.min, list: (r.list || []).map((e) => t('equip.' + e)).join(', ') , n: r.n });

export default function plan() {
  let p = userProfile.get();
  const el = h('div', { class: 'pad' }), recBox = h('div');
  const save = (patch) => { userProfile.set(patch); p = userProfile.get(); renderRecs(); };

  const multi = (label, all, key, tkey) => {
    const box = h('div', { class: 'chipset' });
    for (const v of all) box.append(chip({ label: t(tkey + v), pressed: p[key].includes(v), onClick: (b) => {
      const cur = new Set(p[key]); cur.has(v) ? cur.delete(v) : cur.add(v);
      b.setAttribute('aria-pressed', String(cur.has(v))); save({ [key]: [...cur] });
    } }));
    return h('div', null, h('h2', { class: 'h3 group-title' }, label), box);
  };
  // Уровень: три плашки; нажатие выбирает уровень, ссылка ниже открывает программы выбранного уровня.
  const levelBox = h('div', { class: 'stack', style: { gap: '10px' } });
  const ready = () => allPrograms().filter((x) => !x.custom && !x.id.startsWith('r'));
  function drawLevels() {
    levelBox.replaceChildren(...LEVELS.map((lv) => h('button', { class: 'card level-plate' + (p.level === lv ? ' yours' : ''), type: 'button', onClick: () => router.go('level', { level: lv }) },
      h('div', { class: 'grow stack', style: { gap: '4px', textAlign: 'left' } },
        h('div', { class: 'row-flex', style: { gap: '8px' } }, h('span', { class: 'h3' }, t('level.' + lv)), p.level === lv ? h('span', { class: 'badge' }, t('workouts.yourLevel')) : null),
        h('div', { class: 'small muted' }, t('level.desc.' + lv)), h('div', { class: 'small muted' }, t('workouts.progs', { n: ready().filter((x) => x.level === lv).length }))), icon('chev-r', 18))));
  }
  // Один выбор: переносимые «таблетки» (длинные подписи не обрезаются).
  const single = (label, all, key, tkey) => {
    const box = h('div', { class: 'chipset' });
    const draw = () => box.replaceChildren(...all.map((v) => chip({ label: t(tkey + v), pressed: p[key] === v, onClick: () => { save({ [key]: v }); draw(); } })));
    draw();
    return h('div', null, h('h2', { class: 'h3 group-title' }, label), box);
  };
  // Дни недели (Пн = 0) и удобное время: подсказывают, когда тренироваться; видны на главной в карточке «Сегодня».
  const daysPick = () => {
    const box = h('div', { class: 'chipset' });
    const draw = () => box.replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((i) => chip({ label: t('day.' + i), pressed: p.days.includes(i), onClick: () => {
      const cur = new Set(p.days); cur.has(i) ? cur.delete(i) : cur.add(i); save({ days: [...cur].sort() }); draw(); } })));
    draw();
    return h('div', null, h('h2', { class: 'h3 group-title' }, t('plan.days')), box, h('p', { class: 'small muted', style: { marginTop: '8px' } }, t('plan.daysHint')));
  };
  const timePick = () => {
    const inp = h('input', { type: 'time', value: p.time, 'aria-label': t('plan.time'), class: 'time-native', onChange: (e) => { save({ time: e.target.value }); draw(); } });
    const btn = h('button', { class: 'chip time-btn', type: 'button', onClick: () => { try { inp.showPicker(); } catch { inp.focus(); inp.click(); } } });
    const clear = h('button', { class: 'link-btn', type: 'button', onClick: () => { inp.value = ''; save({ time: '' }); draw(); } }, t('plan.timeClear'));
    const row = h('div', { class: 'row-flex', style: { gap: '12px', position: 'relative' } });
    const draw = () => { btn.replaceChildren(icon('clock', 18), p.time || t('plan.timePick')); btn.setAttribute('aria-pressed', String(!!p.time)); row.replaceChildren(btn, inp, ...(p.time ? [clear] : [])); };
    draw();
    return h('div', null, h('h2', { class: 'h3 group-title' }, t('plan.time')), row);
  };
  const field = (label, key, min, max) => h('label', { class: 'stack', style: { gap: '6px', flex: 1 } }, h('span', { class: 'small muted' }, label),
    h('input', { class: 'input', type: 'number', inputmode: 'decimal', min, max, value: p[key] ?? '', 'aria-label': label,
      onChange: (e) => save({ [key]: e.target.value === '' ? null : e.target.value }) }));

  function renderRecs() {
    const ctx = { exById: D.exById, history: history.all(), programs: allPrograms(), now: Date.now() };
    const recs = recommendPrograms(p, ctx, { limit: 3 });
    recBox.replaceChildren(h('h2', { class: 'h3 group-title' }, t('plan.recs')),
      ...(recs.length ? recs.map((r) => h('button', { class: 'card stack', style: { gap: '6px', textAlign: 'left', marginBottom: '12px', width: '100%' }, onClick: () => router.go('program', { id: r.program.id }) },
        h('div', { class: 'h3' }, progText(r.program).name),
        h('div', { class: 'small muted' }, `${durationLabel(programEstimate(r.program))} · ${t('level.' + r.program.level)}`),
        h('div', { class: 'small' }, r.reasons.filter((x) => x.key !== 'noConflicts').map(reasonText).join(' · ')),
        ...r.warnings.map((x) => h('div', { class: 'small muted' }, '! ' + reasonText(x))))) : [noteBox(t('plan.noRecs'))]));
  }

  const b = bmi(p);
  el.append(topbar({ title: t('plan.title') }),
    h('div', null, h('h2', { class: 'h3 group-title' }, t('plan.level')), levelBox),
    h('button', { class: 'card level-plate plan-plate', type: 'button', style: { marginTop: '16px' }, onClick: () => router.go('bodymap') }, icon('target'),
      h('div', { class: 'grow stack', style: { gap: '2px', textAlign: 'left' } }, h('div', { class: 'h3' }, t('map.title')), h('div', { class: 'small muted' }, t('map.hint'))), icon('chev-r', 18)),
    single(t('plan.goal'), PROFILE_GOALS, 'goal', 'pgoal.'),
    daysPick(), timePick(),
    single(t('plan.minutes'), [10, 15, 20, 30, 45, 60].map(String), 'minutes', 'min.'),
    h('details', { class: 'more' }, h('summary', null, t('plan.more')),
      multi(t('plan.limits'), PROFILE_LIMITS, 'limits', 'limit.'),
      h('p', { class: 'small muted' }, t('plan.limitsNote')),
      h('h2', { class: 'h3 group-title' }, t('plan.params')),
      h('div', { class: 'row-flex', style: { gap: '12px' } }, field(t('plan.age'), 'age', 14, 99), field(t('plan.height'), 'heightCm', 100, 230), field(t('plan.weight'), 'weightKg', 30, 300)),
      b ? h('p', { class: 'small muted' }, t('plan.bmiNote')) : null),
    recBox);
  drawLevels(); renderRecs();
  return { el };
}
