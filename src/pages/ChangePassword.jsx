import React, { useState } from 'react';
import { Lock, AlertCircle, ShieldCheck, LogOut } from 'lucide-react';
import { getApiUrl } from '../api/config.js';

const MIN_LENGTH = 10;

/**
 * Shown when the user signs in with a temporary password set by an administrator.
 * Nothing else in the CRM works until a new password is saved (the server enforces this too).
 */
export default function ChangePassword({ token, user, onPasswordChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters long.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(getApiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change your password. Please try again.');
      onPasswordChanged(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full h-12 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all';

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-8 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-[#CC1A22]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Set your new password</h1>
            <p className="text-xs text-slate-500">
              Hello {user?.name || 'there'} – you signed in with a temporary password. Choose your own to continue.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cp-current" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Temporary / current password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input id="cp-current" type="password" required autoComplete="current-password"
                value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="cp-new" className="block text-xs font-semibold text-slate-700 mb-1.5">
              New password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input id="cp-new" type="password" required minLength={MIN_LENGTH} autoComplete="new-password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">At least {MIN_LENGTH} characters. Do not reuse a password from another site.</p>
          </div>
          <div>
            <label htmlFor="cp-confirm" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Repeat new password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input id="cp-confirm" type="password" required minLength={MIN_LENGTH} autoComplete="new-password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="w-full h-12 bg-[#CC1A22] hover:bg-[#A3141B] text-white text-sm font-bold rounded-xl transition active:scale-[0.98] disabled:opacity-50 cursor-pointer">
            {saving ? 'Saving…' : 'Save new password'}
          </button>
        </form>

        <button type="button" onClick={() => onLogout(false)}
          className="mt-4 w-full h-11 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition cursor-pointer">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
