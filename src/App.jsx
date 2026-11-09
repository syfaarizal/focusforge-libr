import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Check } from 'lucide-react';
import { actions, endAt, getState, habitContext, remainingMs, setResult, useResult, useStore } from './store';
import { BottomNav, Modal } from './components/ui';
import {
  beep,
  buzz,
  cancelEnd,
  cancelHabitTimerEnd,
  clearHabitReminders,
  closeHabitTimerEnd,
  endNotifRings,
  habitTimerEndScheduledIds,
  isNative,
  keepAwake,
  notifyHabitDone,
  pinStart,
  pinStop,
  scheduleEnd,
  scheduleHabitTimerEnd,
  syncHabitReminders,
} from './native';
import { fmtHM } from './utils';
import { useTodayKey } from './hooks';
import { dateKey, habitsFor, habitStatus, reminderTimes, runningHabitTimers } from './lib/habits';
import Loading from './screens/Loading';
import Home from './screens/Home';
import Tasks from './screens/Tasks';
import AddTask from './screens/AddTask';
import WorkTime from './screens/WorkTime';
import Locked from './screens/Locked';
import Tracker from './screens/Tracker';
import History from './screens/History';
import Stats from './screens/Stats';
import Settings from './screens/Settings';
import Habits from './screens/Habits';
import HabitEdit from './screens/HabitEdit';

const TABS = ['home', 'tracker', 'history', 'settings'];

export default function App() {
  const store = useStore();
  const { active, settings } = store;
  const todayKey = useTodayKey();
  const result = useResult();
  const [booting, setBooting] = useState(true);
  const [stack, setStack] = useState([{ name: 'home' }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const route = stack[stack.length - 1];

  const go = useCallback((name) => setStack([{ name }]), []);
  const push = useCallback((name, params) => setStack((s) => [...s, { name, params }]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home' }])), []);

  /* ---- session engine: finish automatically when the timer runs out ---- */
  useEffect(() => {
    if (!active) return undefined;
    const check = () => {
      const a = getState().active;
      if (a && !a.pausedAt && remainingMs(a) <= 0) {
        const s = actions.finish('completed', true);
        setResult(s);
        buzz();
        // An exactly scheduled alert rings on its own at this moment, so the
        // app only plays the sound when there is no such alert.
        if (!endNotifRings()) beep();
      }
    };
    check();
    const t = setInterval(check, 500);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- native side effects: keep awake, screen pinning, end notification ---- */
  const running = !!active && !active.pausedAt;
  useEffect(() => {
    keepAwake(running);
  }, [running]);

  const locked = !!active?.locked && settings.pinEnabled;
  useEffect(() => {
    if (locked) pinStart();
    else pinStop();
  }, [locked, active?.id]);

  const end = active && !active.pausedAt ? endAt(active) : null;
  useEffect(() => {
    if (end && settings.notifications) scheduleEnd(end, active.taskName);
    else cancelEnd();
  }, [end, settings.notifications]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- habits: advance running timers, notify on completion ---- */
  const notifiedFocus = useRef(new Set());
  useEffect(() => {
    const check = async () => {
      const done = actions.habitTick();
      for (const habit of done) {
        // An exactly scheduled alert already announced this completion and
        // already rang, so neither the sound nor the notification is repeated.
        const announced = await closeHabitTimerEnd(habit.id);
        buzz();
        if (!announced) {
          beep();
          if (settings.notifications) notifyHabitDone(habit);
        }
      }

      // A focus habit (Study / Work) is complete once enough focus time was
      // logged inside its window. That has no timer of its own, so the moment
      // it flips to done is noticed here.
      const key = dateKey(Date.now());
      const ctx = habitContext();
      for (const habit of habitsFor(ctx.habitVersions, key)) {
        if (habit.kind !== 'focus') continue;
        const id = `${key}:${habit.id}`;
        const doneNow = habitStatus(habit, key, Date.now(), ctx) === 'done';
        if (doneNow && !notifiedFocus.current.has(id)) {
          notifiedFocus.current.add(id);
          buzz();
          if (settings.notifications) notifyHabitDone(habit);
        } else if (!doneNow) {
          notifiedFocus.current.delete(id);
        }
      }
    };
    check();
    const t = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [settings.notifications]);

  /* ---- habits: schedule a reminder for every window that is still ahead ---- */
  const habitVersions = store.habits.habitVersions;
  const habitVersionsKey = habitVersions.map((v) => `${v.from}:${v.habits.map((h) => `${h.id}:${h.open}`).join(',')}`).join('|');
  useEffect(() => {
    if (!settings.notifications) {
      clearHabitReminders();
      return;
    }
    const now = Date.now();
    const key = dateKey(now);
    const reminders = reminderTimes(habitsFor(habitVersions, key), key, now);
    syncHabitReminders(reminders);
  }, [habitVersionsKey, settings.notifications, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- habits: alert when a running timer runs out, even if the app is not ---- */
  const runningTimers = runningHabitTimers(store.habits.logs, habitVersions, dateKey(Date.now()));
  const runningTimersKey = runningTimers.map((t) => `${t.habit.id}:${t.at}`).join('|');
  useEffect(() => {
    const wanted = new Set(runningTimers.map((t) => t.habit.id));
    // A timer that is no longer running must not leave its alert behind, and
    // neither may an alert survive the notifications being switched off.
    [...habitTimerEndScheduledIds()].forEach((id) => {
      if (!wanted.has(id) || !settings.notifications) cancelHabitTimerEnd(id);
    });
    if (!settings.notifications) return;
    runningTimers.forEach((t) => scheduleHabitTimerEnd(t.at, t.habit.id, t.name));
  }, [runningTimersKey, settings.notifications, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Android back button ---- */
  useEffect(() => {
    if (!isNative) return undefined;
    let handle;
    CapApp.addListener('backButton', () => {
      if (getState().active?.locked) return;
      const s = stackRef.current;
      if (s.length > 1) setStack(s.slice(0, -1));
      else if (s[0].name !== 'home') setStack([{ name: 'home' }]);
      else CapApp.minimizeApp();
    }).then((h) => {
      handle = h;
    });
    return () => handle?.remove();
  }, []);

  if (active?.locked && !booting) {
    return (
      <>
        <Locked />
        {result && <ResultDialog result={result} />}
      </>
    );
  }

  const props = { go, push, back, params: route.params };
  const screens = {
    home: Home,
    tasks: Tasks,
    addTask: AddTask,
    work: WorkTime,
    tracker: Tracker,
    history: History,
    stats: Stats,
    settings: Settings,
    habits: Habits,
    habitEdit: HabitEdit,
  };
  const Screen = screens[route.name] || Home;

  return (
    <div className="app">
      <Screen {...props} />
      {TABS.includes(route.name) && <BottomNav current={route.name} go={go} onAdd={() => push('addTask')} />}
      {result && <ResultDialog result={result} />}
      {booting && <Loading onDone={() => setBooting(false)} />}
    </div>
  );
}

function ResultDialog({ result }) {
  const done = result.status === 'completed';
  return (
    <Modal onClose={() => setResult(null)}>
      <div className="alert-ring ok">
        <Check size={34} strokeWidth={3} />
      </div>
      <h2>{done ? 'Session complete' : 'Session saved'}</h2>
      <p>
        {result.taskName} · {fmtHM(result.actualMs)}
      </p>
      <button className="btn primary" onClick={() => setResult(null)}>
        Done
      </button>
    </Modal>
  );
}
