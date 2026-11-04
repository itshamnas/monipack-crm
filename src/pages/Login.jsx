import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { getApiUrl } from '../api/config.js';

/**
 * monipack CRM - Production-Grade White Glassmorphism Login Portal
 * Morooj Nizwa International LLC
 * 
 * Design System Specifications:
 * - Canvas Base: Ultra-clean light grey/slate (#F8FAFC)
 * - Light Leaks: Soft radial crimson & slate glows for visible refraction
 * - Brand Logo: Strictly unboxed, transparent 3D ribbon with unboxed radial warm aura
 * - Glassmorphic Card: rgba(255, 255, 255, 0.75), backdrop-blur-xl saturate-150,
 *   specular edge border-white/80, dual drop-shadow + inset highlight
 * - Inputs: Frosted h-12 (48px) fields, text-base (prevents iOS auto-zoom)
 * - Actions: Gradient CTA with specular top highlight, sub-glass quick-fill role tiles
 */
export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const loginUrl = getApiUrl('/api/auth/login');
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        if (text.includes('<!doctype') || text.includes('<html')) {
          throw new Error('Backend server is warming up or routing is misconfigured. Please check connection and try again.');
        }
        throw new Error('Invalid server response format.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-8 relative overflow-x-hidden overflow-y-auto select-none font-sans">
      
      {/* 1. Ambient Background Glows & Light Leaks for Glass Refraction */}
      <div 
        className="absolute -top-32 -left-32 w-96 sm:w-[32rem] h-96 sm:h-[32rem] rounded-full pointer-events-none"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.06)',
          filter: 'blur(80px)',
        }}
      />
      <div 
        className="absolute -bottom-32 -right-32 w-96 sm:w-[36rem] h-96 sm:h-[36rem] rounded-full pointer-events-none"
        style={{
          backgroundColor: 'rgba(148, 163, 184, 0.08)',
          filter: 'blur(90px)',
        }}
      />

      {/* 2. Glassmorphic Card Container */}
      <div 
        className="w-full max-w-[380px] sm:max-w-[420px] rounded-2xl sm:rounded-3xl p-6 sm:p-8 relative z-10 transition-all duration-300 my-auto"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.08), inset 0 0 1px 1px rgba(255, 255, 255, 0.9)',
        }}
      >
        
        {/* Brand Header */}
        <div className="text-center mb-7">
          
          {/* Strictly Unboxed Brand Logo (Device-Matched Scaling) + Radial Warm Aura */}
          <div className="relative flex justify-center items-center mb-5">
            <div 
              className="absolute w-36 sm:w-44 h-36 sm:h-44 rounded-full pointer-events-none"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                filter: 'blur(35px)',
              }}
            />
            <img
              src="/assets/logo.png"
              alt="monipack"
              className="w-28 sm:w-36 h-auto object-contain drop-shadow-[0_10px_20px_rgba(204,26,34,0.22)] select-none transition-transform duration-300 hover:scale-105 cursor-pointer"
              loading="eager"
              onError={(e) => {
                e.target.src = '/brands/monipack-cropped.png';
              }}
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight flex items-center justify-center gap-2">
            <span className="font-monipack lowercase text-2xl sm:text-3xl text-slate-900">monipack</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-red-50 text-[#CC1A22] border border-red-200/60 uppercase tracking-wider font-sans">CRM</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Morooj Nizwa International LLC
          </p>

          {/* Frosted Glass Trust Badge */}
          <div 
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-semibold text-emerald-700"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Confidential Sales Portal</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Authorized Email
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@monipack.com"
                className="w-full h-12 pl-11 pr-4 bg-white/60 focus:bg-white border border-slate-200/80 rounded-xl text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Secure Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-12 pl-11 pr-4 bg-white/60 focus:bg-white border border-slate-200/80 rounded-xl text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all shadow-xs"
              />
            </div>
          </div>

          {/* Primary CTA Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            style={{
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.25)',
            }}
          >
            <span>
              {loading ? 'Authenticating...' : (
                <>Sign In to <span className="font-monipack lowercase text-base">monipack</span> CRM</>
              )}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Enterprise Security Assurance */}
        <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 text-center select-none">
          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Authorized Personnel Only &bull; 256-Bit SSL Encrypted</span>
        </div>

      </div>

      {/* Developer Attribution - Option 3 Minimalist Luminous Signature */}
      <div className="mt-6 relative z-10 flex justify-center">
        <a 
          href="mailto:connect@imshamnas.com"
          title="Contact Developer: connect@imshamnas.com"
          className="group inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <span className="text-amber-500 group-hover:scale-110 transition-transform">⚡</span>
          <span>Developed by</span>
          <span className="font-bold text-slate-800 group-hover:text-red-600 underline underline-offset-4 decoration-slate-300 group-hover:decoration-red-500 transition-all font-mono">
            connect@imshamnas.com
          </span>
        </a>
      </div>

    </div>
  );
}
