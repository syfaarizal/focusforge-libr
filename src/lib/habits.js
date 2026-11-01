// habits.js — daily habit checklist + strict streak logic for FocusForge.
// Pure functions only: no localStorage, no Date.now(). Pass `now` (ms) in,
// so everything is testable. Dates are local-day keys: 'YYYY-MM-DD'.

export const DAY_START_HOUR = 3; // 00:00–02:59 still counts as the previous day
export const REST_DAYS_PER_MONTH = 2;

/* ------------------------------------------------------------------ */
/* Habit config                                                        */
/* ------------------------------------------------------------------ */
// kind:
//   'timer' -> press Start, Finish only works after minMinutes (workout)
//   'tap'   -> one tap inside the window (dhuha)
//   'focus' -> auto-done from Focus Lock sessions inside the window (study)
// open/close = the only time range in which the habit can count.
// Miss the window = 'missed', final, can't be edited afterwards.
export const DEFAULT_HABIT_VERSIONS = [
  {
    from: '2026-11-02',
    habits: [
      {
        id: 'workout', name: 'Workout', kind: 'timer', required: true,
        open: '06:45', close: '08:00', minMinutes: 30,
      },
      {
        id: 'dhuha', name: 'Dhuha', kind: 'tap', required: false,
        open: '08:00', close: '08:30', excusable: true,
      },
      {
        id: 'study', name: 'Belajar / Work', kind: 'focus', required: true,
        open: '10:00', close: '13:00', minMinutes: 90, // ASSUMPTION: adjust
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, '0');

export function dateKey(ts, dayStartHour = DAY_START_HOUR) {
  const d = new Date(ts - dayStartHour * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12); // noon avoids DST edge cases
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function atTime(key, hhmm) {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

const windowOf = (habit, key) => ({
  open: atTime(key, habit.open),
  close: atTime(key, habit.close),
});

/* ------------------------------------------------------------------ */
/* Habit versions: edits only take effect tomorrow                     */
/* ------------------------------------------------------------------ */
export function habitsFor(versions, key) {
  let current = null;
  for (const v of versions) {
    if (v.from <= key && (!current || v.from >= current.from)) current = v;
  }
  return current ? current.habits : [];
}

// Replaces/creates the version that starts tomorrow. Today stays untouched,
// so you can't "adjust" a habit you're about to miss.
export function scheduleHabitEdit(versions, newHabits, now) {
  const tomorrow = addDays(dateKey(now), 1);
  const rest = versions.filter((v) => v.from !== tomorrow);
  return [...rest, { from: tomorrow, habits: newHabits }];
}

/* ------------------------------------------------------------------ */
/* Rest days (planned, limited, must be set BEFORE the day starts)     */
/* ------------------------------------------------------------------ */
export function canScheduleRest(restDays, targetKey, now) {
  const today = dateKey(now);
  if (targetKey <= today) {
    return { ok: false, reason: 'Rest day must be set before that day starts.' };
  }
  if (restDays.includes(targetKey)) {
    return { ok: false, reason: 'Already a rest day.' };
  }
  const month = targetKey.slice(0, 7);
  const used = restDays.filter((k) => k.startsWith(month)).length;
  if (used >= REST_DAYS_PER_MONTH) {
    return { ok: false, reason: `Max ${REST_DAYS_PER_MONTH} rest days per month.` };
  }
  return { ok: true };
}

export function scheduleRest(restDays, targetKey, now) {
  const check = canScheduleRest(restDays, targetKey, now);
  if (!check.ok) return { ...check, restDays };
  return { ok: true, restDays: [...restDays, targetKey].sort() };
}

/* ------------------------------------------------------------------ */
/* Recording check-ins (immutable: returns new logs)                   */
/* logs[date][habitId] = { startedAt?, doneAt? }; logs[date].excused[] */
/* ------------------------------------------------------------------ */
const fail = (logs, reason) => ({ ok: false, reason, logs });

function withEntry(logs, key, habitId, entry) {
  const day = logs[key] ?? {};
  return { ...logs, [key]: { ...day, [habitId]: { ...(day[habitId] ?? {}), ...entry } } };
}

export function checkInTap(logs, habit, now) {
  const key = dateKey(now);
  const { open, close } = windowOf(habit, key);
  if (now < open) return fail(logs, 'Too early.');
  if (now > close) return fail(logs, 'Window closed.');
  return { ok: true, logs: withEntry(logs, key, habit.id, { doneAt: now }) };
}

export function startTimerHabit(logs, habit, now) {
  const key = dateKey(now);
  const { open, close } = windowOf(habit, key);
  if (now < open) return fail(logs, 'Too early.');
  if (now > close - habit.minMinutes * 60000) {
    return fail(logs, 'Too late to finish inside the window.');
  }
  if (logs[key]?.[habit.id]?.startedAt) return { ok: true, logs }; // keep first start
  return { ok: true, logs: withEntry(logs, key, habit.id, { startedAt: now }) };
}

export function finishTimerHabit(logs, habit, now) {
  const key = dateKey(now);
  const entry = logs[key]?.[habit.id];
  const { close } = windowOf(habit, key);
  if (!entry?.startedAt) return fail(logs, 'Not started.');
  if (now - entry.startedAt < habit.minMinutes * 60000) {
    return fail(logs, `Needs ${habit.minMinutes} minutes.`);
  }
  if (now > close) return fail(logs, 'Window closed.');
  return { ok: true, logs: withEntry(logs, key, habit.id, { doneAt: now }) };
}

// "Excused" (e.g. the dhuha alternative option). Only for habits flagged
// excusable, only for today, only before its window closes.
export function setExcused(logs, habit, now, value = true) {
  if (!habit.excusable) return fail(logs, 'This habit cannot be excused.');
  const key = dateKey(now);
  const { close } = windowOf(habit, key);
  if (now > close) return fail(logs, 'Window closed.');
  const day = logs[key] ?? {};
  const list = new Set(day.excused ?? []);
  value ? list.add(habit.id) : list.delete(habit.id);
  return { ok: true, logs: { ...logs, [key]: { ...day, excused: [...list] } } };
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */
// sessions: [{ startedAt, endedAt, status }] from Focus Lock history.
// ASSUMPTION: anything not 'dibatalkan' and with an endedAt counts.
const defaultIsCompleted = (s) => s.status !== 'dibatalkan' && !!s.endedAt;

export function focusMinutesInWindow(sessions, open, close, isCompleted = defaultIsCompleted) {
  let ms = 0;
  for (const s of sessions) {
    if (!isCompleted(s)) continue;
    const a = Math.max(s.startedAt, open);
    const b = Math.min(s.endedAt, close);
    if (b > a) ms += b - a;
  }
  return ms / 60000;
}

function isDone(habit, key, ctx) {
  const { open, close } = windowOf(habit, key);
  const entry = ctx.logs[key]?.[habit.id];
  switch (habit.kind) {
    case 'tap':
      return !!entry?.doneAt && entry.doneAt >= open && entry.doneAt <= close;
    case 'timer':
      return (
        !!entry?.startedAt && !!entry?.doneAt &&
        entry.startedAt >= open && entry.doneAt <= close &&
        entry.doneAt - entry.startedAt >= habit.minMinutes * 60000
      );
    case 'focus':
      return (
        focusMinutesInWindow(ctx.sessions ?? [], open, close, ctx.isCompleted) >=
        habit.minMinutes
      );
    default:
      return false;
  }
}

// 'rest' | 'excused' | 'done' | 'upcoming' | 'open' | 'missed'
export function habitStatus(habit, key, now, ctx) {
  if ((ctx.restDays ?? []).includes(key)) return 'rest';
  if (habit.excusable && ctx.logs[key]?.excused?.includes(habit.id)) return 'excused';
  if (isDone(habit, key, ctx)) return 'done';
  const { open, close } = windowOf(habit, key);
  if (now < open) return 'upcoming';
  if (now <= close) return 'open';
  return 'missed';
}

// 'rest' | 'complete' | 'broken' | 'pending'
export function resolveDay(key, now, ctx) {
  if ((ctx.restDays ?? []).includes(key)) return 'rest';
  const required = habitsFor(ctx.habitVersions, key).filter((h) => h.required);
  const statuses = required.map((h) => habitStatus(h, key, now, ctx));
  if (statuses.includes('missed')) return 'broken';
  if (statuses.some((s) => s === 'upcoming' || s === 'open')) return 'pending';
  return 'complete';
}

/* ------------------------------------------------------------------ */
/* Streaks                                                             */
/* ------------------------------------------------------------------ */
// ctx = { habitVersions, logs, sessions, restDays, startDate, isCompleted? }
export function computeStreak(now, ctx) {
  const today = dateKey(now);
  let current = 0;
  let longest = 0;
  let todayState = 'none';
  for (let k = ctx.startDate; k <= today; k = addDays(k, 1)) {
    const state = resolveDay(k, now, ctx);
    if (k === today) todayState = state;
    if (state === 'rest' || state === 'pending') continue; // neutral
    if (state === 'complete') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0; // broken
    }
  }
  return { current, longest, today: todayState };
}

// Streak for ONE habit (e.g. dhuha). Rest and excused days are neutral.
export function habitStreak(habitId, now, ctx) {
  const today = dateKey(now);
  let current = 0;
  let longest = 0;
  for (let k = ctx.startDate; k <= today; k = addDays(k, 1)) {
    const habit = habitsFor(ctx.habitVersions, k).find((h) => h.id === habitId);
    if (!habit) continue;
    const s = habitStatus(habit, k, now, ctx);
    if (s === 'done') {
      current += 1;
      longest = Math.max(longest, current);
    } else if (s === 'missed') {
      current = 0;
    } // rest / excused / upcoming / open: neutral
  }
  return { current, longest };
}
