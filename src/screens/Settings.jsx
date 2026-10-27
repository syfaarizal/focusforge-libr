import { useState } from 'react';
import { ChevronRight, Bell, Lock, Pin, Target, Timer, Download, Info, Minus, Plus } from 'lucide-react';
import avatar from '../assets/avatar.png';
import { Modal, Switch } from '../components/ui';
import { actions, getState, useStore } from '../store';
import { ensureNotifPermission, exportFile } from '../native';
import { dateKey, fmtHM } from '../utils';

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

function Stepper({ value, onChange, min, max, step }) {
  return (
    <div className="mini-stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        <Minus size={14} />
      </button>
      <span>{fmtHM(value * 60000)}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { profile, settings, sessions } = useStore();
  const [editName, setEditName] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');

  const doExport = async (kind) => {
    setMsg('');
    const stamp = dateKey(Date.now());
    try {
      if (kind === 'json') {
        const { tasks, sessions: s, settings: st, profile: p } = getState();
        await exportFile(`focusforge-${stamp}.json`, JSON.stringify({ app: 'FocusForge', exportedAt: new Date().toISOString(), profile: p, settings: st, tasks, sessions: s }, null, 2), 'application/json');
      } else {
        const head = ['date', 'start', 'end', 'task', 'category', 'planned_min', 'actual_min', 'status'];
        const pad = (n) => String(n).padStart(2, '0');
        const t = (ts) => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`;
        const rows = sessions.map((s) =>
          [dateKey(s.startedAt), t(s.startedAt), t(s.endedAt), s.taskName, s.category, Math.round(s.plannedMs / 60000), Math.round(s.actualMs / 60000), s.status].map(csvCell).join(','),
        );
        await exportFile(`focusforge-history-${stamp}.csv`, [head.join(','), ...rows].join('\n'), 'text/csv');
      }
      setExporting(false);
    } catch {
      setMsg('Export failed. Try again.');
    }
  };

  const toggleNotif = async (v) => {
    if (v) await ensureNotifPermission();
    actions.updateSettings({ notifications: v });
  };

  return (
    <>
      <div className="header">
        <h1 className="left">Settings</h1>
      </div>
      <div className="scroll">
        <button className="card profile-row" onClick={() => setEditName(profile.name)}>
          <img src={avatar} alt="" className="avatar" />
          <div className="grow">
            <b>{profile.name}</b>
            <span>Personal Use</span>
          </div>
          <ChevronRight size={18} />
        </button>

        <div className="card group">
          <div className="set-row">
            <Bell size={20} />
            <div className="grow">
              <b>Notifications</b>
              <span>Alert when a session ends</span>
            </div>
            <Switch on={settings.notifications} onChange={toggleNotif} />
          </div>
          <div className="set-row">
            <Lock size={20} />
            <div className="grow">
              <b>Focus Lock</b>
              <span>Lock the screen during sessions</span>
            </div>
            <Switch on={settings.lockEnabled} onChange={(v) => actions.updateSettings({ lockEnabled: v })} />
          </div>
          <div className="set-row">
            <Pin size={20} />
            <div className="grow">
              <b>Screen pinning</b>
              <span>Block Home and Recents while locked</span>
            </div>
            <Switch on={settings.pinEnabled} onChange={(v) => actions.updateSettings({ pinEnabled: v })} />
          </div>
        </div>

        <div className="card group">
          <div className="set-row">
            <Target size={20} />
            <div className="grow">
              <b>Daily focus goal</b>
              <span>Fills the Tracker ring</span>
            </div>
            <Stepper value={settings.dailyGoalMin} min={30} max={720} step={30} onChange={(v) => actions.updateSettings({ dailyGoalMin: v })} />
          </div>
          <div className="set-row">
            <Timer size={20} />
            <div className="grow">
              <b>Default session</b>
              <span>Starting length for Work Time</span>
            </div>
            <Stepper value={settings.defaultDurationMin} min={5} max={480} step={5} onChange={(v) => actions.updateSettings({ defaultDurationMin: v })} />
          </div>
        </div>

        <div className="card group">
          <button className="set-row" onClick={() => setExporting(true)}>
            <Download size={20} />
            <div className="grow">
              <b>Data</b>
              <span>Export History</span>
            </div>
            <ChevronRight size={18} />
          </button>
          <div className="set-row">
            <Info size={20} />
            <div className="grow">
              <b>About</b>
              <span>LIBR — FocusForge · Version 1.0.0</span>
            </div>
          </div>
        </div>
        <div style={{ height: 130 }} />
      </div>

      {editName !== null && (
        <Modal onClose={() => setEditName(null)}>
          <h2>Your name</h2>
          <input className="input" value={editName} maxLength={30} onChange={(e) => setEditName(e.target.value)} autoFocus />
          <button
            className="btn primary"
            onClick={() => {
              actions.setName(editName);
              setEditName(null);
            }}
          >
            Save
          </button>
        </Modal>
      )}
      {exporting && (
        <Modal onClose={() => setExporting(false)}>
          <h2>Export data</h2>
          <p>JSON backs up everything. CSV is the session history only, for spreadsheets.</p>
          <button className="btn primary" onClick={() => doExport('json')}>
            Export JSON
          </button>
          <button className="btn ghost" onClick={() => doExport('csv')}>
            Export CSV
          </button>
          {msg && <p className="error">{msg}</p>}
        </Modal>
      )}
    </>
  );
}
