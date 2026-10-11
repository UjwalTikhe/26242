import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../config';
import { useAuth, useLang, useOnline } from '../store/providers';

export function GovHeader() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const isOnline = useOnline();
  const navigate = useNavigate();
  const role = user?.role;

  return (
    <header className="admin-header">
      <div className="header-topbar">
        <span>GOV RPL PORTAL · NSQF</span>
        <span style={{ fontWeight: 'bold' }}>
          {isOnline ? '● ONLINE' : '○ OFFLINE (LOCAL)'}
        </span>
      </div>
      <div className="header-main">
        <Link to="/" className="header-brand">
          <div className="header-brand-badge">NSQF</div>
          <div>
            <h1 className="header-title">{APP_NAME}</h1>
            <p className="header-sub">SKILL ASSESSMENT SYSTEM</p>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="nav-btn"
            onClick={() => setLang(lang === 'en' ? 'hi' : lang === 'hi' ? 'mr' : 'en')}
            style={{ padding: '6px 10px', fontSize: '0.82rem', fontWeight: 700 }}
          >
            [{lang.toUpperCase()}]
          </button>
          {role ? (
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                logout();
                navigate('/');
              }}
              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
            >
              Sign Out
            </button>
          ) : (
            <Link to="/login" className="nav-btn active" style={{ padding: '6px 10px', fontSize: '0.82rem' }}>
              Sign In
            </Link>
          )}
        </div>
      </div>
      <nav className="header-nav-mobile" aria-label="Quick Navigation">
        <NavLink to="/" end className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
          Home
        </NavLink>
        {role === 'worker' && (
          <>
            <NavLink to="/worker" className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
              My Tests
            </NavLink>
            <NavLink to="/worker/new" className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
              New Test
            </NavLink>
          </>
        )}
        {(role === 'assessor' || role === 'authorized_assessor' || role === 'admin') && (
          <>
            <NavLink to="/assessor" className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
              Queue
            </NavLink>
            <NavLink to="/fairness" className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
              Audit
            </NavLink>
          </>
        )}
        <NavLink to="/verify" className={({ isActive }) => `nav-link-item${isActive ? ' active' : ''}`}>
          Verify
        </NavLink>
      </nav>
    </header>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const isOnline = useOnline();
  return (
    <>
      <GovHeader />
      {!isOnline && (
        <div className="sync-banner">
          <span>OFFLINE MODE: Responses recorded in IndexedDB. Will sync automatically upon reconnecting.</span>
        </div>
      )}
      <main className="page">{children}</main>
    </>
  );
}

export const AppShell = Shell;