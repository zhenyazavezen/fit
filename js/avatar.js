// Фото профиля: выбор из галереи, обрезка, сохранение. Хранится как документ «avatar» ({ img }) —
// обычная синхронизация переносит его на другие устройства. Приоритет показа: своё фото → фото Telegram → буква.
import { h } from './util.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { auth } from './auth.js';
import { tg } from './tg.js';
import { sheet, toast } from './ui.js';
import { VIEW, OUT, MAX_ZOOM, TARGET_DATA_URL, baseScale, clampOffset, sourceRect, isAvatarImg } from './avatar-math.js';

const TG_PHOTO = /^https:\/\/(t\.me|telegram\.org)\//;
/** Фото, которое видит человек сейчас: своё → фото Telegram → '' (тогда показывается буква). */
export function photoOf(u) { const mine = getAvatar(); if (mine) return mine; const url = u && typeof u.photo_url === 'string' ? u.photo_url : ''; return TG_PHOTO.test(url) ? url : ''; }
/** Элемент-кружок с фото или буквой. */
export function avatarNode(src, name, cls = '') {
  const box = h('div', { class: 'avatar ' + cls }, (name || '?').trim().charAt(0).toUpperCase());
  if (src) {
    const img = h('img', { src, alt: '', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => { box.textContent = ''; box.append(img); });
  }
  return box;
}
/** Маленькое фото (для рейтинга): своё уменьшается до ~56 px, фото Telegram передаётся ссылкой. */
export async function thumbOf(u) {
  const mine = getAvatar();
  if (!mine) { const url = photoOf(u); return url; }
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = mine; });
    const c = document.createElement('canvas'); c.width = c.height = 56; c.getContext('2d').drawImage(img, 0, 0, 56, 56);
    for (let q = 0.7; q > 0.2; q -= 0.1) { const url = c.toDataURL('image/jpeg', q); if (url.length <= 3800) return url; }
  } catch { /* без фото */ }
  return '';
}
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
    const cur = getAvatar(), shown = photoOf(tg.user);
    const nm = tg.user ? [tg.user.first_name, tg.user.last_name].filter(Boolean).join(' ') : '';
    body.replaceChildren(
      avatarNode(shown, nm, 'avatar-big'),
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
    const slider = h('input', { type: 'range', min: '1', max: String(MAX_ZOOM), step: '0.01', value: '1', class: 'crop-zoom', 'aria-label': t('avatar.zoom') });
    // Масштаб вокруг точки (px,py) в координатах кадра: точка под пальцами остаётся на месте.
    const zoomAt = (nz, px, py) => {
      nz = Math.min(MAX_ZOOM, Math.max(1, nz));
      const k = nz / zoom, cx = px - VIEW / 2, cy = py - VIEW / 2;
      zoom = nz; off = clampOffset({ x: cx - (cx - off.x) * k, y: cy - (cy - off.y) * k }, w, ih, base * zoom);
      slider.value = String(zoom); draw();
    };
    const pts = new Map(); let pinch = 0;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * VIEW / r.width, y: (e.clientY - r.top) * VIEW / r.height }; };
    const span = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, local(e)); try { canvas.setPointerCapture(e.pointerId); } catch { /* необязательно */ }
      if (pts.size === 2) pinch = span().d;
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      const cur = local(e);
      if (pts.size >= 2) {
        const before = span(); pts.set(e.pointerId, cur); const after = span();
        // сдвиг центра пальцев + масштаб по изменению расстояния
        off = clampOffset({ x: off.x + after.x - before.x, y: off.y + after.y - before.y }, w, ih, base * zoom);
        zoomAt(zoom * after.d / before.d, after.x, after.y);
      } else {
        pts.set(e.pointerId, cur);
        off = clampOffset({ x: off.x + cur.x - prev.x, y: off.y + cur.y - prev.y }, w, ih, base * zoom); draw();
      }
    });
    const end = (e) => { pts.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(zoom * Math.exp(-e.deltaY * 0.002), p.x, p.y); }, { passive: false });
    slider.addEventListener('input', () => zoomAt(Number(slider.value), VIEW / 2, VIEW / 2));
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
