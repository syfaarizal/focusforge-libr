import { useSyncExternalStore } from 'react';
import { uid } from './utils';
import {
  DEFAULT_HABIT_VERSIONS,
  autoFinishTimer,
  checkInTap,
  dateKey as habitDateKey,
  habitsFor,
  scheduleHabitEdit,
  scheduleRest,
  setExcused,
  startTimerHabit,
} from './lib/habits';

const KEY = 'focusforge.v1';

/** Habits start today with the default plan; edits only ever apply from tomorrow. */
const habitDefaults = () => {
  const today = habitDateKey(Date.now());
  return {
    habitVersions: [{ from: today, habits: DEFAULT_HABIT_VERSIONS[0].habits.map((h) => ({ ...h })) }],
    logs: {},
    restDays: [],
    startDate: today,
  };
};

const defaults = () => ({
  profile: { name: 'Kai Shi' },
  settings: {
    lockEnabled: true,
    pinEnabled: true,
    notifications: true,
    dailyGoalMin: 240,
    defaultDurationMin: 90,
  },
  tasks: [],
  sessions: [],
  active: null,
  emergencyExitUsage: { date: null, count: 0 },
  habits: habitDefaults(),
});

const localDateKey = (ts = Date.now()) => {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return defaults();
    const d = defaults();
    return {
      ...d,
      ...raw,
      profile: { ...d.profile, ...raw.profile },
      settings: { ...d.settings, ...raw.settings },
      emergencyExitUsage: { ...d.emergencyExitUsage, ...raw.emergencyExitUsage },
      habits: { ...d.habits, ...(raw.habits || {}) },
      // tasks saved before scheduling existed: back-date them to their creation day
      tasks: (raw.tasks || []).map((t) => (t.scheduledFor ? t : { ...t, scheduledFor: localDateKey(t.createdAt) })),
    };
  } catch {
    return defaults();
  }
}

let state = load();
let lastResult = null; // finished session to show in the "complete" dialog (not persisted)
const listeners = new Set();

function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useStore = () => useSyncExternalStore(subscribe, () => state);
export const useResult = () => useSyncExternalStore(subscribe, () => lastResult);
export const getState = () => state;

export const EMERGENCY_EXITS_PER_DAY = 2;
export const emergencyExitsRemaining = (now = new Date()) => {
  const usage = state.emergencyExitUsage;
  const used = usage?.date === localDateKey(now) ? usage.count : 0;
  return Math.max(0, EMERGENCY_EXITS_PER_DAY - used);
};

export function setResult(r) {
  lastResult = r;
  listeners.forEach((l) => l());
}

/* ---------- time helpers for the active session ---------- */
export const elapsedMs = (a, now = Date.now()) =>
  Math.max(0, (a.pausedAt ?? now) - a.startedAt - a.pausedTotal);
export const remainingMs = (a, now = Date.now()) => a.plannedMs - elapsedMs(a, now);
export const endAt = (a) => a.startedAt + a.pausedTotal + a.plannedMs;

