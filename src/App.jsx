import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Check } from 'lucide-react';
import { actions, endAt, getState, remainingMs, setResult, useResult, useStore } from './store';
import { BottomNav, Modal } from './components/ui';
import { beep, buzz, cancelEnd, isNative, keepAwake, pinStart, pinStop, scheduleEnd } from './native';
import { fmtHM } from './utils';
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

const TABS = ['home', 'tracker', 'history', 'settings'];

export default function App() {
  const { active, settings } = useStore();
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
        beep();
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
