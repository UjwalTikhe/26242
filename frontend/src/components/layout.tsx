import React, { useState } from 'react';
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
        <span>GOVERNMENT OF INDIA · SKILL ASSESSMENT & CERTIFICATION (RPL)</span>
        <span>
          STATUS: {isOnline ? '[ONLINE]' : '[OFFLINE: WORKING LOCALLY]'}
        </span>
      </div>
      <div className="header-main">
        <Link to="/" className="header-brand">
          <div className="header-brand-badge">NSQF</div>
          <div>
            <h1 className="header-title">{APP_NAME}</h1>
            <p className="header-sub">RECOGNITION OF PRIOR LEARNING (RPL) ASSESSMENT SYSTEM</p>
          </div>
        </Link>
        <nav className="header-nav" aria-label="Main Navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            Home
          </NavLink>
          {role === 'worker' && (
            <>
              <NavLink to="/worker" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
                Candidate Portal
              </NavLink>
              <NavLink to="/worker/new" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
                New Assessment
              </NavLink>
            </>
          )}
          {(role === 'assessor' || role === 'authorized_assessor' || role === 'admin') && (
            <>
              <NavLink to="/assessor" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
                Review Queue
              </NavLink>
              <NavLink to="/fairness" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
                Analytics
              </NavLink>
            </>
          )}
          <NavLink to="/verify" className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}>
            Verify Certificate
          </NavLink>

          <button
            type="button"
            className="nav-btn"
            onClick={() => setLang(lang === 'en' ? 'hi' : lang === 'hi' ? 'mr' : 'en')}
            title="Switch Language"
          >
            Language: [{lang.toUpperCase()}]
          </button>

          {role ? (
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Sign Out ({user?.displayName ?? role})
            </button>
          ) : (
            <Link to="/login" className="nav-btn active">
              Sign In
            </Link>
          )}
        </nav>
      </div>
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
          <span>NOTICE: System is currently running in OFFLINE mode. Data is stored in device IndexedDB and will sync upon reconnection.</span>
        </div>
      )}
      <main className="page">{children}</main>
    </>
  );
}

export const AppShell = Shell;