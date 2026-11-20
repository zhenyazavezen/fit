// Фото профиля: выбор из галереи, обрезка, сохранение. Хранится как документ «avatar» ({ img }) —
// обычная синхронизация переносит его на другие устройства. Приоритет показа: своё фото → фото Telegram → буква.
import { h } from './util.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { auth } from './auth.js';
import { sheet, toast } from './ui.js';
import { VIEW, OUT, MAX_ZOOM, TARGET_DATA_URL, baseScale, clampOffset, sourceRect, isAvatarImg } from './avatar-math.js';

export function getAvatar() { const v = store.get('avatar', null); return v && typeof v.img === 'string' && v.img && isAvatarImg(v.img) ? v.img : ''; }
const put = (img) => store.set('avatar', { img });

async function decode(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* запасной путь ниже */ } }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    im.src = url;
  });
}
const dims = (img) => ({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });

/** Итоговый JPEG OUT×OUT; качество снижается, пока не уложимся в TARGET_DATA_URL. */
function render(img, w, h, scale, off) {
  const c = document.createElement('canvas'); c.width = c.height = OUT;
  const g = c.getContext('2d'), r = sourceRect(w, h, scale, off);
  g.fillStyle = '#1a1a1d'; g.fillRect(0, 0, OUT, OUT);
  g.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, OUT, OUT);
  let q = 0.88, url = '';
  do { url = c.toDataURL('image/jpeg', q); q -= 0.1; } while (url.length > TARGET_DATA_URL && q > 0.25);
  return isAvatarImg(url) && url.length <= TARGET_DATA_URL * 1.3 ? url : '';
}

export function openAvatarEditor(onChange) {
  const body = h('div', { class: 'stack avatar-ed' });
  const s = sheet({ title: t('avatar.title'), body });
  const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

  const menu = () => {
    const cur = getAvatar();
    body.replaceChildren(
      h('div', { class: 'avatar avatar-big' }, cur ? h('img', { src: cur, alt: '' }) : null),
      h('button', { class: 'btn', onClick: () => input.click() }, t('avatar.pick')),
      cur ? h('button', { class: 'btn secondary', onClick: () => { put(''); toast(t('avatar.removed')); onChange?.(); s.close(); } }, t('avatar.remove')) : null,
      h('p', { class: 'small muted' }, auth.signedIn ? t('avatar.syncNote') : t('avatar.localNote')),
      input);
  };

  const crop = (img) => {
    const { w, h: ih } = dims(img), base = baseScale(w, ih);
    let zoom = 1, off = { x: 0, y: 0 };
    const dpr = 2, canvas = h('canvas', { class: 'crop-canvas', width: VIEW * dpr, height: VIEW * dpr, style: { width: VIEW + 'px', height: VIEW + 'px' } });
    const g = canvas.getContext('2d'); g.scale(dpr, dpr);
    const draw = () => {
      const sc = base * zoom;
      g.fillStyle = '#0A0A0B'; g.fillRect(0, 0, VIEW, VIEW);
      g.drawImage(img, VIEW / 2 + off.x - (w * sc) / 2, VIEW / 2 + off.y - (ih * sc) / 2, w * sc, ih * sc);
      g.fillStyle = 'rgba(10,10,11,.62)'; g.beginPath(); g.rect(0, 0, VIEW, VIEW); g.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 2, 0, Math.PI * 2); g.fill('evenodd');
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 2, 0, Math.PI * 2); g.stroke();
    };
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      off = clampOffset({ x: off.x + e.clientX - drag.x, y: off.y + e.clientY - drag.y }, w, ih, base * zoom);
      drag = { x: e.clientX, y: e.clientY }; draw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    const slider = h('input', { type: 'range', min: '1', max: String(MAX_ZOOM), step: '0.01', value: '1', class: 'crop-zoom', 'aria-label': t('avatar.zoom') });
    slider.addEventListener('input', () => { zoom = Number(slider.value); off = clampOffset(off, w, ih, base * zoom); draw(); });
    body.replaceChildren(
      h('p', { class: 'small muted' }, t('avatar.hint')), canvas, slider,
      h('button', { class: 'btn', onClick: () => {
        const url = render(img, w, ih, base * zoom, off);
        if (!url) { toast(t('avatar.failed')); return; }
        if (!put(url)) { toast(t('avatar.failed')); return; }
        img.close?.(); toast(t('avatar.saved')); onChange?.(); s.close();
      } }, t('avatar.save')),
      h('button', { class: 'btn secondary', onClick: () => { img.close?.(); menu(); } }, t('common.cancel')));
    draw();
  };

  input.addEventListener('change', async () => {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    try { crop(await decode(f)); } catch { toast(t('avatar.failed')); }
  });
  menu();
  return s;
}
