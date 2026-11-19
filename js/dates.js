// Чистые функции дат (без DOM) — используются и в интерфейсе, и в тестах. Неделя начинается с понедельника.
const pad2 = (n) => String(n).padStart(2, '0');

export const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
export const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
export const startOfWeek = (ts) => { const d = new Date(startOfDay(ts)); return addDays(d.getTime(), -((d.getDay() + 6) % 7)); };
export const startOfMonth = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
export const addMonths = (ts, n) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
export const daysInMonth = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
