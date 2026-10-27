import { useState } from 'react';
import { Clock, Pause, Play, Minus, Plus, Check, Lock } from 'lucide-react';
import { Header, Ring, Switch, Modal } from '../components/ui';
import { actions, remainingMs, setResult, useStore } from '../store';
import { useNow } from '../hooks';
import { fmtClock, fmtHM } from '../utils';

export default function WorkTime({ back, push, params }) {
  const { tasks, settings, active } = useStore();
  if (active) return <ActiveView back={back} />;
  return <Setup back={back} push={push} params={params} tasks={tasks} settings={settings} />;
}

function Setup({ back, push, params, tasks, settings }) {
  const pending = tasks.filter((t) => !t.done);
  const initial = pending.find((t) => t.id === params?.taskId) || pending[0];
  const [taskId, setTaskId] = useState(initial?.id || null);
  const [mins, setMins] = useState(initial?.targetMin || settings.defaultDurationMin);

  const pick = (t) => {
    setTaskId(t.id);
    if (t.targetMin) setMins(t.targetMin);
  };
  const step = (d) => setMins((m) => Math.min(480, Math.max(5, m + d)));

  const start = () =>
    actions.startSession({ taskId, durationMin: mins, locked: settings.lockEnabled });

  return (
    <>
      <Header title="Work Time" onBack={back} />
      <div className="scroll">
        <div className="center">
          <Ring size={190} stroke={12} progress={1}>
            <Clock size={22} className="red" />
            <div className="ring-time sm">{fmtClock(mins * 60000)}</div>
            <small>duration</small>
          </Ring>
        </div>

        <div className="stepper-row">
          <button className="icon-btn round" onClick={() => step(-5)} aria-label="Minus 5 minutes">
            <Minus size={18} />
          </button>
          <span>{fmtHM(mins * 60000)}</span>
          <button className="icon-btn round" onClick={() => step(5)} aria-label="Plus 5 minutes">
            <Plus size={18} />
          </button>
        </div>
        <div className="chips-row">
          {[25, 45, 60, 90, 120].map((m) => (
            <button key={m} className={`chip ${mins === m ? 'active' : ''}`} onClick={() => setMins(m)}>
              {m}m
            </button>
          ))}
        </div>

        <h3 className="section">Task</h3>
        {pending.length === 0 ? (
          <div className="card center-col">
            <span className="muted">You need a task before you can start.</span>
            <button className="btn ghost" onClick={() => push('addTask')}>
              Add Task
            </button>
          </div>
        ) : (
          <>
            {pending.map((t) => (
              <button key={t.id} className={`pick ${taskId === t.id ? 'active' : ''}`} onClick={() => pick(t)}>
                <span className="radio">{taskId === t.id && <Check size={13} strokeWidth={3} />}</span>
                <span className="task-main">
                  <b>{t.name}</b>
                  <span>
                    {t.category}
                    {t.targetMin ? ` • ${fmtHM(t.targetMin * 60000)}` : ''}
                  </span>
                </span>
              </button>
            ))}
            <button className="link" onClick={() => push('addTask')}>
              + New task
            </button>
          </>
        )}

        <div className="card row-card">
          <Lock size={20} className="red" />
          <div className="grow">
            <b>Focus Lock</b>
            <span>Lock the screen until the timer ends</span>
          </div>
          <Switch on={settings.lockEnabled} onChange={(v) => actions.updateSettings({ lockEnabled: v })} />
        </div>
        <div style={{ height: 96 }} />
      </div>
      <div className="bottom-action">
        <button className="btn primary" disabled={!taskId} onClick={start}>
          <Play size={18} fill="currentColor" /> Start Focus
        </button>
      </div>
    </>
  );
}

function ActiveView({ back }) {
  const { active } = useStore();
  const now = useNow(true, 250);
  const [confirm, setConfirm] = useState(false);
  const left = remainingMs(active, now);
  const paused = !!active.pausedAt;

  const finishEarly = () => setResult(actions.finish('completed'));
  const cancel = () => {
    actions.finish('cancelled');
    setConfirm(false);
    back();
  };

  return (
    <>
      <Header title="Work Time" onBack={back} />
      <div className="scroll">
        <div className="center">
          <Ring size={220} stroke={13} progress={left / active.plannedMs}>
            <Clock size={24} className="red" />
            <div className="ring-time">{fmtClock(left)}</div>
            <small>{paused ? 'paused' : 'remaining'}</small>
          </Ring>
        </div>
        <div className="card task-now">
          <Check size={18} className="red" />
          <div>
            <small>Current Task</small>
            <b>{active.taskName}</b>
            {active.notes && <span>{active.notes}</span>}
          </div>
        </div>
        <div style={{ height: 130 }} />
      </div>
      <div className="bottom-action col">
        <button className="btn primary" onClick={paused ? actions.resume : actions.pause}>
          {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <div className="two">
          <button className="btn ghost" onClick={finishEarly}>
            Finish
          </button>
          <button className="btn ghost dim" onClick={() => setConfirm(true)}>
            Cancel session
          </button>
        </div>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2>Cancel this session?</h2>
          <p>It will be saved in History as cancelled.</p>
          <button className="btn primary" onClick={cancel}>
            Cancel session
          </button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>
            Keep going
          </button>
        </Modal>
      )}
    </>
  );
}
