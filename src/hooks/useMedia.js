import { useEffect, useState } from 'react';

/** True while the CSS media query matches; updates live when the device rotates or the window resizes. */
export function useMedia(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    fn();
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}
/** Phones (< 768 px). */
export const usePhone = () => useMedia('(max-width: 767px)');
/** Phones and upright tablets (< 1024 px): bottom bar, list-first layouts. */
export const useCompact = () => useMedia('(max-width: 1023px)');

/** Listen for the bottom bar's centred + (event 'mp:add'). Calls fn when it is for this tab. */
export function useAddButton(tab, fn) {
  useEffect(() => {
    const h = (e) => { if (e.detail?.tab === tab) { e.preventDefault(); fn(); } };
    window.addEventListener('mp:add', h);
    return () => window.removeEventListener('mp:add', h);
  }, [tab, fn]);
}
