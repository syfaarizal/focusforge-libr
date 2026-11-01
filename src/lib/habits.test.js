import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HABIT_VERSIONS, dateKey, addDays, atTime,
  checkInTap, startTimerHabit, finishTimerHabit, setExcused,
  habitStatus, resolveDay, computeStreak, habitStreak,
  canScheduleRest, scheduleRest, scheduleHabitEdit, habitsFor,
  focusMinutesInWindow,
} from './habits.js';

const at = (key, hhmm) => atTime(key, hhmm);
const [workout, dhuha, study] = DEFAULT_HABIT_VERSIONS[0].habits;
const MIN = 60000;

const baseCtx = (over = {}) => ({
  habitVersions: DEFAULT_HABIT_VERSIONS,
  logs: {},
  sessions: [],
  restDays: [],
  startDate: '2026-11-02',
  ...over,
});

// Helpers that build a fully-done required day
const doneWorkout = (key) => ({ startedAt: at(key, '07:00'), doneAt: at(key, '07:31') });
const studySession = (key, from = '10:00', to = '11:40') => ({
  startedAt: at(key, from), endedAt: at(key, to), status: 'completed',
});
function perfectDay(ctx, key) {
  ctx.logs[key] = { workout: doneWorkout(key) };
  ctx.sessions.push(studySession(key));
}

