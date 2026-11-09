import { useEffect, useState } from 'react';

export function useNow(on = true, ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

/**
 * A value that changes when the day rolls over.
 *
 * Effects that depend on it re-run at midnight, so something scheduled for
 * today is replaced by tomorrow's once the day changes.
 */
export function useTodayKey() {
  const [key, setKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const check = () => {
      const now = new Date().toDateString();
      setKey((prev) => (prev === now ? prev : now));
    };
    check();
    const t = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return key;
}
