import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMinutes, isOvernight, occurrencesOn, occursOn, summarizeRange } from '../js/events.js';

const base = { title: '', categoryId: 'work', allDay: false, start: '09:00', end: '17:00', until: null, exceptions: [], notes: '' };
const ev = (fields) => ({ ...base, id: Math.random().toString(36), ...fields });

test('one-off events only happen on their date', () => {
  const e = ev({ date: '2026-10-02', repeat: 'none' });
  assert.ok(occursOn(e, '2026-10-02'));
  assert.ok(!occursOn(e, '2026-10-03'));
});

test('weekly, biweekly and weekday repeats', () => {
  const weekly = ev({ date: '2026-10-02', repeat: 'weekly' });
  assert.ok(occursOn(weekly, '2026-10-09'));
  assert.ok(!occursOn(weekly, '2026-10-08'));
  assert.ok(!occursOn(weekly, '2026-09-25'), 'nothing before the start date');

  const biweekly = ev({ date: '2026-10-02', repeat: 'biweekly' });
  assert.ok(!occursOn(biweekly, '2026-10-09'));
  assert.ok(occursOn(biweekly, '2026-10-16'));

  const weekdays = ev({ date: '2026-10-02', repeat: 'weekdays' });
  assert.ok(occursOn(weekdays, '2026-10-05')); // Monday
  assert.ok(!occursOn(weekdays, '2026-10-03')); // Saturday
});

test('monthly repeats skip months without that day', () => {
  const e = ev({ date: '2026-01-31', repeat: 'monthly' });
  assert.ok(occursOn(e, '2026-03-31'));
  assert.ok(!occursOn(e, '2026-02-28'));
  assert.ok(!occursOn(e, '2026-04-30'));
});

test('until and exceptions', () => {
  const e = ev({ date: '2026-10-01', repeat: 'daily', until: '2026-10-05', exceptions: ['2026-10-03'] });
  assert.ok(occursOn(e, '2026-10-05'));
  assert.ok(!occursOn(e, '2026-10-06'));
  assert.ok(!occursOn(e, '2026-10-03'));
});

test('occurrences sort all-day first, then by start time', () => {
  const list = occurrencesOn([
    ev({ title: 'Gym', date: '2026-10-02', repeat: 'none', start: '18:00', end: '19:00' }),
    ev({ title: 'Trip', date: '2026-10-02', repeat: 'none', allDay: true }),
    ev({ title: 'Shift', date: '2026-10-02', repeat: 'none', start: '07:00', end: '15:00' }),
  ], '2026-10-02');
  assert.deepEqual(list.map((o) => o.title), ['Trip', 'Shift', 'Gym']);
  assert.ok(list.every((o) => o.on === '2026-10-02'));
});

test('overnight shifts', () => {
  const night = { allDay: false, start: '22:00', end: '06:00' };
  assert.ok(isOvernight(night));
  assert.equal(durationMinutes(night), 480);
  assert.ok(!isOvernight({ allDay: false, start: '09:00', end: '17:00' }));
  assert.equal(durationMinutes({ allDay: true, start: '09:00', end: '17:00' }), 0);
});

test('weekly summary counts occurrences and hours per category', () => {
  const totals = summarizeRange([
    ev({ categoryId: 'work', date: '2026-09-28', repeat: 'weekdays' }),
    ev({ categoryId: 'gym', date: '2026-09-29', repeat: 'none', start: '18:00', end: '19:30' }),
  ], '2026-09-27', 7);
  assert.deepEqual(totals.get('work'), { count: 5, minutes: 2400 });
  assert.deepEqual(totals.get('gym'), { count: 1, minutes: 90 });
});
