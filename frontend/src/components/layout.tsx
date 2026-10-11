import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APP_NAME, APP_NAME_HI } from '../config';
import { useAuth, useLang, useOnline } from '../store/providers';

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      className="nav-link"
      style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
      aria-label="Toggle language"
      title="हिन्दी / English"
    >
      {lang === 'en' ? 'हिन्दी' : 'EN'}
    </button>
  );
}

export function GovHeader() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const role = user?.role;

  const links: Array<{ to: string; label: string; show: boolean }> = [
    { to: '/', label: t('home'), show: !role },
    { to: '/worker', label: t('dashboard'), show: role === 'worker' },
    { to: '/worker/new', label: t('apply'), show: role === 'worker' },
    { to: '/assessor', label: t('queue'), show: role === 'assessor' || role === 'authorized_assessor' },
    { to: '/fairness', label: t('admin'), show: role === 'assessor' || role === 'authorized_assessor' || role === 'admin' },
  ];

  return (
    <header className="navbar">
      <div className="tricolor-bar" aria-hidden />
      <div className="nav-inner">
        <Link to="/" className="brand">
          <img src="/DakshSetu.png" alt="" width={40} height={40} style={{ borderRadius: 4 }} />
          <span>
            <span className="brand-name">{APP_NAME}</span>
            <span className="brand-sub" style={{ display: 'block' }}>{t('govt')}</span>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {links.filter((l) => l.show).map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
          <LangToggle />
          {role && (
            <span className="nav-user">
              <span className="nav-chip">{user?.displayName ?? role}</span>
              <button
                className="nav-link"
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { logout(); navigate('/'); }}
              >
                {t('logout')}
              </button>
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}

export function OfflineBanner() {
  const { online, syncPending } = useOnline();
  const { t } = useLang();
  if (!online) {
    return (
      <div className="offline-banner" role="status">
        <span className="dot" aria-hidden />
        <span>{t('offline')}</span>
      </div>
    );
  }
  if (syncPending > 0) {
    return (
      <div className="offline-banner" role="status">
        <span className="dot" aria-hidden />
        <span>{t('syncPending', { n: syncPending })}</span>
      </div>
    );
  }
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GovHeader />
      <OfflineBanner />
      <main className="page">
        <div className="container">{children}</div>
      </main>
    </>
  );
}