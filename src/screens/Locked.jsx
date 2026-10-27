import { useEffect, useRef, useState } from 'react';
import { Lock, CheckSquare, Clock } from 'lucide-react';
import { Modal } from '../components/ui';
import { actions, remainingMs, useStore } from '../store';
import { useNow } from '../hooks';
import { fmtClock } from '../utils';
import { isNative, isPinned } from '../native';

const HOLD_MS = 5000;

export default function Locked() {
  const { active, settings } = useStore();
  const now = useNow(true, 250);
  const [confirm, setConfirm] = useState(false);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    if (!isNative || !settings.pinEnabled) return undefined;
    const t = setTimeout(async () => setPinned(await isPinned()), 2500);
    return () => clearTimeout(t);
  }, [settings.pinEnabled]);

  if (!active) return null;
  const left = remainingMs(active, now);

  return (
    <div className="locked">
      <div className="locked-glow" />
      <div className="locked-main">
        <div className="lock-circle">
          <Lock size={42} />
        </div>
        <h1>Focus Time</h1>
        <p>You’re in a locked session.</p>

        <div className="card locked-card">
          <div className="lc-row">
            <CheckSquare size={20} className="red" />
            <div>
              <small>Task</small>
              <b>{active.taskName}</b>
            </div>
          </div>
          <div className="divider" />
          <div className="lc-row">
            <Clock size={20} className="red" />
            <div>
              <small>Time Left</small>
              <b className="mono">{fmtClock(left)}</b>
            </div>
          </div>
        </div>

        <p className="quote">“Discipline today, freedom tomorrow.”</p>
      </div>

      <div className="locked-bottom">
        {isNative && settings.pinEnabled && !pinned && (
          <p className="pin-tip">Allow screen pinning when Android asks, so Home and Recents stay locked.</p>
        )}
        <HoldButton label="Hold 5s for emergency exit" onDone={() => setConfirm(true)} />
      </div>

      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <div className="alert-ring">!</div>
          <h2>Exit Focus Session?</h2>
          <p>You’re currently in a locked session. Are you sure you want to exit?</p>
          <button className="btn primary" onClick={() => actions.finish('cancelled')}>
            Exit
          </button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </Modal>
      )}
    </div>
  );
}

function HoldButton({ label, onDone }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    setP(0);
  };
  const tick = () => {
    const v = (performance.now() - t0.current) / HOLD_MS;
    if (v >= 1) {
      setP(0);
      onDone();
      return;
    }
    setP(v);
    raf.current = requestAnimationFrame(tick);
  };
  const start = () => {
    t0.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      className="hold-btn"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="hold-fill" style={{ width: `${p * 100}%` }} />
      <span className="hold-label">{p > 0 ? `Keep holding… ${Math.ceil((1 - p) * 5)}s` : label}</span>
    </button>
  );
}
