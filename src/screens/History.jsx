import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, Tabs, CatIcon, Toast } from '../components/ui';
import { actions, useStore } from '../store';
import { fmtDateTime, fmtHM } from '../utils';

export default function History() {
  const { sessions } = useStore();
  const [cat, setCat] = useState('All');
  const [undo, setUndo] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const list = sessions.filter((s) => cat === 'All' || s.category === cat);

  const del = (s) => {
    actions.deleteSession(s.id);
    clearTimeout(undo?.timer);
    const timer = setTimeout(() => setUndo(null), 4000);
    setUndo({ s, timer });
  };
  const restore = () => {
    actions.restoreSession(undo.s);
    clearTimeout(undo.timer);
    setUndo(null);
  };

  return (
    <>
      <div className="header">
        <h1 className="left">History</h1>
      </div>
      <div className="scroll">
        <Tabs items={['All', 'Work', 'Study', 'Personal', 'Other']} value={cat} onChange={setCat} />
        <div style={{ height: 14 }} />
        {list.length === 0 && (
          <div className="empty">
            <b>Nothing here yet</b>
            <span>Your finished and cancelled sessions are listed here.</span>
          </div>
        )}
        {list.map((s) => (
          <div key={s.id} className="session-row">
            <CatIcon cat={s.category} size={42} />
            <div className="task-main">
              <b>{s.taskName}</b>
              <span>
                {s.category} • {fmtHM(s.actualMs)}
                {s.status === 'cancelled' && <em className="badge">Cancelled</em>}
              </span>
              <span className="dim">{fmtDateTime(s.startedAt)}</span>
            </div>
            <button className="icon-btn sm dim" onClick={() => del(s)} aria-label="Delete">
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {sessions.length > 0 && (
          <button className="btn danger" onClick={() => setConfirm(true)}>
            <Trash2 size={16} /> Clear All History
          </button>
        )}
        <div style={{ height: 130 }} />
      </div>
      {undo && <Toast text="Session deleted" action="Undo" onAction={restore} />}
      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <h2>Clear all history?</h2>
          <p>This deletes every recorded session. It can’t be undone.</p>
          <button
            className="btn primary"
            onClick={() => {
              actions.clearSessions();
              setConfirm(false);
            }}
          >
            Clear All
          </button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </Modal>
      )}
    </>
  );
}
