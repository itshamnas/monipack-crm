import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sun, Moon } from 'lucide-react';
import { isSoundOn, toggleSound, onSoundChange, playClick } from '../../utils/soundService.js';
import { resolvedTheme, toggleTheme } from '../../utils/theme.js';

const btn = 'h-10 sm:h-9 flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-slate-100 rounded-full border border-slate-200 shadow-xs cursor-pointer';

/** Sound ON / Muted and Light / Dark switches for the header. Pure UI: no business state. */
export default function HeaderToggles({ compact = false, labels = false }) {
  const [sound, setSound] = useState(isSoundOn());
  const [theme, setTheme] = useState(resolvedTheme());

  useEffect(() => onSoundChange(setSound), []);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={sound}
        data-sound="off"
        title={sound ? 'Sound on – click to mute' : 'Muted – click to turn sound on'}
        onClick={() => { const on = toggleSound(); if (on) playClick(1000, 0.03); }}
        className={`${btn} ${compact ? 'w-10 sm:w-9' : 'px-3'} ${labels ? 'flex-1' : ''}`}
      >
        {sound ? <Volume2 key="on" className="w-3.5 h-3.5 sm:w-4 sm:h-4 mp-icon-in" /> : <VolumeX key="off" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 mp-icon-in" />}
        {!compact && <span className={`${labels ? 'inline' : 'hidden 2xl:inline'} mp-label text-[9.5px]`}>{sound ? 'Sound on' : 'Muted'}</span>}
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'dark'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={(e) => setTheme(toggleTheme(e))}
        className={`${btn} ${labels ? 'flex-1 px-3' : 'w-10 sm:w-9'}`}
      >
        {theme === 'dark' ? <Sun key="sun" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 mp-icon-in" /> : <Moon key="moon" className="w-3.5 h-3.5 sm:w-4 sm:h-4 mp-icon-in" />}
        {labels && <span className="mp-label text-[9.5px]">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
      </button>
    </>
  );
}
