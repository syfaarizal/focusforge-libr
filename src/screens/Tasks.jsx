import { Check, Play, Trash2, Plus, ArrowRight, CalendarClock } from 'lucide-react';
import { Header, CatIcon } from '../components/ui';
import { actions, useStore } from '../store';
import { fmtHM, relDay, startOfDay, todayKey } from '../utils';

export default function Tasks({ back, push }) {
  const { tasks, active } = useStore();
  const today = startOfDay(Date.now());
  const todayK = todayKey();

  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.scheduledFor && t.scheduledFor < todayK);
  const todo = open.filter((t) => !t.scheduledFor || t.scheduledFor === todayK);
  const upcoming = open.filter((t) => t.scheduledFor && t.scheduledFor > todayK);
  const doneToday = tasks.filter((t) => t.done && t.doneAt >= today);

  const Row = ({ t, overdueRow, future }) => (
    <div className={`task-row ${t.done ? 'done' : ''} ${overdueRow ? 'late' : ''}`}>
      <button className={`check ${t.done ? 'on' : ''}`} onClick={() => actions.toggleTask(t.id)} aria-label="Toggle done">
        {t.done && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="task-main">
        <b>{t.name}</b>
        <span>
          {t.category}
          {t.targetMin ? ` • ${fmtHM(t.targetMin * 60000)}` : ''}
          {t.scheduledFor ? ` • ${overdueRow ? 'due' : 'for'} ${relDay(t.scheduledFor)}` : ''}
        </span>
      </div>
      {overdueRow ? (
        <>
          <button className="icon-btn sm" onClick={() => actions.pullToToday(t.id)} aria-label="Move to today">
            <ArrowRight size={16} />
          </button>
          <button className="icon-btn sm dim" onClick={() => actions.deleteTask(t.id)} aria-label="Discard task">
            <Trash2 size={16} />
          </button>
        </>
      ) : (
        <>
          {!t.done && !active && !future && (
            <button className="icon-btn sm" onClick={() => push('work', { taskId: t.id })} aria-label="Start focus">
              <Play size={16} fill="currentColor" />
            </button>
          )}
          <button className="icon-btn sm dim" onClick={() => actions.deleteTask(t.id)} aria-label="Delete task">
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <Header title="Tasks" onBack={back} />
      <div className="scroll">
        {open.length === 0 && doneToday.length === 0 && (
          <div className="empty">
            <CatIcon cat="Work" size={56} />
            <b>No tasks yet</b>
            <span>Add what you want to get done today, then start a focus session.</span>
          </div>
        )}

        {overdue.length > 0 && (
          <>
            <h3 className="section overdue-head">
              <CalendarClock size={15} /> Overdue
              <span className="count">{overdue.length}</span>
            </h3>
            <p className="section-note">Carried over from earlier days. Move them to today or discard them.</p>
            {overdue.map((t) => (
              <Row key={t.id} t={t} overdueRow />
            ))}
          </>
        )}

        {todo.length > 0 && <h3 className="section">To do</h3>}
        {todo.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {upcoming.length > 0 && <h3 className="section">Upcoming</h3>}
        {upcoming.map((t) => (
          <Row key={t.id} t={t} future />
        ))}
        {doneToday.length > 0 && <h3 className="section">Done today</h3>}
        {doneToday.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        <div style={{ height: 90 }} />
      </div>
      <div className="bottom-action">
        <button className="btn primary" onClick={() => push('addTask')}>
          <Plus size={18} /> Add Task
        </button>
      </div>
    </>
  );
}
