import { useState } from 'react';
import {
  BookOpen,
  Check,
  Clock,
  Coffee,
  Dumbbell,
  Flame,
  Moon,
  Pencil,
  SkipForward,
  X,
} from 'lucide-react';
import { Header, Toast } from '../components/ui';
import { actions, habitContext, useStore } from '../store';
import { useNow } from '../hooks';
import {
  addDays,
  atTime,
  computeStreak,
  dateKey,
  focusMinutesInWindow,
  habitStreak,
  habitStatus,
  habitsFor,
  resolveDay,
  REST_DAYS_PER_MONTH,
  timerDueAt,
} from '../lib/habits';

const KIND_ICON = { timer: Dumbbell, tap: Coffee, focus: BookOpen };

const STATE_META = {
  done: { label: 'Done', Icon: Check, cls: 'ok' },
  missed: { label: 'Missed', Icon: X, cls: 'bad' },
  excused: { label: 'Excused', Icon: SkipForward, cls: 'dim' },
  rest: { label: 'Rest', Icon: Moon, cls: 'dim' },
  upcoming: { label: 'Upcoming', Icon: Clock, cls: 'dim' },
  open: { label: 'Open', Icon: Clock, cls: 'live' },
};

function StatusChip({ status }) {
  const meta = STATE_META[status] ?? STATE_META.upcoming;
  const { Icon } = meta;
  return (
    <span className={`h-chip ${meta.cls}`}>
      <Icon size={12} strokeWidth={2.6} />
      {meta.label}
    </span>
  );
}

