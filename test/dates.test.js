import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMinutes, diffDays, formatDuration, formatTime, monthGrid, startOfWeek, weekday,
} from '../js/dates.js';

test('day arithmetic crosses months, years and DST changes', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US DST starts
  assert.equal(diffDays('2026-03-01', '2026-04-01'), 31);
  assert.equal(diffDays('2026-11-01', '2026-10-25'), -7);
});

test('weekday and startOfWeek', () => {
  assert.equal(weekday('2026-10-02'), 5); // Friday
  assert.equal(weekday('1970-01-01'), 4); // Thursday
  assert.equal(startOfWeek('2026-10-02', 0), '2026-09-27');
  assert.equal(startOfWeek('2026-10-02', 1), '2026-09-28');
  assert.equal(startOfWeek('2026-09-27', 0), '2026-09-27');
  assert.equal(startOfWeek('2026-09-27', 1), '2026-09-21');
});

test('monthGrid covers the whole month in full weeks', () => {
  const oct = monthGrid(2026, 9, 0);
  assert.equal(oct.length % 7, 0);
  assert.equal(oct[0], '2026-09-27');
  assert.ok(oct.includes('2026-10-01') && oct.includes('2026-10-31'));
  assert.equal(oct.length, 35);

  const feb = monthGrid(2026, 1, 0); // Feb 2026 starts on a Sunday and fits 4 weeks
  assert.equal(feb.length, 28);
  assert.equal(feb[0], '2026-02-01');

  const monday = monthGrid(2026, 9, 1);
  assert.equal(weekday(monday[0]), 1);
});

test('times and durations', () => {
  assert.equal(addMinutes('23:30', 60), '00:30');
  assert.equal(addMinutes('00:15', -30), '23:45');
  assert.equal(formatTime('09:05', true), '09:05');
  assert.equal(formatTime('00:00', false), '12:00 AM');
  assert.equal(formatTime('13:30', false), '1:30 PM');
  assert.equal(formatDuration(480), '8h');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(45), '45m');
});
