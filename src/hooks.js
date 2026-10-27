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
