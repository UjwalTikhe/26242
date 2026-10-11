import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, APP_NAME_HI, SIH_HINT } from '../config';
import { useAuth, useLang } from '../store/providers';
import { Button, Card } from '../components/ui';
import { GovHeader } from '../components/layout';

export default function Landing() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cert, setCert] = useState('');

  const steps = [
    { n: 1, title: t('step1'), body: t('step1d') },
    { n: 2, title: t('step2'), body: t('step2d') },
    { n: 3, title: t('step3'), body: t('step3d') },
    { n: 4, title: t('step4'), body: t('step4d') },
  ];

  return (
    <>
      <GovHeader />
      <section className="hero">
        <div className="container">
          <div className="hero-kicker">{t('govt')}</div>
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroBody')}</p>
          <div className="hero-actions">
            {user?.role === 'worker' ? (
              <Link className="btn btn-saffron btn-lg" to="/worker">{t('dashboard')}</Link>
            ) : (
              <Link className="btn btn-saffron btn-lg" to="/login">{t('heroCtaWorker')}</Link>
            )}
            <Link className="btn btn-outline btn-lg" to={user?.role === 'assessor' || user?.role === 'authorized_assessor' ? '/assessor' : '/assessor/login'}>
              {t('heroCtaAssessor')}
            </Link>
          </div>
          <div className="hero-stats">
            <span><b>32</b> NSQF packs</span>
            <span><b>569</b> performance criteria</span>
            <span><b>3</b> languages</span>
            <span><b>Digital</b> verifiable certificate</span>
          </div>
        </div>
      </section>

      <main className="page">
        <div className="container">
          <div className="section-title"><h2>{t('stepsTitle')}</h2></div>
          <div className="grid grid-2">
            {steps.map((s) => (
              <Card key={s.n}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 4, background: 'var(--navy)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none',
                  }}>{s.n}</div>
                  <div>
                    <h3 style={{ marginBottom: 4 }}>{s.title}</h3>
                    <p className="muted" style={{ margin: 0 }}>{s.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="section-title"><h2>{t('rolesTitle')}</h2></div>
          <div className="grid grid-2">
            <Card>
              <h3>{t('rolesWorker')}</h3>
              <p className="muted">{t('rolesWorkerD')}</p>
              <Link className="btn btn-primary" to="/login">{t('login')}</Link>
            </Card>
            <Card>
              <h3>{t('rolesAssessor')}</h3>
              <p className="muted">{t('rolesAssessorD')}</p>
              <Link className="btn btn-outline" to="/assessor/login">{t('login')}</Link>
            </Card>
          </div>

          <div className="section-title"><h2>{t('verifyPromo')}</h2></div>
          <Card>
            <p className="muted">{t('verifyPromoD')}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 240 }}
                placeholder={t('verifyPlaceholder')}
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && cert.trim()) navigate(`/verify?no=${encodeURIComponent(cert.trim())}`); }}
              />
              <Button variant="saffron" onClick={() => cert.trim() && navigate(`/verify?no=${encodeURIComponent(cert.trim())}`)}>
                {t('verifyBtn')}
              </Button>
            </div>
          </Card>

          <p className="center muted small" style={{ marginTop: 24 }}>
            {APP_NAME} · {SIH_HINT}
            <span style={{ display: 'block', marginTop: 4 }}>
              <a href="/tos" className="muted">{t('tos') || 'Terms of Service'}</a> · <a href="/privacy" className="muted">{t('privacy') || 'Privacy Policy'}</a>
            </span>
          </p>
        </div>
      </main>
    </>
  );
}