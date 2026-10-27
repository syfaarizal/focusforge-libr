import { Check, Play, Trash2, Plus } from 'lucide-react';
import { Header, CatIcon } from '../components/ui';
import { actions, useStore } from '../store';
import { fmtHM, startOfDay } from '../utils';

export default function Tasks({ back, push }) {
  const { tasks, active } = useStore();
  const today = startOfDay(Date.now());
  const todo = tasks.filter((t) => !t.done);
  const doneToday = tasks.filter((t) => t.done && t.doneAt >= today);

  const Row = ({ t }) => (
    <div className={`task-row ${t.done ? 'done' : ''}`}>
      <button className={`check ${t.done ? 'on' : ''}`} onClick={() => actions.toggleTask(t.id)} aria-label="Toggle done">
        {t.done && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="task-main">
        <b>{t.name}</b>
        <span>
          {t.category}
          {t.targetMin ? ` • ${fmtHM(t.targetMin * 60000)}` : ''}
        </span>
      </div>
      {!t.done && !active && (
        <button className="icon-btn sm" onClick={() => push('work', { taskId: t.id })} aria-label="Start focus">
          <Play size={16} fill="currentColor" />
        </button>
      )}
      <button className="icon-btn sm dim" onClick={() => actions.deleteTask(t.id)} aria-label="Delete task">
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <>
      <Header title="Tasks" onBack={back} />
      <div className="scroll">
        {todo.length === 0 && doneToday.length === 0 && (
          <div className="empty">
            <CatIcon cat="Work" size={56} />
            <b>No tasks yet</b>
            <span>Add what you want to get done today, then start a focus session.</span>
          </div>
        )}
        {todo.length > 0 && <h3 className="section">To do</h3>}
        {todo.map((t) => (
          <Row key={t.id} t={t} />
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