test('dateKey: before 03:00 still belongs to the previous day', () => {
  assert.equal(dateKey(at('2026-11-03', '02:59')), '2026-11-02');
  assert.equal(dateKey(at('2026-11-03', '03:00')), '2026-11-03');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('workout: needs a full 30 minutes inside the window', () => {
  const k = '2026-11-02';
  let r = startTimerHabit({}, workout, at(k, '06:30'));
  assert.equal(r.ok, false); // too early

  r = startTimerHabit({}, workout, at(k, '07:00'));
  assert.equal(r.ok, true);
  const logs = r.logs;

  assert.equal(finishTimerHabit(logs, workout, at(k, '07:20')).ok, false); // too short
  const fin = finishTimerHabit(logs, workout, at(k, '07:30'));
  assert.equal(fin.ok, true);

  const ctx = baseCtx({ logs: fin.logs });
  assert.equal(habitStatus(workout, k, at(k, '07:31'), ctx), 'done');
});

test('workout: starting too late to finish in time is refused', () => {
  const r = startTimerHabit({}, workout, at('2026-11-02', '07:45'));
  assert.equal(r.ok, false);
});

test('workout: unfinished after the window closes = missed', () => {
  const k = '2026-11-02';
  const ctx = baseCtx({ logs: { [k]: { workout: { startedAt: at(k, '07:00') } } } });
  assert.equal(habitStatus(workout, k, at(k, '07:50'), ctx), 'open');
  assert.equal(habitStatus(workout, k, at(k, '08:01'), ctx), 'missed');
});

test('dhuha: tap only inside 08:00–08:30', () => {
  const k = '2026-11-02';
  assert.equal(checkInTap({}, dhuha, at(k, '07:59')).ok, false);
  assert.equal(checkInTap({}, dhuha, at(k, '08:31')).ok, false);
  const r = checkInTap({}, dhuha, at(k, '08:10'));
  assert.equal(r.ok, true);
  assert.equal(habitStatus(dhuha, k, at(k, '09:00'), baseCtx({ logs: r.logs })), 'done');
});

test('dhuha is optional: missing it does not break the main streak', () => {
  const ctx = baseCtx();
  perfectDay(ctx, '2026-11-02'); // no dhuha
  const now = at('2026-11-03', '04:00'); // day key still 11-02? no: 04:00 is 11-03
  const s = computeStreak(now, ctx);
  assert.equal(s.current, 1);
  assert.equal(habitStatus(dhuha, '2026-11-02', now, ctx), 'missed');
});

test('study: cancelled sessions are ignored, partial sessions add up, outside-window is clipped', () => {
  const k = '2026-11-02';
  const open = at(k, '10:00'), close = at(k, '13:00');
  const sessions = [
    { startedAt: at(k, '09:00'), endedAt: at(k, '10:30'), status: 'completed' }, // 30 min inside
    { startedAt: at(k, '10:30'), endedAt: at(k, '11:30'), status: 'completed' }, // 60 inside
    { startedAt: at(k, '11:30'), endedAt: at(k, '12:30'), status: 'dibatalkan' }, // ignored
  ];
  assert.equal(focusMinutesInWindow(sessions, open, close), 90);
  assert.equal(habitStatus(study, k, at(k, '12:00'), baseCtx({ sessions })), 'done');
  assert.equal(
    habitStatus(study, k, at(k, '12:00'), baseCtx({ sessions: sessions.slice(1, 2) })),
    'open',
  );
  assert.equal(habitStatus(study, k, at(k, '13:01'), baseCtx({ sessions: sessions.slice(1, 2) })), 'missed');
});

test('streak counts consecutive complete days and breaks on a missed required habit', () => {
  const ctx = baseCtx();
  perfectDay(ctx, '2026-11-02');
  perfectDay(ctx, '2026-11-03');
  // 11-04: workout done, study missed
  ctx.logs['2026-11-04'] = { workout: doneWorkout('2026-11-04') };
  perfectDay(ctx, '2026-11-05');
  perfectDay(ctx, '2026-11-06');

  const s = computeStreak(at('2026-11-07', '04:00'), ctx);
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
});

test('today pending: streak is not counted yet but not broken either', () => {
  const ctx = baseCtx();
  perfectDay(ctx, '2026-11-02');
  const s = computeStreak(at('2026-11-03', '06:00'), ctx);
  assert.equal(s.current, 1);
  assert.equal(s.today, 'pending');
});

test('streak dies the moment a required window closes unfinished', () => {
  const ctx = baseCtx();
  perfectDay(ctx, '2026-11-02');
  const now = at('2026-11-03', '08:01'); // workout window just closed, nothing logged
  const s = computeStreak(now, ctx);
  assert.equal(s.current, 0);
  assert.equal(s.longest, 1);
  assert.equal(s.today, 'broken');
});

test('app not opened for days = those days are missed', () => {
  const ctx = baseCtx();
  perfectDay(ctx, '2026-11-02');
  const s = computeStreak(at('2026-11-06', '09:00'), ctx);
  assert.equal(s.current, 0);
});

test('rest days: neutral for the streak, rules enforced', () => {
  const now = at('2026-11-03', '20:00');
  assert.equal(canScheduleRest([], '2026-11-03', now).ok, false); // today
  assert.equal(canScheduleRest([], '2026-11-02', now).ok, false); // past
  let r = scheduleRest([], '2026-11-05', now);
  assert.equal(r.ok, true);
  r = scheduleRest(r.restDays, '2026-11-06', now);
  assert.equal(r.ok, true);
  assert.equal(scheduleRest(r.restDays, '2026-11-09', now).ok, false); // 3rd in month
  assert.equal(scheduleRest(r.restDays, '2026-12-01', now).ok, true); // next month ok

  const ctx = baseCtx({ restDays: ['2026-11-03'] });
  perfectDay(ctx, '2026-11-02');
  perfectDay(ctx, '2026-11-04');
  const s = computeStreak(at('2026-11-05', '04:00'), ctx);
  assert.equal(s.current, 2); // rest day neither adds nor breaks
});

test('dhuha excuse: only today, before window closes, neutral for dhuha streak', () => {
  const k = '2026-11-03';
  assert.equal(setExcused({}, study, at(k, '09:00')).ok, false); // not excusable
  assert.equal(setExcused({}, dhuha, at(k, '09:00')).ok, false); // window closed
  const r = setExcused({}, dhuha, at(k, '07:00'));
  assert.equal(r.ok, true);

  const ctx = baseCtx({ logs: { ...r.logs } });
  ctx.logs['2026-11-02'] = { dhuha: { doneAt: at('2026-11-02', '08:10') } };
  assert.equal(habitStatus(dhuha, k, at(k, '12:00'), ctx), 'excused');
  ctx.logs['2026-11-04'] = { dhuha: { doneAt: at('2026-11-04', '08:05') } };
  const hs = habitStreak('dhuha', at('2026-11-04', '12:00'), ctx);
  assert.equal(hs.current, 2); // 11-02 done, 11-03 excused (neutral), 11-04 done
});

test('habit edits only take effect tomorrow', () => {
  const now = at('2026-11-02', '10:00');
  const edited = DEFAULT_HABIT_VERSIONS[0].habits.map((h) =>
    h.id === 'study' ? { ...h, open: '14:00', close: '17:00' } : h);
  const versions = scheduleHabitEdit(DEFAULT_HABIT_VERSIONS, edited, now);
  assert.equal(habitsFor(versions, '2026-11-02').find((h) => h.id === 'study').open, '10:00');
  assert.equal(habitsFor(versions, '2026-11-03').find((h) => h.id === 'study').open, '14:00');
});
