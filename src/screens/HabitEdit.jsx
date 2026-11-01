import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Header, Modal, Switch } from '../components/ui';
import { actions, useStore } from '../store';
import { addDays, dateKey, habitsFor } from '../lib/habits';

const KINDS = [
  { value: 'timer', label: 'Timer' },
  { value: 'tap', label: 'Tap' },
  { value: 'focus', label: 'Focus' },
];

const blank = () => ({
  id: `h${Date.now().toString(36)}`,
  name: 'New habit',
  kind: 'tap',
  required: false,
  open: '08:00',
  close: '09:00',
  minMinutes: 30,
  excusable: false,
});

export default function HabitEdit({ back }) {
  const { habits } = useStore();
  const today = dateKey(Date.now());
  const tomorrow = addDays(today, 1);

  // Editing works on tomorrow's version: today is already locked in.
  const [draft, setDraft] = useState(() => {
    const upcoming = habitsFor(habits.habitVersions, tomorrow);
    const base = upcoming.length ? upcoming : habitsFor(habits.habitVersions, today);
    return base.map((h) => ({ ...h }));
  });
  const [confirm, setConfirm] = useState(false);

  const patch = (id, p) => setDraft((d) => d.map((h) => (h.id === id ? { ...h, ...p } : h)));

  const save = () => {
    actions.habitSaveVersions(draft);
    back();
  };

  return (
    <>
      <Header
        title="Edit Habits"
        onBack={back}
        right={
          <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Save habits">
            <Check size={19} />
          </button>
        }
      />

      <div className="scroll">
        <p className="section-note">
          Changes start tomorrow. Today stays as it is, so a habit you are about to miss cannot be edited away.
        </p>

        {draft.map((h) => (
          <div key={h.id} className="card habit-edit">
            <div className="habit-edit-head">
              <input
                className="input grow"
                value={h.name}
                maxLength={30}
                onChange={(e) => patch(h.id, { name: e.target.value })}
              />
              <button
                className="icon-btn sm dim"
                onClick={() => setDraft((d) => d.filter((x) => x.id !== h.id))}
                aria-label="Remove habit"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="chips-row">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  className={`chip ${h.kind === k.value ? 'active' : ''}`}
                  onClick={() => patch(h.id, { kind: k.value })}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <div className="date-row">
              <label>
                Opens
                <input
                  type="time"
                  className="input"
                  value={h.open}
                  onChange={(e) => patch(h.id, { open: e.target.value })}
                />
              </label>
              <label>
                Closes
                <input
                  type="time"
                  className="input"
                  value={h.close}
                  onChange={(e) => patch(h.id, { close: e.target.value })}
                />
              </label>
            </div>

            {h.kind !== 'tap' && (
              <div className="date-row">
                <label>
                  Minutes
                  <input
                    type="number"
                    min="5"
                    max="600"
                    step="5"
                    className="input"
                    value={h.minMinutes ?? 30}
                    onChange={(e) => patch(h.id, { minMinutes: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            )}

            <div className="set-row">
              <div className="grow">
                <b>Required</b>
                <span>Missing it breaks the streak</span>
              </div>
              <Switch on={h.required} onChange={(v) => patch(h.id, { required: v })} />
            </div>

            <div className="set-row">
              <div className="grow">
                <b>Excusable</b>
                <span>Can be skipped without breaking the streak</span>
              </div>
              <Switch on={h.excusable} onChange={(v) => patch(h.id, { excusable: v })} />
            </div>
          </div>
        ))}

        <button className="btn ghost" onClick={() => setDraft((d) => [...d, blank()])}>
          <Plus size={18} /> Add habit
        </button>

        <div style={{ height: 120 }} />
      </div>

      <div className="bottom-action">
        <button className="btn primary" onClick={() => setConfirm(true)}>
          Save for tomorrow
        </button>
      </div>

      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2>Save habits?</h2>
          <p>The new plan applies from tomorrow onwards. Today is unchanged.</p>
          <button className="btn primary" onClick={save}>
            Save
          </button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </Modal>
      )}
    </>
  );
}
