import React, { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

const inputClass = (hasError) =>
  `w-full h-12 px-4 rounded-2xl border bg-white text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
    hasError ? 'border-rose-500 focus:ring-rose-200' : 'border-slate-300 focus:border-[#CC1A22] focus:ring-red-100'
  }`;

/**
 * One customer field, rendered by its type. Used on the salesman link page and in the admin editor.
 * props: field, value, onChange(value), error, required
 */
export default function CustomerFieldInput({ field, value, onChange, error, required }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const id = `cf-${field.key}`;
  const v = value ?? '';

  const useMyLocation = () => {
    setLocError('');
    if (!navigator.geolocation) {
      setLocError('This phone does not support location. Paste a Google Maps link instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        onChange(`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
      },
      () => {
        setLocating(false);
        setLocError('Location permission was refused or not available. Allow location, or paste a Google Maps link.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  let control;
  switch (field.type) {
    case 'dropdown':
      control = field.options?.length ? (
        <select id={id} value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input id={id} type="text" value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />
      );
      break;
    case 'textarea':
      control = (
        <textarea id={id} rows={3} value={v} onChange={(e) => onChange(e.target.value)}
          className={`${inputClass(error)} h-auto py-3`} />
      );
      break;
    case 'phone':
      control = (
        <input id={id} type="tel" inputMode="tel" autoComplete="off" placeholder={field.key === 'mobile' ? '9XXX XXXX' : ''}
          value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />
      );
      break;
    case 'email':
      control = <input id={id} type="email" inputMode="email" value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />;
      break;
    case 'number':
      control = <input id={id} type="text" inputMode="numeric" value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />;
      break;
    case 'date':
      control = <input id={id} type="date" value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />;
      break;
    case 'location':
      control = (
        <div className="space-y-2">
          <button type="button" onClick={useMyLocation} disabled={locating}
            className="w-full h-12 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60">
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {locating ? 'Getting location…' : 'Use my current location'}
          </button>
          <input id={id} type="url" placeholder="or paste a Google Maps link" value={v}
            onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />
          {v && /^https:\/\//.test(v) && (
            <a href={v} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#CC1A22] underline">Check on map</a>
          )}
          {locError && <p className="text-xs text-amber-700">{locError}</p>}
        </div>
      );
      break;
    default:
      control = (
        <input id={id} type="text" inputMode={field.key === 'cr_number' ? 'numeric' : undefined}
          autoCapitalize={field.key === 'vat_number' ? 'characters' : undefined}
          placeholder={field.key === 'vat_number' ? 'OM1100012345' : ''}
          value={v} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} />
      );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {field.label} {required && <span className="text-[#CC1A22]">*</span>}
      </label>
      {control}
      {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}
