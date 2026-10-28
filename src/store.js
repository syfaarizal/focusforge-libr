import { useSyncExternalStore } from 'react';
import { uid } from './utils';

const KEY = 'focusforge.v1';

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
};