function HabitRow({ habit, dayKey, now, ctx, logs, onError, onFocus }) {
  const status = habitStatus(habit, dayKey, now, ctx);
  const Icon = KIND_ICON[habit.kind] ?? Dumbbell;
  const entry = logs[dayKey]?.[habit.id];
  const { open, close } = { open: atTime(dayKey, habit.open), close: atTime(dayKey, habit.close) };

  const focusMin =
    habit.kind === 'focus'
      ? focusMinutesInWindow(ctx.sessions ?? [], open, close, ctx.isCompleted)
      : 0;
  const focusNeeded = habit.minMinutes ?? 0;
  const focusPct = focusNeeded ? Math.min(1, focusMin / focusNeeded) : 0;

  // A running timer counts itself down and ticks off on its own.
  const dueAt = habit.kind === 'timer' ? timerDueAt(habit, logs, dayKey) : null;
  const leftMs = dueAt !== null ? Math.max(0, dueAt - now) : 0;
  const leftSec = Math.ceil(leftMs / 1000);
  const leftLabel = `${String(Math.floor(leftSec / 60)).padStart(2, '0')}:${String(leftSec % 60).padStart(2, '0')}`;

  const run = (fn) => {
    const r = fn();
    if (!r.ok) onError(r.reason);
  };

  return (
    <div className={`h-row ${status}`}>
      <span className={`h-icon ${status}`}>
        <Icon size={18} />
      </span>

      <div className="grow">
        <b>
          {habit.name}
          {!habit.required && <span className="h-opt">optional</span>}
        </b>
        <span>
          {habit.open}–{habit.close}
          {habit.minMinutes ? ` · ${habit.minMinutes}m` : ''}
        </span>

        {habit.kind === 'focus' && status !== 'done' && (
          <div className="h-progress">
            <div className="bar thin">
              <div style={{ width: `${focusPct * 100}%` }} />
            </div>
            <span className="h-progress-label">
              {Math.round(focusMin)}/{focusNeeded} min focused
            </span>
          </div>
        )}

        {habit.kind === 'timer' && dueAt !== null && status !== 'done' && (
          <span className="h-timer">
            {leftMs > 0 ? `${leftLabel} left` : 'Ticking off…'}
          </span>
        )}
      </div>

      <div className="h-actions">
        <StatusChip status={status} />

        {status === 'open' && habit.kind === 'tap' && (
          <button className="btn h-btn primary" onClick={() => run(() => actions.habitCheckInTap(habit))}>
            Check in
          </button>
        )}

        {status === 'open' && habit.kind === 'timer' && !entry?.startedAt && (
          <button className="btn h-btn primary" onClick={() => run(() => actions.habitStartTimer(habit))}>
            Start
          </button>
        )}

        {habit.kind === 'focus' && status !== 'done' && status !== 'missed' && (
          <button className="btn h-btn primary" onClick={() => onFocus(habit)}>
            Start focus
          </button>
        )}

        {habit.excusable && (status === 'open' || status === 'upcoming') && (
          <button className="link h-link" onClick={() => run(() => actions.habitSetExcused(habit, true))}>
            Excuse
          </button>
        )}
        {status === 'excused' && (
          <button className="link h-link" onClick={() => run(() => actions.habitSetExcused(habit, false))}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

export default function Habits({ back, push }) {
  const store = useStore();
  const now = useNow(true, 1000);
  const ctx = habitContext(store);
  const [msg, setMsg] = useState(null);

  const key = dateKey(now);
  const todayHabits = habitsFor(ctx.habitVersions, key);
  const streak = computeStreak(now, ctx);
  const dayState = resolveDay(key, now, ctx);
  const isRestToday = ctx.restDays.includes(key);

  const perHabit = todayHabits.map((h) => ({ id: h.id, ...habitStreak(h.id, now, ctx) }));

  const requiredHabits = todayHabits.filter((h) => h.required);
  const doneCount = requiredHabits.filter((h) => habitStatus(h, key, now, ctx) === 'done').length;
  const requiredCount = requiredHabits.length;

  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(key, -i));

  const toggleRest = (target) => {
    if (ctx.restDays.includes(target)) {
      actions.habitCancelRest(target);
      return;
    }
    const r = actions.habitScheduleRest(target);
    if (!r.ok) setMsg(r.reason);
  };

  const upcoming = [];
  for (let i = 1; i <= 14; i += 1) upcoming.push(addDays(key, i));

  const restUsedThisMonth = ctx.restDays.filter((k) => k.startsWith(key.slice(0, 7))).length;

  return (
    <>
      <Header
        title="Habits"
        onBack={back}
        right={
          <button className="icon-btn" onClick={() => push('habitEdit')} aria-label="Edit habits">
            <Pencil size={19} />
          </button>
        }
      />

      <div className="scroll">
        <div className={`streak-card ${streak.today}`}>
          <span className="streak-flame">
            <Flame size={22} />
          </span>
          <div className="grow">
            <b className="streak-num">{streak.current}</b>
            <span>day streak · best {streak.longest}</span>
          </div>
          <span className={`h-chip ${dayState === 'complete' ? 'ok' : dayState === 'broken' ? 'bad' : 'dim'}`}>
            {dayState === 'complete' ? 'Day complete' : dayState === 'broken' ? 'Streak broken' : 'In progress'}
          </span>
        </div>

        <h3 className="section">This week</h3>
        <div className="week-strip">
          {days.map((d) => {
            const before = d < ctx.startDate;
            const s = before ? 'none' : resolveDay(d, now, ctx);
            const day = new Date(atTime(d, '12:00'));
            return (
              <div key={d} className={`week-day ${s}`}>
                <span>{day.toLocaleDateString('en', { weekday: 'narrow' })}</span>
                <i />
              </div>
            );
          })}
        </div>

        <h3 className="section">
          Today
          {requiredCount > 0 && (
            <span className="count">
              {doneCount}/{requiredCount}
            </span>
          )}
        </h3>

        {isRestToday ? (
          <div className="empty">
            <Moon size={40} className="muted" />
            <b>Rest day</b>
            <span>Nothing is required today. The streak stays untouched.</span>
          </div>
        ) : todayHabits.length === 0 ? (
          <div className="empty">
            <b>No habits yet</b>
            <span>Add your first daily habit to start the streak.</span>
          </div>
        ) : (
          todayHabits.map((h) => (
            <HabitRow
              key={h.id}
              habit={h}
              dayKey={key}
              now={now}
              ctx={ctx}
              logs={ctx.logs}
              onError={setMsg}
              onFocus={(h) => push('work', { habit: h })}
            />
          ))
        )}

        {perHabit.length > 0 && (
          <>
            <h3 className="section">Streaks</h3>
            <div className="card group">
              {perHabit.map((p) => (
                <div key={p.id} className="set-row">
                  <Flame size={18} />
                  <div className="grow">
                    <b>{todayHabits.find((h) => h.id === p.id)?.name}</b>
                    <span>best {p.longest} days</span>
                  </div>
                  <b className="mono">{p.current}</b>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="section">Rest days</h3>
        <p className="section-note">
          Up to {REST_DAYS_PER_MONTH} per month, and only for days that have not started yet. This month:{' '}
          {restUsedThisMonth}/{REST_DAYS_PER_MONTH}.
        </p>
        <div className="rest-grid">
          {upcoming.map((d) => {
            const on = ctx.restDays.includes(d);
            const day = new Date(atTime(d, '12:00'));
            return (
              <button key={d} className={`rest-cell ${on ? 'on' : ''}`} onClick={() => toggleRest(d)}>
                <b>{day.getDate()}</b>
                <span>{day.toLocaleDateString('en', { weekday: 'narrow' })}</span>
              </button>
            );
          })}
        </div>

        <div style={{ height: 120 }} />
      </div>

      {msg && <Toast text={msg} action="OK" onAction={() => setMsg(null)} />}
    </>
  );
}
