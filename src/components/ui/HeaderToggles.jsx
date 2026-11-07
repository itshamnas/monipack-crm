import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sun, Moon } from 'lucide-react';
import { isSoundOn, toggleSound, onSoundChange, playClick } from '../../utils/soundService.js';
import { resolvedTheme, toggleTheme } from '../../utils/theme.js';

const btn = 'h-8 sm:h-9 flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-slate-100 rounded-full border border-slate-200 shadow-xs cursor-pointer';

/** Sound ON / Muted and Light / Dark switches for the header. Pure UI: no business state. */
export default function HeaderToggles({ compact = false }) {
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
        className={`${btn} ${compact ? 'w-8 sm:w-9' : 'px-2.5 sm:px-3'}`}
      >
        {sound ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />}
        {!compact && <span className="hidden lg:inline mp-label text-[9.5px]">{sound ? 'Sound on' : 'Muted'}</span>}
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'dark'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={(e) => setTheme(toggleTheme(e))}
        className={`${btn} w-8 sm:w-9`}
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </button>
    </>
  );
}
