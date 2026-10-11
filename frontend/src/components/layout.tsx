import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../config';
import { useAuth, useLang, useOnline } from '../store/providers';

export function DigiHeader() {
  const { user, logout } = useAuth();
  const { lang, setLang } = useLang();
  const isOnline = useOnline();
  const navigate = useNavigate();

  return (
    <header className="digi-header">
      <div className="digi-topbar">
        <span>GOVERNMENT OF INDIA | NSQF RPL PORTAL</span>
        <span>
          <span className={`live-dot ${!isOnline ? 'offline' : ''}`} />
          {isOnline ? 'ONLINE' : 'OFFLINE (LOCAL)'}
        </span>
      </div>
      <div className="digi-navbar">
        <Link to="/" className="digi-logo-area">
          <img
            src="/DakshSetu.png"
            alt="National Skill Logo"
            width={40}
            height={40}
            style={{ objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <h1 className="digi-title">{APP_NAME}</h1>
            <p className="digi-subtitle">NSQF RPL Skill Credential</p>
          </div>
        </Link>
        <div className="digi-nav-actions">
          <button
            type="button"
            className="digi-btn-lang"
            onClick={() => setLang(lang === 'en' ? 'hi' : lang === 'hi' ? 'mr' : 'en')}
            title="Switch Language"
          >
            {lang.toUpperCase()}
          </button>
          {user && (
            <button
              type="button"
              className="digi-btn-signout"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
      {!isOnline && (
        <div className="digi-offline-strip">
          System is in Offline Mode. Assessment data is securely preserved on your device.
        </div>
      )}
    </header>
  );
}

export function DigiBottomNav() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <nav className="digi-bottom-nav" aria-label="Bottom Navigation">
      <NavLink to="/worker" end className={({ isActive }) => `digi-bottom-tab${isActive ? ' active' : ''}`}>
        <span className="tab-icon">[ ]</span>
        <span>My Skills</span>
      </NavLink>
      <NavLink to="/worker/new" className={({ isActive }) => `digi-bottom-tab${isActive ? ' active' : ''}`}>
        <span className="tab-icon">+</span>
        <span>Apply</span>
      </NavLink>
      <NavLink to="/verify" className={({ isActive }) => `digi-bottom-tab${isActive ? ' active' : ''}`}>
        <span className="tab-icon">Q</span>
        <span>Verify</span>
      </NavLink>
      <NavLink to="/worker/profile" className={({ isActive }) => `digi-bottom-tab${isActive ? ' active' : ''}`}>
        <span className="tab-icon">A</span>
        <span>Profile</span>
      </NavLink>
      {(role === 'assessor' || role === 'authorized_assessor' || role === 'admin') && (
        <NavLink to="/assessor" className={({ isActive }) => `digi-bottom-tab${isActive ? ' active' : ''}`}>
          <span className="tab-icon">R</span>
          <span>Assessor</span>
        </NavLink>
      )}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <>
      <DigiHeader />
      <main className="digi-container">{children}</main>
      {user && <DigiBottomNav />}
    </>
  );
}

export const AppShell = Shell;
export const GovHeader = DigiHeader;