import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOtp, verifyOtp } from '../lib/client';
import { useAuth, useLang } from '../store/providers';
import { Alert, Button, Card, Field } from '../components/ui';
import { AppShell } from '../components/layout';
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
    if (!phoneOk) { setError(t('phoneInvalid')); return; }
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
    if (code.trim().length < 4) { setError(t('otpInvalid')); return; }
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
    <AppShell>
      <div style={{ maxWidth: 480, margin: '20px auto' }}>
        <Card title={t('workerPortal')}>
          <p className="muted small">{t('getOtp')} · {t('govt')}</p>

          <Field label={t('phone')} hint={t('phonePh')} optional>
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </Field>

          {!requested ? (
            <Button variant="primary" onClick={onRequest} disabled={busy || !phoneOk} style={{ width: '100%' }}>
              {busy ? '…' : t('getOtp')}
            </Button>
          ) : (
            <>
              <Alert kind="info">
                {t('otpSent', { d: expiresIn })}
                {debugCode && (
                  <div style={{ marginTop: 6 }}>
                    <b className="mono">Demo OTP: {debugCode}</b>
                  </div>
                )}
                {remaining > 0 && <div className="small" style={{ marginTop: 4 }}>{t('otpExpiry', { s: remaining })}</div>}
              </Alert>

              <Field label={t('otp')} optional>
                <input
                  className="input mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('otpPh')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  disabled={busy}
                />
              </Field>

              <Field label={t('displayName')} hint={t('displayNamePh')} optional>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </Field>

              <Field label={t('language')} optional>
                <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                  <option value="mr">मराठी</option>
                </select>
              </Field>

              <Button variant="saffron" onClick={onVerify} disabled={busy || code.length < 4} style={{ width: '100%' }}>
                {busy ? '…' : t('verifyOtp')}
              </Button>
              <div style={{ marginTop: 8 }}>
                <Button variant="ghost" className="btn-sm" onClick={onRequest} disabled={busy}>{t('resend')}</Button>
              </div>
            </>
          )}

          {error && <Alert kind="err">{error}</Alert>}
        </Card>

        <p className="center small muted" style={{ marginTop: 14 }}>
          {t('assessorPortal')}? <a href="/assessor/login">{t('login')}</a>
        </p>
      </div>
    </AppShell>
  );
}