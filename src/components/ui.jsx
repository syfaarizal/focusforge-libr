import { useId } from 'react';
import {
  Briefcase,
  BookOpen,
  User,
  Shapes,
  ChevronLeft,
  House,
  ListChecks,
  History as HistoryIcon,
  CircleUser,
  Plus,
} from 'lucide-react';
import { CAT_COLOR } from '../utils';

const CAT_ICON = { Work: Briefcase, Study: BookOpen, Personal: User, Other: Shapes };

export function CatIcon({ cat, size = 40 }) {
  const Icon = CAT_ICON[cat] || Shapes;
  const c = CAT_COLOR[cat] || '#999';
  return (
    <span
      className="cat-icon"
      style={{
        width: size,
        height: size,
        color: c,
        background: `${c}22`,
        borderColor: `${c}55`,
      }}
    >
      <Icon size={size * 0.48} strokeWidth={2} />
    </span>
  );
}

export function Ring({ size = 170, stroke = 12, progress = 0, children }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff5468" />
            <stop offset="1" stopColor="#c8102e" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,48,69,.16)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: 'drop-shadow(0 0 6px rgba(255,48,69,.55))', transition: 'stroke-dashoffset .4s linear' }}
        />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function Switch({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs">
      {items.map((it) => {
        const v = typeof it === 'string' ? it : it.value;
        const label = typeof it === 'string' ? it : it.label;
        return (
          <button key={v} className={`tab ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Header({ title, onBack, right }) {
  return (
    <div className="header">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <span className="icon-btn ghost" />
      )}
      <h1>{title}</h1>
      <span className="header-right">{right}</span>
    </div>
  );
}

export function Modal({ children, onClose }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toast({ text, action, onAction }) {
  return (
    <div className="toast">
      <span>{text}</span>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}

export function BottomNav({ current, go, onAdd }) {
  const Item = ({ name, label, Icon }) => (
    <button className={`nav-item ${current === name ? 'active' : ''}`} onClick={() => go(name)}>
      <Icon size={22} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="bottom-nav">
      <Item name="home" label="Home" Icon={House} />
      <Item name="tracker" label="Tracker" Icon={ListChecks} />
      <button className="fab" onClick={onAdd} aria-label="Add task">
        <Plus size={26} strokeWidth={2.6} />
      </button>
      <Item name="history" label="History" Icon={HistoryIcon} />
      <Item name="settings" label="Profile" Icon={CircleUser} />
    </nav>
  );
}
