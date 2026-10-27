import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Header } from '../components/ui';
import { actions } from '../store';
import { CATEGORIES, parseDuration } from '../utils';

export default function AddTask({ back }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('Work');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const save = () => {
    if (!name.trim()) return setErr('Give your task a name.');
    const mins = parseDuration(time);
    if (Number.isNaN(mins) || (mins !== null && (mins < 1 || mins > 720)))
      return setErr('Use a time like 90m, 1h30 or 2 hours (max 12h).');
    actions.addTask({ name, category: cat, targetMin: mins, notes });
    back();
  };

  return (
    <>
      <Header title="Add Task" onBack={back} />
      <div className="scroll form">
        <label>Task Name</label>
        <input className="input" placeholder="e.g. Belajar React" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />

        <label>Category</label>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <label>Time (optional)</label>
        <div className="input with-icon">
          <Clock size={18} />
          <input placeholder="e.g. 2 hours" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        <label>Notes (optional)</label>
        <textarea className="input" rows={4} placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />

        {err && <p className="error">{err}</p>}
        <div style={{ height: 90 }} />
      </div>
      <div className="bottom-action">
        <button className="btn primary" onClick={save}>
          Save Task
        </button>
      </div>
    </>
  );
}
