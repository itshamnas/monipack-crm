import React, { useMemo, useState } from 'react';
import { Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight, Zap } from 'lucide-react';
import { getApiUrl } from '../api/config.js';

/**
 * monipack CRM – Sign in
 * Morooj Nizwa International Co. LLC
 *
 * Left: animated brand panel (red light ribbons, Morooj Nizwa shield, floating Monipack banner,
 * word-by-word headline, group brands marquee). Right: sign-in form.
 * Phones and portrait tablets: the brand panel becomes a short banner above the form.
 * Sign-in logic is unchanged.
 */
const HEADLINE = [
  { t: 'Packaging' }, { t: 'that' }, { t: 'moves' },
  { t: "Oman's businesses", hl: true }, { t: 'forward.' },
];
const FAMILY = [
  { src: '/brands/login/monipack.png', alt: 'monipack' },
  { src: '/brands/login/moniclean.png', alt: 'moniclean' },
  { src: '/brands/login/monifood.png', alt: 'monifood' },
  { src: '/brands/login/kohe.png', alt: 'KOHE' },
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  // brands twice so the marquee loops without a gap
  const marquee = useMemo(() => [...FAMILY, ...FAMILY], []);
  const year = new Date().getFullYear();

  return (
    <div className="mp-login">
      <div className="stage">
        <main className="shell">
          {/* ======== Animated brand panel ======== */}
          <section className="brand" aria-label="Morooj Nizwa International">
            <svg className="ribbons" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff3b47" stopOpacity="0" /><stop offset=".45" stopColor="#e5252d" /><stop offset="1" stopColor="#7a0614" stopOpacity="0" /></linearGradient>
                <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff8a8a" stopOpacity="0" /><stop offset=".5" stopColor="#ff2d3a" /><stop offset="1" stopColor="#9e0a22" stopOpacity="0" /></linearGradient>
                <linearGradient id="g3" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#ffd1d1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
                <filter id="soft"><feGaussianBlur stdDeviation="14" /></filter>
                <filter id="blur"><feGaussianBlur stdDeviation="40" /></filter>
              </defs>
              <path className="r4" d="M-80 760 C 160 560, 360 820, 560 560 S 820 260, 900 120" />
              <path className="r1" d="M-60 120 C 180 260, 300 40, 520 220 S 760 520, 880 420" />
              <path className="r2" d="M-40 640 C 220 420, 420 700, 620 420 S 820 160, 900 60" />
              <path className="r3" d="M-20 300 C 200 420, 380 180, 560 360 S 780 700, 900 640" />
              <path className="r3" style={{ animationDelay: '.9s, 2.6s', opacity: 0.6 }} d="M-20 820 C 240 700, 380 900, 600 720 S 800 520, 900 560" />
            </svg>
            <div className="orb" aria-hidden="true" />

            <div className="company">
              <span className="mark"><img src="/brands/login/mn-shield.png" alt="Morooj Nizwa International shield" /></span>
              <span>
                <b>Morooj Nizwa International Co. LLC</b>
                <small lang="ar">مروج نزوى الدولية ش.م.م</small>
              </span>
            </div>

            <div className="hero">
              <div className="logo-wrap">
                <span className="halo" />
                <img className="logo" src="/brands/login/monipack.png" alt="monipack" />
              </div>
              <div>
                <h1>
                  {HEADLINE.map((w, i) => (
                    <React.Fragment key={w.t}>
                      <span className={`w${w.hl ? ' hl' : ''}`} style={{ animationDelay: `${0.9 + i * 0.08}s` }}>{w.t}</span>
                      {i < HEADLINE.length - 1 ? ' ' : ''}
                    </React.Fragment>
                  ))}
                </h1>
                <p className="lede">Every enquiry, customer and quotation in one place: built for the Monipack sales team across Oman.</p>
              </div>
              <div className="family">
                <p>The Morooj Nizwa family</p>
                <div className="marquee">
                  <div className="track">
                    {marquee.map((b, i) => (
                      <span className="chip" key={`${b.alt}-${i}`} aria-hidden={i >= FAMILY.length}>
                        <img src={b.src} alt={i < FAMILY.length ? b.alt : ''} />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <p className="copy">© {year} Morooj Nizwa International Co. LLC. All rights reserved.</p>
          </section>

          {/* ======== Sign in ======== */}
          <section className="panel" aria-label="Sign in">
            <div className="card">
              <span className="badge"><i /> Confidential Sales Portal</span>
              <h2>Sign in</h2>
              <p className="sub">Welcome back! Please sign in to continue.</p>
              <form onSubmit={handleSubmit} autoComplete="on" noValidate={false}>
                {error && (
                  <div className="err" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
                <div>
                  <label htmlFor="login-email">Email address</label>
                  <div className="field">
                    <Mail aria-hidden="true" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="username"
                      inputMode="email"
                      placeholder="you@monipack.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="login-password">Password</label>
                  <div className="field">
                    <Lock aria-hidden="true" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>
                <button className={`btn${loading ? ' busy' : ''}`} type="submit" disabled={loading} aria-busy={loading}>
                  <span className="lbl">Sign in to <span className="font-monipack" style={{ fontSize: 16 }}>monipack</span> CRM</span>
                  <ArrowRight className="arr w-4 h-4" aria-hidden="true" />
                  <span className="spin" aria-hidden="true" />
                </button>
              </form>
              <p className="secure"><Lock className="w-3 h-3" aria-hidden="true" /> Authorised personnel only · Encrypted connection</p>
            </div>

            <div className="sig">
              <a href="https://imshamnas.com" target="_blank" rel="noopener noreferrer" data-sound="off">
                <span className="bolt"><Zap aria-hidden="true" /></span>
                Developed by <span className="name"><span className="typed">imshamnas<span className="dot">.</span>com</span></span>
                <span className="caret" aria-hidden="true" />
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