/* ---------- actions ---------- */
export const actions = {
  setName: (name) => commit({ ...state, profile: { ...state.profile, name: name.trim() || 'Kai Shi' } }),
  updateSettings: (patch) => commit({ ...state, settings: { ...state.settings, ...patch } }),

  addTask: ({ name, category, targetMin, notes, scheduledFor }) => {
    const task = {
      id: uid(),
      name: name.trim(),
      category,
      targetMin: targetMin || null,
      notes: (notes || '').trim(),
      done: false,
      createdAt: Date.now(),
      doneAt: null,
      scheduledFor: scheduledFor || localDateKey(),
    };
    commit({ ...state, tasks: [task, ...state.tasks] });
    return task;
  },
  toggleTask: (id) =>
    commit({
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t,
      ),
    }),
  deleteTask: (id) => commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) }),

  /** Move an overdue task to today. */
  pullToToday: (id) =>
    commit({
      ...state,
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, scheduledFor: localDateKey() } : t)),
    }),

  startSession: ({ taskId, durationMin, locked }) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || state.active) return;
    commit({
      ...state,
      active: {
        id: uid(),
        taskId,
        taskName: task.name,
        category: task.category,
        notes: task.notes,
        plannedMs: durationMin * 60000,
        startedAt: Date.now(),
        pausedAt: null,
        pausedTotal: 0,
        locked: !!locked,
      },
    });
  },
  pause: () => {
    const a = state.active;
    if (!a || a.pausedAt) return;
    commit({ ...state, active: { ...a, pausedAt: Date.now() } });
  },
  resume: () => {
    const a = state.active;
    if (!a || !a.pausedAt) return;
    commit({
      ...state,
      active: { ...a, pausedTotal: a.pausedTotal + (Date.now() - a.pausedAt), pausedAt: null },
    });
  },
  /** status: 'completed' | 'cancelled'. `natural` = timer ran out by itself. */
  finish: (status, natural = false) => {
    const a = state.active;
    if (!a) return null;
    const now = Date.now();
    const elapsed = elapsedMs(a, now);
    const actualMs = natural ? a.plannedMs : Math.min(elapsed, a.plannedMs);
    const endedAt = natural ? endAt(a) : now;
    const session = {
      id: a.id,
      taskId: a.taskId,
      taskName: a.taskName,
      category: a.category,
      startedAt: a.startedAt,
      endedAt,
      plannedMs: a.plannedMs,
      actualMs,
      status,
    };
    const tasks =
      status === 'completed'
        ? state.tasks.map((t) => (t.id === a.taskId && !t.done ? { ...t, done: true, doneAt: now } : t))
        : state.tasks;
    commit({ ...state, active: null, tasks, sessions: [session, ...state.sessions] });
    return session;
  },

  emergencyExit: () => {
    if (!state.active || emergencyExitsRemaining() <= 0) return null;
    const date = localDateKey();
    const count = state.emergencyExitUsage?.date === date ? state.emergencyExitUsage.count : 0;
    commit({ ...state, emergencyExitUsage: { date, count: count + 1 } });
    return actions.finish('cancelled');
  },

  deleteSession: (id) => commit({ ...state, sessions: state.sessions.filter((s) => s.id !== id) }),
  restoreSession: (s) =>
    commit({ ...state, sessions: [...state.sessions, s].sort((a, b) => b.startedAt - a.startedAt) }),
  clearSessions: () => commit({ ...state, sessions: [] }),

  /**
   * A focus session for a habit: no task behind it, it only exists to fill
   * the habit's window. Sessions still count toward the focus habit.
   */
  startHabitSession: ({ name, durationMin, locked }) => {
    if (state.active) return null;
    const session = {
      id: uid(),
      taskId: null,
      taskName: name,
      category: 'Work',
      notes: '',
      plannedMs: durationMin * 60000,
      startedAt: Date.now(),
      pausedAt: null,
      pausedTotal: 0,
      locked: !!locked,
    };
    commit({ ...state, active: session });
    return session;
  },

  /* ---------- habits ---------- */
  habitCheckInTap: (habit) => {
    const r = checkInTap(state.habits.logs, habit, Date.now());
    if (r.ok) commit({ ...state, habits: { ...state.habits, logs: r.logs } });
    return r;
  },
  habitStartTimer: (habit) => {
    const r = startTimerHabit(state.habits.logs, habit, Date.now());
    if (r.ok) commit({ ...state, habits: { ...state.habits, logs: r.logs } });
    return r;
  },
  habitSetExcused: (habit, value) => {
    const r = setExcused(state.habits.logs, habit, Date.now(), value);
    if (r.ok) commit({ ...state, habits: { ...state.habits, logs: r.logs } });
    return r;
  },

  /**
   * Advances running habit timers and reports which habits just completed.
   * Called on a timer while the Habits screen is open, so a workout that runs
   * out is ticked off without anyone pressing "Finish".
   */
  habitTick: () => {
    const now = Date.now();
    const key = habitDateKey(now);
    const habits = habitsFor(state.habits.habitVersions, key);
    let logs = state.habits.logs;
    const completed = [];

    for (const habit of habits) {
      if (habit.kind !== 'timer') continue;
      const r = autoFinishTimer(logs, habit, key, now);
      if (!r.ok) continue;
      logs = r.logs;
      completed.push(habit);
    }

    if (completed.length) {
      commit({ ...state, habits: { ...state.habits, logs } });
    }
    return completed;
  },
  habitScheduleRest: (targetKey) => {
    const r = scheduleRest(state.habits.restDays, targetKey, Date.now());
    if (r.ok) commit({ ...state, habits: { ...state.habits, restDays: r.restDays } });
    return r;
  },
  habitCancelRest: (targetKey) =>
    commit({
      ...state,
      habits: { ...state.habits, restDays: state.habits.restDays.filter((k) => k !== targetKey) },
    }),
  habitSaveVersions: (habits) =>
    commit({
      ...state,
      habits: {
        ...state.habits,
        habitVersions: scheduleHabitEdit(state.habits.habitVersions, habits, Date.now()),
      },
    }),
  habitResetLogs: () =>
    commit({ ...state, habits: { ...state.habits, logs: {} } }),
};

/**
 * Context for the pure habit logic. Session completion is judged by this app's
 * own status names, which differ from the library's default.
 */
export const habitContext = (s = state) => ({
  habitVersions: s.habits.habitVersions,
  logs: s.habits.logs,
  sessions: s.sessions,
  restDays: s.habits.restDays,
  startDate: s.habits.startDate,
  isCompleted: (sess) => sess.status === 'completed' && !!sess.endedAt,
});
