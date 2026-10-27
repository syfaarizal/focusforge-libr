import { Settings as Gear, Flame, Clock, ListChecks, ChartColumn, History as HistoryIcon, Play, ChevronRight, Plus, Timer } from 'lucide-react';
import avatar from '../assets/avatar.png';
import { useStore, remainingMs } from '../store';
import { useNow } from '../hooks';
import { fmtClock, fmtHM, greeting, startOfDay, sumMs } from '../utils';

export default function Home({ push, go }) {
  const { profile, tasks, sessions, settings, active } = useStore();
  const now = useNow(!!active, 500);
  const today = startOfDay(now);
  const focusMs = sumMs(sessions.filter((s) => s.startedAt >= today));
  const todayTasks = tasks.filter((t) => !t.done || (t.doneAt && t.doneAt >= today));
  const done = todayTasks.filter((t) => t.done).length;
  const goalMs = settings.dailyGoalMin * 60000;

  return (
    <div className="scroll">
      <div className="home-head">
        <img src={avatar} alt="" className="avatar" />
        <div className="home-hello">
          <small>{greeting()},</small>
          <b>{profile.name.split(' ')[0]}</b>
          <i>“Small steps. Big results.”</i>
        </div>
        <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings">
          <Gear size={20} />
        </button>
      </div>

      <button className="focus-card" onClick={() => push('tasks')}>
        <Flame size={30} className="flame" />
        <div className="focus-card-text">
          <b>Today’s Focus</b>
          <span>
            {done}/{todayTasks.length} tasks completed
          </span>
          <div className="bar">
            <div style={{ width: `${todayTasks.length ? (done / todayTasks.length) * 100 : 0}%` }} />
          </div>
          <span className="sub">
            {fmtHM(focusMs, true)} of {fmtHM(goalMs)} focus goal
          </span>
          <div className="bar thin">
            <div style={{ width: `${Math.min(100, (focusMs / goalMs) * 100)}%` }} />
          </div>
        </div>
        <ChevronRight size={18} />
      </button>

      <div className="grid2">
        <button className="tile" onClick={() => push('work')}>
          <Clock size={28} className="red" />
          <b>Work Time</b>
          <span className="red small">
            {active ? `${fmtClock(remainingMs(active, now))} left` : `Start · ${settings.defaultDurationMin}m`}
          </span>
          <span className="tile-badge solid">
            <Play size={13} fill="currentColor" />
          </span>
        </button>
        <button className="tile" onClick={() => push('tasks')}>
          <ListChecks size={28} className="red" />
          <b>Tasks</b>
          <span className="small muted">{todayTasks.length} today</span>
          <span className="tile-badge">
            <ListChecks size={13} />
          </span>
        </button>
        <button className="tile" onClick={() => go('tracker')}>
          <ChartColumn size={28} className="red" />
          <b>Tracker</b>
          <span className="small muted">{fmtHM(focusMs, true)}</span>
        </button>
        <button className="tile" onClick={() => go('history')}>
          <HistoryIcon size={28} className="red" />
          <b>History</b>
          <span className="small muted">View all</span>
        </button>
      </div>

      <h3 className="section">Quick Actions</h3>
      <div className="quick">
        <button onClick={() => push('addTask')}>
          <span>
            <Plus size={22} />
          </span>
          Add Task
        </button>
        <button onClick={() => push('work')}>
          <span>
            <Timer size={22} />
          </span>
          Start Focus
        </button>
        <button onClick={() => go('history')}>
          <span>
            <HistoryIcon size={22} />
          </span>
          View History
        </button>
      </div>
    </div>
  );
}
