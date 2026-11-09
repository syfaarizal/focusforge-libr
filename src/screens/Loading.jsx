import { useEffect, useState } from 'react';
import focusforgeLogo from '../assets/focusforge-logo.png';
import librLogo from '../assets/libr-logo.png';

export default function Loading({ onDone }) {
  const [intro, setIntro] = useState(true);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const introTimer = setTimeout(() => setIntro(false), 600);
    const fadeTimer = setTimeout(() => setOut(true), 2600);
    const doneTimer = setTimeout(onDone, 3100);
    return () => {
      clearTimeout(introTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`loading ${out ? 'out' : ''}`}>
      <div className={`loading-intro ${intro ? 'visible' : ''}`}>
        <img src={librLogo} alt="LIBR" />
      </div>
      <div className={`loading-content ${intro ? '' : 'visible'}`}>
        <div className="loading-center">
          <img src={focusforgeLogo} alt="" className="loading-brand-mark" />
          <div className="loading-wordmark" aria-label="FocusForge"><span>Focus</span><b>Forge</b></div>
          <div className="loading-tag">Less scrolling. More progress.</div>
        </div>
        <div className="loading-bottom" aria-label="Loading">
          <svg width="38" height="38" viewBox="0 0 46 46" className="spin" aria-hidden="true">
            <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,48,69,.2)" strokeWidth="4" />
            <path d="M23 4 A19 19 0 0 1 42 23" fill="none" stroke="#ff3045" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
