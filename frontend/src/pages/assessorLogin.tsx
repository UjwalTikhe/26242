import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAssessor, registerAssessor } from '../lib/client';
import { useAuth, useLang } from '../store/providers';
import { Alert, Button, Card, Field } from '../components/ui';
import { AppShell } from '../components/layout';

export default function AssessorLogin() {
  const { t } = useLang();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'assessor' | 'authorized_assessor'>('assessor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'assessor' || user?.role === 'authorized_assessor' || user?.role === 'admin') navigate('/assessor');
  }, [user, navigate]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await loginAssessor(email.trim(), password)
          : await registerAssessor(email.trim(), password, name.trim(), role);
      login(res.tokens.accessToken, res.tokens.refreshToken, res.user);
      navigate('/assessor');
    } catch (e) {
      setError(mode === 'login' ? t('badLogin') : (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 480, margin: '20px auto' }}>
        <Card title={t('assessorPortal')}>
          <div className="digi-toolbar" style={{ marginBottom: 14 }}>
            <Button variant={mode === 'login' ? 'primary' : 'ghost'} className="digi-btn-sm digi-btn-inline" onClick={() => setMode('login')}>{t('loginBtn')}</Button>
            <Button variant={mode === 'register' ? 'primary' : 'ghost'} className="digi-btn-sm digi-btn-inline" onClick={() => setMode('register')}>{t('register')}</Button>
          </div>

          <Field label={t('email')}>
            <input className="digi-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('password')}>
            <input className="digi-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          {mode === 'register' && (
            <>
              <Field label={t('displayName')}>
                <input className="digi-input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Role">
                <select className="digi-select" value={role} onChange={(e) => setRole(e.target.value as 'assessor' | 'authorized_assessor')}>
                  <option value="assessor">Assessor</option>
                  <option value="authorized_assessor">Authorized assessor (can issue certificate)</option>
                </select>
              </Field>
            </>
          )}

          <Button variant="primary" onClick={submit} disabled={busy || !email || !password} style={{ width: '100%' }}>
            {busy ? '...' : mode === 'login' ? t('loginBtn') : t('registerBtn')}
          </Button>

          {error && <Alert kind="err">{error}</Alert>}
        </Card>
        <p className="text-center text-sm text-muted" style={{ marginTop: 14 }}>
          {t('workerPortal')}? <a href="/login">{t('login')}</a>
        </p>
      </div>
    </AppShell>
  );
}