import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp } from '../lib/client';
import { useAuth, useLang } from '../store/providers';
import { Alert } from '../components/ui';
import { DigiHeader } from '../components/layout';
import type { Lang } from '../i18n/strings';

export default function Login() {
  const { t, lang, setLang } = useLang();
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [requested, setRequested] = useState(false);
  const [debugCode, setDebugCode] = useState<string | undefined>();
  const [expiresIn, setExpiresIn] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (user?.role === 'worker') navigate('/worker');
    if (user && (user.role === 'assessor' || user.role === 'authorized_assessor' || user.role === 'admin')) {
      navigate('/assessor');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [remaining > 0]);

  const cleanPhone = phone.replace(/\D/g, '');
  const phoneOk = /^[0-9]{10,12}$/.test(cleanPhone);

  async function onRequest() {
    setError(null);
    if (!phoneOk) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    setBusy(true);
    try {
      const res = await requestOtp(cleanPhone);
      setRequested(true);
      setDebugCode(res.debugCode);
      setExpiresIn(res.expiresInSec);
      setRemaining(res.expiresInSec);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setError(null);
    if (code.trim().length < 4) {
      setError('Please enter the OTP code');
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOtp(cleanPhone, code.trim(), name.trim() || undefined, lang);
      login(res.tokens.accessToken, res.tokens.refreshToken, res.user);
      window.clearInterval(timer.current);
      navigate('/worker');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DigiHeader />
      <main className="digi-container">
        {/* DigiLocker Official Identity Banner */}
        <div className="digi-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="digi-pill digi-pill-green">Verified Auth</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>Digital India</span>
          </div>
          <h2>Sign In to Skill Locker</h2>
          <p>
            Authenticate with your mobile number to access your NSQF RPL skill declarations, assessments, and verifiable certificates.
          </p>
        </div>

        {/* Mobile Authentication Form Card */}
        <div className="digi-card">
          <div className="digi-card-header">
            <h3>Candidate Mobile Login</h3>
            <span className="digi-pill digi-pill-blue">OTP Verification</span>
          </div>

          <div className="digi-form-group">
            <label className="digi-label">Mobile Number (Aadhaar / Registered)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ padding: '11px 12px', background: '#e9ecef', border: '1px solid #ced4da', borderRadius: 6, fontWeight: 700, fontSize: '0.95rem' }}>
                +91
              </span>
              <input
                className="digi-input"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Enter 10-digit number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy || requested}
              />
            </div>
          </div>

          {!requested ? (
            <button
              type="button"
              className="digi-btn digi-btn-primary"
              onClick={onRequest}
              disabled={busy || !phoneOk}
            >
              {busy ? 'Requesting OTP...' : 'Send OTP via SMS'}
            </button>
          ) : (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: 10, borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>
                  OTP sent to +91 {cleanPhone}.
                </div>
                {debugCode && (
                  <div style={{ marginTop: 4, fontSize: '0.85rem' }}>
                    <strong>Demo Auto-OTP:</strong> <span style={{ fontFamily: 'monospace', fontSize: '1.05rem', color: '#1e3a8a' }}>{debugCode}</span>
                  </div>
                )}
                {remaining > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                    Expires in {remaining} seconds
                  </div>
                )}
              </div>

              <div className="digi-form-group">
                <label className="digi-label">Enter 6-Digit OTP</label>
                <input
                  className="digi-input"
                  style={{ letterSpacing: '0.25em', fontWeight: 700, fontSize: '1.1rem' }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="------"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  disabled={busy}
                />
              </div>

              <div className="digi-form-group">
                <label className="digi-label">Candidate Full Name (As on Certificate)</label>
                <input
                  className="digi-input"
                  placeholder="e.g. Ramesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="digi-form-group">
                <label className="digi-label">Preferred Assessment Language</label>
                <select
                  className="digi-input"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                >
                  <option value="en">English (Voice & Text)</option>
                  <option value="hi">हिन्दी (हिंदी आवाज़ और पाठ)</option>
                  <option value="mr">मराठी (मराठी आवाज आणि मजकूर)</option>
                </select>
              </div>

              <button
                type="button"
                className="digi-btn digi-btn-orange"
                onClick={onVerify}
                disabled={busy || code.length < 4}
              >
                {busy ? 'Authenticating...' : 'Verify OTP & Enter Locker'}
              </button>

              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#0b5cab', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  onClick={onRequest}
                  disabled={busy}
                >
                  Didn't receive code? Resend OTP
                </button>
              </div>
            </>
          )}

          {error && <div style={{ marginTop: 12 }}><Alert kind="err">{error}</Alert></div>}
        </div>

        {/* Assessor Gateway Card */}
        <div className="digi-card" style={{ background: '#ffffff', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#596a80' }}>
            Are you a certified ITI Assessor or Admin?
          </div>
          <div style={{ marginTop: 8 }}>
            <a
              href="/assessor/login"
              style={{ color: '#0b5cab', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none' }}
            >
              Login to Assessor Audit Portal →
            </a>
          </div>
        </div>
      </main>
    </>
  );
}