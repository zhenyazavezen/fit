// Данные карты тела: области → мышцы каталога. Чистый модуль без DOM (проверяется тестами).
export const REGIONS = {
  chest: ['chest'], shoulders: ['shoulders'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'],
  abs: ['abs', 'obliques'], back: ['upperback', 'lats', 'traps', 'lowerback'],
  glutes: ['glutes'], quads: ['quads', 'hipflexors'], hamstrings: ['hamstrings'], calves: ['calves'],
};
export const REGION_IDS = Object.keys(REGIONS);
export const FULL_BODY = 'fullbody';

/** Выбранные области (набор id) → список мышц каталога. Весь корпус = все области. */
export function musclesOf(regions) {
  const set = new Set();
  for (const r of regions) for (const m of REGIONS[r] || []) set.add(m);
  return [...set];
}

/** Области, которые видны спереди и сзади (одна область может быть на обоих видах). */
export const VIEWS = {
  front: ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'quads', 'calves'],
  back: ['back', 'shoulders', 'triceps', 'forearms', 'glutes', 'hamstrings', 'calves'],
};
