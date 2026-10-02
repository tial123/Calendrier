import { addDays } from './dates.js';
import { REPEATS } from './events.js';

const STORAGE_KEY = 'calendrier:v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const REPEAT_VALUES = new Set(REPEATS.map((r) => r.value));

export const PALETTE = [
  { name: 'Red', hex: '#FF3B30' },
  { name: 'Orange', hex: '#FF9500' },
  { name: 'Yellow', hex: '#FFCC00' },
  { name: 'Green', hex: '#34C759' },
  { name: 'Mint', hex: '#00C7BE' },
  { name: 'Teal', hex: '#30B0C7' },
  { name: 'Blue', hex: '#007AFF' },
  { name: 'Indigo', hex: '#5856D6' },
  { name: 'Purple', hex: '#AF52DE' },
  { name: 'Pink', hex: '#FF2D55' },
  { name: 'Brown', hex: '#A2845E' },
  { name: 'Gray', hex: '#8E8E93' },
];

export const DEFAULT_CATEGORIES = [
  { id: 'plans', name: 'Plans', color: '#007AFF' },
  { id: 'work', name: 'Work', color: '#FF9500' },
  { id: 'gym', name: 'Gym', color: '#34C759' },
  { id: 'other', name: 'Other', color: '#AF52DE' },
];

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function prefers24h() {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false;
  } catch {
    return false;
  }
}

export function defaultState() {
  return {
    version: 1,
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    events: [],
    settings: { weekStart: 0, use24h: prefers24h() },
    lastTimes: {},
  };
}

function cleanCategory(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    name: String(raw.name ?? '').trim().slice(0, 40) || 'Untitled',
    color: COLOR_RE.test(raw.color) ? raw.color : '#007AFF',
  };
}

function cleanEvent(raw, categoryIds, fallbackCategory) {
  if (!raw || !DATE_RE.test(raw.date)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: String(raw.title ?? '').trim().slice(0, 200),
    categoryId: categoryIds.has(raw.categoryId) ? raw.categoryId : fallbackCategory,
    date: raw.date,
    allDay: Boolean(raw.allDay),
    start: TIME_RE.test(raw.start) ? raw.start : '09:00',
    end: TIME_RE.test(raw.end) ? raw.end : '10:00',
    repeat: REPEAT_VALUES.has(raw.repeat) ? raw.repeat : 'none',
    until: DATE_RE.test(raw.until) ? raw.until : null,
    exceptions: Array.isArray(raw.exceptions) ? raw.exceptions.filter((k) => DATE_RE.test(k)) : [],
    notes: String(raw.notes ?? '').trim().slice(0, 5000),
  };
}

/** Validates saved or imported data and fills in anything missing. Throws if it isn't calendar data. */
export function hydrate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) {
    throw new Error('Not a Calendrier backup');
  }
  const base = defaultState();
  const byId = new Map();
  for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
    const clean = cleanCategory(c);
    if (clean && !byId.has(clean.id)) byId.set(clean.id, clean);
  }
  const categories = byId.size ? [...byId.values()] : base.categories;
  const ids = new Set(categories.map((c) => c.id));
  const events = raw.events.map((e) => cleanEvent(e, ids, categories[0].id)).filter(Boolean);

  const settings = raw.settings ?? {};
  const lastTimes = {};
  for (const [id, t] of Object.entries(raw.lastTimes ?? {})) {
    if (ids.has(id) && TIME_RE.test(t?.start) && TIME_RE.test(t?.end)) lastTimes[id] = { start: t.start, end: t.end };
  }
  return {
    version: 1,
    categories,
    events,
    settings: {
      weekStart: settings.weekStart === 0 || settings.weekStart === 1 ? settings.weekStart : base.settings.weekStart,
      use24h: typeof settings.use24h === 'boolean' ? settings.use24h : base.settings.use24h,
    },
    lastTimes,
  };
}

export const parseBackup = (text) => hydrate(JSON.parse(text));

