import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Header, Tabs } from '../components/ui';
import { useStore } from '../store';
import { CATEGORIES, CAT_COLOR, addDays, dateKey, fmtHM, startOfDay, sumMs } from '../utils';

const DAY = 86400000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Delta({ cur, prev, unit = '%' }) {
  if (prev === 0 || prev == null) return <span className="delta muted">no data last period</span>;
  const d = unit === '%' ? Math.round(((cur - prev) / prev) * 100) : Math.round(cur - prev);
  const up = d >= 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      {up ? <ArrowUp size={13} /> : <ArrowDown size={13} />} {Math.abs(d)}
      {unit === '%' ? '%' : ' pts'} vs last period
    </span>
  );
}

export default function Stats({ back }) {
  const { sessions } = useStore();
  const [tab, setTab] = useState('7');
  const todayStart = startOfDay(Date.now());
  const [from, setFrom] = useState(dateKey(addDays(todayStart, -13)));
  const [to, setTo] = useState(dateKey(todayStart));

  let start;
  let end; // exclusive
  if (tab === 'custom') {
    start = startOfDay(new Date(`${from}T00:00:00`).getTime());
    end = startOfDay(new Date(`${to}T00:00:00`).getTime()) + DAY;
    if (!(end > start)) end = start + DAY;
  } else {
    const n = Number(tab);
    start = addDays(todayStart, -(n - 1));
    end = todayStart + DAY;
  }
  const nDays = Math.max(1, Math.round((end - start) / DAY));
  const inRange = (s, a, b) => s.startedAt >= a && s.startedAt < b;
  const cur = sessions.filter((s) => inRange(s, start, end));
  const prev = sessions.filter((s) => inRange(s, start - nDays * DAY, start));

  const perDay = Array.from({ length: Math.min(nDays, 90) }, (_, i) => {
    const d0 = addDays(start, i);
    return { d0, ms: sumMs(cur.filter((s) => inRange(s, d0, d0 + DAY))) };
  });
  const max = Math.max(1, ...perDay.map((d) => d.ms));
  const total = sumMs(cur);
  const rate = (l) => (l.length ? (l.filter((s) => s.status === 'completed').length / l.length) * 100 : 0);
  const doneCount = cur.filter((s) => s.status === 'completed').length;
  const byCat = CATEGORIES.map((c) => ({ c, ms: sumMs(cur.filter((s) => s.category === c)) }));
  const labelEvery = nDays <= 7 ? 1 : Math.ceil(nDays / 6);

  return (
    <>
      <Header title="Stats" onBack={back} />
      <div className="scroll">
        <Tabs
          items={[
            { value: '7', label: '7 Days' },
            { value: '30', label: '30 Days' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'custom' && (
          <div className="date-row">
            <input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input" value={to} min={from} max={dateKey(todayStart)} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}

        <div className="card stat-card">
          <small>Focus Time</small>
          <div className="big">{fmtHM(total, true)}</div>
          <Delta cur={total} prev={sumMs(prev)} />
          <div className="chart">
            {perDay.map((d, i) => (
              <div key={d.d0} className="col">
                <div className="bar-v" style={{ height: `${Math.max(d.ms ? 4 : 0, (d.ms / max) * 100)}%` }} />
                <span>{i % labelEvery === 0 ? (nDays <= 7 ? WD[new Date(d.d0).getDay()] : new Date(d.d0).getDate()) : ''}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card stat-card">
          <small>Task Completion</small>
          <div className="big">
            {doneCount}
            <span>/{cur.length}</span>
          </div>
          <Delta cur={rate(cur)} prev={prev.length ? rate(prev) : null} unit="pts" />
          <div className="bar" style={{ marginTop: 10 }}>
            <div style={{ width: `${cur.length ? (doneCount / cur.length) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="cat-stats">
          {byCat.map(({ c, ms }) => (
            <div key={c} className="card cat-stat">
              <i style={{ background: CAT_COLOR[c] }} />
              <div>
                <small>{c}</small>
                <b>{fmtHM(ms, true)}</b>
              </div>
              <em>{total ? Math.round((ms / total) * 100) : 0}%</em>
            </div>
          ))}
        </div>
        <div style={{ height: 40 }} />
      </div>
    </>
  );
}
