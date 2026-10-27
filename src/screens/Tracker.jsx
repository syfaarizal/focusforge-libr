import { useState } from 'react';
import { ChartColumn, Play } from 'lucide-react';
import { Ring, Tabs, CatIcon } from '../components/ui';
import { useStore } from '../store';
import { addDays, fmtHM, fmtTime, startOfDay, startOfMonth, startOfWeek, sumMs, dateKey } from '../utils';

export default function Tracker({ push }) {
  const { sessions, settings } = useStore();
  const [tab, setTab] = useState('Today');
  const now = Date.now();
  const today = startOfDay(now);
  const from = tab === 'Today' ? today : tab === 'Week' ? startOfWeek(now) : startOfMonth(now);
  const list = sessions.filter((s) => s.startedAt >= from).sort((a, b) => b.startedAt - a.startedAt);
  const total = sumMs(list);
  const days = Math.round((addDays(today, 1) - from) / 86400000);
  const goal = settings.dailyGoalMin * 60000 * (tab === 'Today' ? 1 : days);

  return (
    <>
      <div className="header">
        <h1 className="left">Tracker</h1>
        <button className="icon-btn" onClick={() => push('stats')} aria-label="Stats">
          <ChartColumn size={20} />
        </button>
      </div>
      <div className="scroll">
        <Tabs items={['Today', 'Week', 'Month']} value={tab} onChange={setTab} />
        <div className="center" style={{ margin: '22px 0 18px' }}>
          <Ring size={190} stroke={13} progress={total / goal}>
            <div className="ring-time">{fmtHM(total, true)}</div>
            <small>Total Focus Time</small>
          </Ring>
        </div>
        {list.length === 0 && (
          <div className="empty">
            <b>No sessions yet</b>
            <span>Finish a focus session and it will show up here.</span>
          </div>
        )}
        {list.map((s) => (
          <div key={s.id} className="session-row">
            <CatIcon cat={s.category} size={38} />
            <div className="task-main">
              <b>{s.taskName}</b>
              <span>
                {s.category}
                {s.status === 'cancelled' ? ' • Cancelled' : ''}
              </span>
            </div>
            <div className="session-right">
              <b>{fmtHM(s.actualMs)}</b>
              <span>{tab === 'Today' ? `${fmtTime(s.startedAt)} - ${fmtTime(s.endedAt)}` : dateKey(s.startedAt)}</span>
            </div>
          </div>
        ))}
        <div style={{ height: 160 }} />
      </div>
      <div className="bottom-action above-nav">
        <button className="btn primary" onClick={() => push('work')}>
          <Play size={18} fill="currentColor" /> Start Focus
        </button>
      </div>
    </>
  );
}
