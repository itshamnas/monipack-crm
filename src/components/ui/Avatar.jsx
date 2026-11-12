import React, { useState } from 'react';
import { getApiUrl } from '../../api/config.js';
import { avatarStyle } from './BranchPicker.jsx';
import { photoOf, usePeopleVersion } from '../../utils/people.js';

const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/**
 * Profile photo, or coloured initials when there is no photo (or it fails to load).
 * Without a photoUrl it looks the person up by name, so a face shows everywhere once a photo is added.
 */
export default function Avatar({ name = '', photoUrl: given, size = 32, className = '', ring = false, title }) {
  usePeopleVersion();
  const photoUrl = given || photoOf(name);
  const [broken, setBroken] = useState(false);
  const [lastUrl, setLastUrl] = useState(photoUrl);
  if (lastUrl !== photoUrl) { setLastUrl(photoUrl); setBroken(false); }
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };
  const cls = `inline-grid place-items-center rounded-full shrink-0 overflow-hidden font-bold text-white select-none ${ring ? 'ring-2 ring-white' : ''} ${className}`;
  if (photoUrl && !broken) {
    return <img src={getApiUrl(photoUrl)} alt={title || name} title={title || name} width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className={`${cls} object-cover bg-slate-100`} style={style} />;
  }
  return <span className={cls} style={{ ...style, ...avatarStyle(name) }} title={title || name} aria-label={title || name} role="img">{initials(name)}</span>;
}