export function createStore(storage = globalThis.localStorage) {
  const listeners = new Set();
  let state = load();

  function load() {
    let saved = null;
    try {
      saved = storage?.getItem(STORAGE_KEY);
      if (saved) return hydrate(JSON.parse(saved));
    } catch {
      // Keep unreadable data aside instead of silently overwriting it.
      try { storage?.setItem(`${STORAGE_KEY}:unreadable`, saved); } catch { /* ignore */ }
    }
    return defaultState();
  }

  function commit(next) {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or unavailable (e.g. private browsing): keep working in memory.
    }
    listeners.forEach((fn) => fn(state));
  }

  const findEvent = (id) => state.events.find((e) => e.id === id);
  const swap = (id, event) => state.events.map((e) => (e.id === id ? event : e));

  // Remembers each category's last times so new shifts/workouts start pre-filled.
  function setEvents(events, touched) {
    let { lastTimes } = state;
    if (touched && !touched.allDay) {
      lastTimes = { ...lastTimes, [touched.categoryId]: { start: touched.start, end: touched.end } };
    }
    commit({ ...state, events, lastTimes });
  }

  function addEvent(data) {
    const event = { exceptions: [], until: null, notes: '', ...data, id: uid() };
    setEvents([...state.events, event], event);
    return event;
  }

  function updateEvent(id, data) {
    const event = { ...findEvent(id), ...data, id };
    setEvents(swap(id, event), event);
  }

  function deleteEvent(id) {
    setEvents(state.events.filter((e) => e.id !== id));
  }

  /** Removes a single occurrence of a repeating event. */
  function skipOccurrence(id, key) {
    const event = findEvent(id);
    setEvents(swap(id, { ...event, exceptions: [...event.exceptions, key] }));
  }

  /** Stops a repeating event before `key`, keeping earlier occurrences. */
  function endBefore(id, key) {
    const event = findEvent(id);
    if (key <= event.date) return deleteEvent(id);
    setEvents(swap(id, { ...event, until: addDays(key, -1), exceptions: event.exceptions.filter((k) => k < key) }));
  }

  /** Turns one occurrence of a repeating event into its own standalone event. */
  function detachOccurrence(id, key, data) {
    const event = findEvent(id);
    const single = { ...event, ...data, id: uid(), repeat: 'none', until: null, exceptions: [] };
    setEvents([...swap(id, { ...event, exceptions: [...event.exceptions, key] }), single], single);
  }

  /** Applies changes from occurrence `key` onward, leaving earlier occurrences as they were. */
  function splitSeries(id, key, data) {
    const event = findEvent(id);
    if (key <= event.date) return updateEvent(id, data);
    const before = { ...event, until: addDays(key, -1), exceptions: event.exceptions.filter((k) => k < key) };
    const after = { ...event, ...data, id: uid(), exceptions: event.exceptions.filter((k) => k >= key) };
    setEvents([...swap(id, before), after], after);
  }

  function saveCategory({ id, name, color }) {
    const category = cleanCategory({ id: id || uid(), name, color });
    const exists = state.categories.some((c) => c.id === category.id);
    const categories = exists
      ? state.categories.map((c) => (c.id === category.id ? category : c))
      : [...state.categories, category];
    commit({ ...state, categories });
    return category;
  }

  /** Deletes a category, moving its events to the first remaining one. */
  function deleteCategory(id) {
    if (state.categories.length < 2) return;
    const categories = state.categories.filter((c) => c.id !== id);
    const fallback = categories[0].id;
    const { [id]: _removed, ...lastTimes } = state.lastTimes;
    const events = state.events.map((e) => (e.categoryId === id ? { ...e, categoryId: fallback } : e));
    commit({ ...state, categories, events, lastTimes });
  }

  return {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    category: (id) => state.categories.find((c) => c.id === id) ?? state.categories[0],
    getEvent: findEvent,
    addEvent,
    updateEvent,
    deleteEvent,
    skipOccurrence,
    endBefore,
    detachOccurrence,
    splitSeries,
    saveCategory,
    deleteCategory,
    updateSettings: (patch) => commit({ ...state, settings: { ...state.settings, ...patch } }),
    exportData: () => JSON.stringify({ app: 'calendrier', exportedAt: new Date().toISOString(), ...state }, null, 2),
    replaceAll: (next) => commit(hydrate(next)),
    reset: () => commit(defaultState()),
  };
}
