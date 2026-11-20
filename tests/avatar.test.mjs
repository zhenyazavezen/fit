import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW, baseScale, clampOffset, sourceRect, isAvatarImg } from '../js/avatar-math.js';

test('Масштаб: короткая сторона фото закрывает кадр', () => {
  assert.equal(baseScale(4000, 2000), VIEW / 2000);
  assert.equal(baseScale(1000, 3000), VIEW / 1000);
});
test('Сдвиг ограничен так, чтобы кадр всегда был закрыт фото', () => {
  const w = 4000, h = 2000, sc = baseScale(w, h);                 // высота = кадр, ширина шире
  assert.deepEqual(clampOffset({ x: 9999, y: 9999 }, w, h, sc), { x: (w * sc - VIEW) / 2, y: 0 });
  assert.deepEqual(clampOffset({ x: -9999, y: 5 }, w, h, sc), { x: -(w * sc - VIEW) / 2, y: 0 });
  assert.deepEqual(clampOffset({ x: 50, y: 50 }, 2000, 2000, baseScale(2000, 2000)), { x: 0, y: 0 });
});
test('Исходный прямоугольник: по центру — центр фото, квадрат, внутри границ', () => {
  const w = 4000, h = 3000, sc = baseScale(w, h);
  const c = sourceRect(w, h, sc, { x: 0, y: 0 });
  assert.equal(c.sw, c.sh); assert.equal(c.sy, 0); assert.equal(c.sh, h); assert.equal(c.sx + c.sw / 2, w / 2);
  const off = clampOffset({ x: 9999, y: 0 }, w, h, sc), r = sourceRect(w, h, sc, off);
  assert.ok(Math.abs(r.sx) < 1e-6 && r.sx + r.sw <= w + 1e-6);   // упёрлись в левый край
  const z = sourceRect(w, h, sc * 2, { x: 0, y: 0 });
  assert.ok(Math.abs(z.sw - h / 2) < 1e-6);                        // при увеличении ×2 кадр вдвое меньше
});
test('Проверка data-URL фото', () => {
  assert.ok(isAvatarImg('')); assert.ok(isAvatarImg('data:image/jpeg;base64,/9j/4AAQ=='));
  for (const bad of ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,', 'http://x/y.jpg', 'data:image/jpeg;base64,AA"onerror="x', null, 5]) assert.ok(!isAvatarImg(bad), String(bad));
});
