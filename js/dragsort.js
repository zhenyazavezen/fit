// Перетаскивание элементов: зажмите элемент пальцем и двигайте — порядок меняется на лету (как «Актуальное» в TikTok).
import { haptic } from './feedback.js';

export function dragSort(container, { itemSel, axis = 'x', delay = 380, scale = 1.12, ignore = 'input, textarea', onDrop }) {
  const X = axis === 'x';
  const pos = (r) => (X ? r.left : r.top), size = (r) => (X ? r.width : r.height), mid = (r) => pos(r) + size(r) / 2;
  let timer = 0, target = null, sx = 0, sy = 0, drag = null;
  const items = () => [...container.querySelectorAll(itemSel)];
  const stopTouch = (e) => { if (e.cancelable) e.preventDefault(); };       // пока тянем — страница не прокручивается
  const cancel = () => { clearTimeout(timer); timer = 0; target = null; };

  const place = () => {
    const { el } = drag;
    el.style.transform = 'none';
    drag.ty = drag.desired - pos(el.getBoundingClientRect());
    el.style.transform = `translate${X ? 'X' : 'Y'}(${drag.ty}px) scale(${scale})`;
  };
  const onMove = (e) => {
    if (!drag) return;
    drag.desired = drag.start + (X ? e.clientX : e.clientY) - drag.from;
    const { el } = drag, center = drag.desired + drag.size / 2, list = items(), i = list.indexOf(el);
    const prev = list[i - 1], next = list[i + 1];
    if (prev && center < mid(prev.getBoundingClientRect())) container.insertBefore(el, prev);
    else if (next && center > mid(next.getBoundingClientRect())) container.insertBefore(next, el);
    place();
  };
  const onUp = () => {
    window.removeEventListener('touchmove', stopTouch);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
    const { el } = drag; drag = null;
    el.style.transition = 'transform .16s ease'; el.style.transform = 'none';
    setTimeout(() => { el.style.transition = ''; el.classList.remove('dragging'); }, 180);
    container.classList.remove('sorting');
    setTimeout(() => { delete container.dataset.hold; }, 450);   // чтобы отпускание не засчиталось нажатием
    onDrop?.(items().map((n) => n.dataset.tab ?? n.dataset.key));
  };
  const begin = () => {
    timer = 0;
    const el = target; if (!el) return;
    const r = el.getBoundingClientRect();
    drag = { el, start: pos(r), from: X ? sx : sy, size: size(r), desired: pos(r), ty: 0 };
    container.dataset.hold = '1'; container.classList.add('sorting'); el.classList.add('dragging');
    haptic('light');
    place();
    window.addEventListener('touchmove', stopTouch, { passive: false });
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  };

  container.addEventListener('pointerdown', (e) => {
    const it = e.target.closest(itemSel);
    if (!it || !container.contains(it) || (ignore && e.target.closest(ignore)) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancel(); target = it; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(begin, delay);
  });
  container.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  for (const ev of ['pointerup', 'pointercancel']) container.addEventListener(ev, () => { if (timer) cancel(); });
  container.addEventListener('contextmenu', (e) => e.preventDefault());
  container.addEventListener('click', (e) => { if (container.dataset.hold) { e.stopPropagation(); e.preventDefault(); } }, true);   // отпускание после перетаскивания — не нажатие
}
