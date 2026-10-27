import { useEffect, useState } from 'react';
import logo from '../assets/libr-logo.png';

export default function Loading({ onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), 1500);
    const b = setTimeout(onDone, 1850);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onDone]);

  return (
    <div className={`loading ${out ? 'out' : ''}`}>
      <div className="loading-glow" />
      <div className="loading-center">
        <img src={logo} alt="LIBR" className="loading-logo" />
        <div className="loading-title">LIBR — FocusForge</div>
        <div className="loading-tag">Less scrolling. More progress.</div>
      </div>
      <div className="loading-bottom">
        <svg width="46" height="46" viewBox="0 0 46 46" className="spin">
          <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,48,69,.18)" strokeWidth="4" />
          <path d="M23 4 A19 19 0 0 1 42 23" fill="none" stroke="#ff3045" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span>Loading...</span>
      </div>
    </div>
  );
}
