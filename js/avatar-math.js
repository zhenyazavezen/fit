// Математика обрезки фото профиля (без DOM — проверяется модульными тестами).
// Кадр — квадрат VIEW×VIEW на экране; итог — квадрат OUT×OUT пикселей (на экране показывается кругом).
export const VIEW = 280;
export const OUT = 256;
export const MAX_ZOOM = 4;
export const MAX_DATA_URL = 60000;          // предел для сервера (документ ≤ 64 КБ)
export const TARGET_DATA_URL = 45000;       // к этому размеру сжимаем JPEG на устройстве

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Масштаб, при котором короткая сторона фото ровно закрывает кадр. */
export const baseScale = (w, h, view = VIEW) => view / Math.min(w, h);

/** Сдвиг центра фото относительно центра кадра, не позволяющий показать пустой край. */
export function clampOffset(off, w, h, scale, view = VIEW) {
  const mx = Math.max(0, (w * scale - view) / 2), my = Math.max(0, (h * scale - view) / 2);
  return { x: clamp(off.x, -mx, mx), y: clamp(off.y, -my, my) };
}

/** Прямоугольник исходного фото, который виден в кадре. */
export function sourceRect(w, h, scale, off, view = VIEW) {
  const sw = view / scale, sh = view / scale;
  return { sx: w / 2 - sw / 2 - off.x / scale, sy: h / 2 - sh / 2 - off.y / scale, sw, sh };
}

/** Допустимое значение документа «avatar»: пустая строка (фото убрано) или JPEG в виде data-URL. */
export const isAvatarImg = (s) => s === '' || (typeof s === 'string' && s.length <= MAX_DATA_URL && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(s));
