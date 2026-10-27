export const CATEGORIES = ['Work', 'Study', 'Personal', 'Other'];
export const CAT_COLOR = {
  Work: '#ff3045',
  Study: '#7c8cff',
  Personal: '#34d399',
  Other: '#c084fc',
};

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const pad = (n) => String(n).padStart(2, '0');

export function fmtHM(ms, full = false) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (full) return `0h ${m}m`;
  return `${m}m`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export const dateKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const fmtDateTime = (ts) => {
  const d = new Date(ts);
  return `${dateKey(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export const addDays = (ts, n) => {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
export const startOfWeek = (ts) => {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
};
export const startOfMonth = (ts) => {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
};

export function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Good morning';
  if (h < 15) return 'Good afternoon';
  if (h < 19) return 'Good evening';
  return 'Good night';
}

/** "2 hours", "90m", "1h30", "1.5h", "2 jam", "90" -> minutes. null if empty/invalid. */
export function parseDuration(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours|jam)\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes|menit)?)?$/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minute|minutes|menit)?$/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
  return NaN;
}

export const sessionMs = (s) => s.actualMs || 0;
export const sumMs = (list) => list.reduce((a, s) => a + sessionMs(s), 0);
