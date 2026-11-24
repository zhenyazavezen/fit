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
    levelBox.replaceChildren(...LEVELS.map((lv) => h('button', { class: 'card level-plate' + (p.level === lv ? ' yours' : ''), type: 'button', 'aria-pressed': String(p.level === lv), onClick: () => { save({ level: lv }); drawLevels(); } },
      h('div', { class: 'grow stack', style: { gap: '4px', textAlign: 'left' } },
        h('div', { class: 'row-flex', style: { gap: '8px' } }, h('span', { class: 'h3' }, t('level.' + lv)), p.level === lv ? h('span', { class: 'badge' }, t('workouts.yourLevel')) : null),
        h('div', { class: 'small muted' }, t('level.desc.' + lv)), h('div', { class: 'small muted' }, t('workouts.progs', { n: ready().filter((x) => x.level === lv).length }))))),
      h('button', { class: 'link-btn row-flex', style: { gap: '4px', alignSelf: 'flex-start' }, type: 'button', onClick: () => router.go('level', { level: p.level }) }, t('plan.levelPrograms', { level: t('level.' + p.level).toLowerCase() }), icon('chev-r', 16)));
  }
  const single = (label, all, key, tkey) => h('div', null, h('h2', { class: 'h3 group-title' }, label),
    segmented(all.map((v) => ({ value: v, label: t(tkey + v) })), p[key], (v) => save({ [key]: v })));
  const field = (label, key, min, max) => h('label', { class: 'stack', style: { gap: '6px', flex: 1 } }, h('span', { class: 'small muted' }, label),
    h('input', { class: 'input', type: 'number', inputmode: 'decimal', min, max, value: p[key] ?? '', 'aria-label': label,
      onChange: (e) => save({ [key]: e.target.value === '' ? null : e.target.value }) }));

  function renderRecs() {
    const ctx = { exById: D.exById, history: history.all(), programs: allPrograms(), now: Date.now() };
    const recs = recommendPrograms(p, ctx, { limit: 4 });
    recBox.replaceChildren(h('h2', { class: 'h3 group-title' }, t('plan.recs')),
      ...(recs.length ? recs.map((r) => h('button', { class: 'card stack', style: { gap: '6px', textAlign: 'left', marginBottom: '12px', width: '100%' }, onClick: () => router.go('program', { id: r.program.id }) },
        h('div', { class: 'h3' }, progText(r.program).name),
        h('div', { class: 'small muted' }, `${durationLabel(programEstimate(r.program))} · ${t('level.' + r.program.level)}`),
        ...r.reasons.map((x) => h('div', { class: 'small' }, '＋ ' + reasonText(x))),
        ...r.warnings.map((x) => h('div', { class: 'small muted' }, '! ' + reasonText(x))))) : [noteBox(t('plan.noRecs'))]));
  }

  const b = bmi(p);
  el.append(topbar({ title: t('plan.title') }),
    h('div', null, h('h2', { class: 'h3 group-title' }, t('plan.level')), levelBox),
    h('button', { class: 'card level-plate plan-plate', type: 'button', style: { marginTop: '16px' }, onClick: () => router.go('bodymap') }, icon('target'),
      h('div', { class: 'grow stack', style: { gap: '2px', textAlign: 'left' } }, h('div', { class: 'h3' }, t('map.title')), h('div', { class: 'small muted' }, t('map.hint'))), icon('chev-r', 18)),
    single(t('plan.goal'), PROFILE_GOALS, 'goal', 'pgoal.'),
    single(t('plan.minutes'), [10, 15, 20, 30, 45, 60].map(String), 'minutes', 'min.'),
    multi(t('plan.limits'), PROFILE_LIMITS, 'limits', 'limit.'),
    h('p', { class: 'small muted' }, t('plan.limitsNote')),
    h('h2', { class: 'h3 group-title' }, t('plan.params')),
    h('div', { class: 'row-flex', style: { gap: '12px' } }, field(t('plan.age'), 'age', 14, 99), field(t('plan.height'), 'heightCm', 100, 230), field(t('plan.weight'), 'weightKg', 30, 300)),
    b ? h('p', { class: 'small muted' }, t('plan.bmiNote')) : null,
    recBox);
  drawLevels(); renderRecs();
  return { el };
}
