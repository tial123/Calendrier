import { addDays, diffDays, parseKey, toMinutes, weekday } from './dates.js';

export const REPEATS = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
];

export function occursOn(event, key) {
  if (key < event.date) return false;
  if (event.until && key > event.until) return false;
  if (event.exceptions?.includes(key)) return false;
  switch (event.repeat) {
    case 'daily':
      return true;
    case 'weekdays': {
      const day = weekday(key);
      return day >= 1 && day <= 5;
    }
    case 'weekly':
      return diffDays(event.date, key) % 7 === 0;
    case 'biweekly':
      return diffDays(event.date, key) % 14 === 0;
    case 'monthly':
      // Like most calendars, a monthly event on the 31st skips shorter months.
      return parseKey(key).d === parseKey(event.date).d;
    default:
      return key === event.date;
  }
}

export function compareEvents(a, b) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (!a.allDay && a.start !== b.start) return a.start < b.start ? -1 : 1;
  return (a.title || '').localeCompare(b.title || '');
}

/** The events happening on `key`, sorted, each tagged with `on` (the occurrence date). */
export function occurrencesOn(events, key) {
  return events
    .filter((event) => occursOn(event, key))
    .map((event) => ({ ...event, on: key }))
    .sort(compareEvents);
}

/** A timed event whose end is not after its start runs past midnight (e.g. a night shift). */
export const isOvernight = (event) => !event.allDay && toMinutes(event.end) <= toMinutes(event.start);

export function durationMinutes(event) {
  if (event.allDay) return 0;
  const minutes = toMinutes(event.end) - toMinutes(event.start);
  return minutes > 0 ? minutes : minutes + 1440;
}

/** Per-category totals over `days` days from `startKey`: Map(categoryId → { count, minutes }). */
export function summarizeRange(events, startKey, days) {
  const totals = new Map();
  for (let i = 0; i < days; i++) {
    const key = addDays(startKey, i);
    for (const event of events) {
      if (!occursOn(event, key)) continue;
      const total = totals.get(event.categoryId) ?? { count: 0, minutes: 0 };
      total.count += 1;
      total.minutes += durationMinutes(event);
      totals.set(event.categoryId, total);
    }
  }
  return totals;
}
