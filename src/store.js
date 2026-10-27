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
});

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

  addTask: ({ name, category, targetMin, notes }) => {
    const task = {
      id: uid(),
      name: name.trim(),
      category,
      targetMin: targetMin || null,
      notes: (notes || '').trim(),
      done: false,
      createdAt: Date.now(),
      doneAt: null,
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

  deleteSession: (id) => commit({ ...state, sessions: state.sessions.filter((s) => s.id !== id) }),
  restoreSession: (s) =>
    commit({ ...state, sessions: [...state.sessions, s].sort((a, b) => b.startedAt - a.startedAt) }),
  clearSessions: () => commit({ ...state, sessions: [] }),
};
