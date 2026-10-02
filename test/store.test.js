import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn } from '../js/events.js';
import { createStore, parseBackup } from '../js/store.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    data,
  };
}

const shift = {
  title: 'Shift', categoryId: 'work', date: '2026-10-05', allDay: false,
  start: '07:00', end: '15:00', repeat: 'weekly', until: null, notes: '',
};

test('events persist and reload', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const added = store.addEvent(shift);
  const reloaded = createStore(storage);
  assert.equal(reloaded.state.events.length, 1);
  assert.equal(reloaded.getEvent(added.id).title, 'Shift');
});

test('remembers the last times used per category', () => {
  const store = createStore(memoryStorage());
  store.addEvent(shift);
  assert.deepEqual(store.state.lastTimes.work, { start: '07:00', end: '15:00' });
});

test('skip, detach and split a repeating event', () => {
  const store = createStore(memoryStorage());
  const { id } = store.addEvent(shift);

  store.skipOccurrence(id, '2026-10-12');
  assert.ok(!occursOn(store.getEvent(id), '2026-10-12'));

  store.detachOccurrence(id, '2026-10-19', { ...shift, date: '2026-10-19', start: '09:00', end: '17:00' });
  assert.ok(!occursOn(store.getEvent(id), '2026-10-19'));
  const single = store.state.events.find((e) => e.id !== id);
  assert.equal(single.repeat, 'none');
  assert.equal(single.start, '09:00');

  store.splitSeries(id, '2026-11-02', { ...shift, date: '2026-11-02', start: '12:00', end: '20:00' });
  const original = store.getEvent(id);
  assert.equal(original.until, '2026-11-01');
  assert.ok(occursOn(original, '2026-10-26'));
  const later = store.state.events.find((e) => e.id !== id && e.repeat === 'weekly');
  assert.equal(later.start, '12:00');
  assert.ok(occursOn(later, '2026-11-09'));
});

test('endBefore keeps earlier occurrences, or deletes when at the start', () => {
  const store = createStore(memoryStorage());
  const a = store.addEvent(shift);
  store.endBefore(a.id, '2026-10-19');
  assert.equal(store.getEvent(a.id).until, '2026-10-18');
  store.endBefore(a.id, '2026-10-05');
  assert.equal(store.getEvent(a.id), undefined);
});

test('deleting a category moves its events', () => {
  const store = createStore(memoryStorage());
  store.addEvent({ ...shift, categoryId: 'gym' });
  store.deleteCategory('gym');
  assert.ok(!store.state.categories.some((c) => c.id === 'gym'));
  assert.equal(store.state.events[0].categoryId, 'plans');
});

test('backups round-trip and junk is rejected', () => {
  const store = createStore(memoryStorage());
  store.addEvent(shift);
  store.saveCategory({ name: 'School', color: '#5856D6' });
  const backup = parseBackup(store.exportData());
  assert.equal(backup.events.length, 1);
  assert.ok(backup.categories.some((c) => c.name === 'School'));

  assert.throws(() => parseBackup('{"hello": 1}'));
  assert.throws(() => parseBackup('not json'));

  const cleaned = parseBackup(JSON.stringify({ events: [{ date: 'bad' }, { date: '2026-01-01', categoryId: 'nope', start: '99:99' }] }));
  assert.equal(cleaned.events.length, 1);
  assert.equal(cleaned.events[0].categoryId, 'plans');
  assert.equal(cleaned.events[0].start, '09:00');
});

test('corrupted storage is kept aside instead of lost', () => {
  const storage = memoryStorage();
  storage.setItem('calendrier:v1', '{broken');
  const store = createStore(storage);
  assert.equal(store.state.events.length, 0);
  assert.equal(storage.getItem('calendrier:v1:unreadable'), '{broken');
});
