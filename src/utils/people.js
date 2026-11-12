/**
 * Everyone's photo in one place, so a face appears wherever a person's name appears.
 * Loaded after sign-in and again after any photo change; <Avatar> reads it by name when no photo is passed.
 */
import { useSyncExternalStore } from 'react';

let byName = new Map();
let version = 0;
const subs = new Set();
let fetcher = null;
let loading = null;

const key = (name) => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function photoOf(name) { return byName.get(key(name)) || null; }

export function setPeople(list) {
  const m = new Map();
  for (const p of list || []) {
    const k = key(p.name);
    if (k && p.photoUrl && !m.has(k)) m.set(k, p.photoUrl);
  }
  byName = m; version += 1;
  subs.forEach((fn) => fn());
}

/** Fetch the photo list (call once after sign-in; later calls refresh it). */
export function loadPeople(authFetch) {
  if (authFetch) fetcher = authFetch;
  if (!fetcher) return Promise.resolve();
  if (loading) return loading;
  loading = fetcher('/api/people/photos')
    .then((r) => (r.ok ? r.json() : []))
    .then(setPeople)
    .catch(() => {})
    .finally(() => { loading = null; });
  return loading;
}
export const refreshPeople = () => loadPeople();
export function clearPeople() { fetcher = null; setPeople([]); }

const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
/** Re-render when photos change. */
export function usePeopleVersion() { return useSyncExternalStore(subscribe, () => version, () => version); }
