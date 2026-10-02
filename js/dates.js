// Calendar dates are handled as "YYYY-MM-DD" strings ("keys"). They sort correctly as
// plain strings, serialize cleanly, and never carry a time zone.

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_MS = 86_400_000;

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayKey = () => toKey(new Date());

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m: m - 1, d };
}

// Day arithmetic runs in UTC so daylight-saving changes never skew the count.
export function dayIndex(key) {
  const { y, m, d } = parseKey(key);
  return Math.round(Date.UTC(y, m, d) / DAY_MS);
}

export function fromIndex(index) {
  const dt = new Date(index * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export const addDays = (key, n) => fromIndex(dayIndex(key) + n);
export const diffDays = (from, to) => dayIndex(to) - dayIndex(from);

// Day 0 (1970-01-01) was a Thursday.
export const weekday = (key) => (((dayIndex(key) + 4) % 7) + 7) % 7;

export function startOfWeek(key, weekStart = 0) {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7));
}

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Every day shown on a month page: whole weeks covering the month. */
export function monthGrid(y, m, weekStart = 0) {
  const first = `${y}-${pad(m + 1)}-01`;
  const start = startOfWeek(first, weekStart);
  const weeks = Math.ceil((diffDays(start, first) + daysInMonth(y, m)) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Adds minutes to an "HH:MM" time, wrapping around midnight. */
export function addMinutes(time, n) {
  const t = (((toMinutes(time) + n) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function formatTime(time, use24h) {
  const [h, m] = time.split(':').map(Number);
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${pad(m)} ${suffix}`;
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatLongDate(key, withYear = true) {
  const { y, m, d } = parseKey(key);
  const text = `${WEEKDAYS[weekday(key)]}, ${MONTHS[m]} ${d}`;
  return withYear ? `${text}, ${y}` : text;
}

export function formatShortDate(key) {
  const { m, d } = parseKey(key);
  return `${MONTHS[m].slice(0, 3)} ${d}`;
}

/** "Today", "Tomorrow" or "Yesterday", otherwise null. */
export function relativeDay(key, today) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return null;
}
