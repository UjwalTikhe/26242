import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User, WorkerProfile } from '@sih/contracts';
import { loadSession, saveSession, clearSession, patchUser } from '../lib/session';
import { logout as apiLogout } from '../lib/client';
import { getProfile } from '../lib/client';
import { outboxCount } from '../lib/sync';
import { translate, type Lang, type TKey } from '../i18n/strings';

/* ============================ Auth ============================ */
interface AuthCtx {
  user: User | null;
  profile: WorkerProfile | null;
  setProfile: (p: WorkerProfile) => void;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  refreshProfile: () => Promise<WorkerProfile | null>;
}
const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadSession()?.user ?? null);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);

  const login = useCallback((accessToken: string, refreshToken: string, u: User) => {
    saveSession({ accessToken, refreshToken, user: u });
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    void apiLogout().catch(() => undefined);
    clearSession();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await getProfile();
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    if (user?.role === 'worker') void refreshProfile().catch(() => undefined);
  }, [user?.role, user?.id, refreshProfile]);

  const value = useMemo<AuthCtx>(
    () => ({ user, profile, setProfile, login, logout, refreshProfile }),
    [user, profile, login, logout, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function useUserPatcher() {
  const { user } = useAuth();
  return useCallback(
    (u: User) => {
      patchUser(u);
      // bump stored user — the provider re-reads on next reload only; keep local sync
    },
    [user],
  );
}

/* ============================ Lang ============================ */
interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}
const LangContext = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('dakshsetu.lang') as Lang) || 'en');
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('dakshsetu.lang', l);
    setLangState(l);
    document.documentElement.lang = l;
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(key, lang, vars), [lang]);
  const value = useMemo<LangCtx>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang outside LangProvider');
  return ctx;
}

/* ============================ Toasts ============================ */
interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  message: string;
}
interface ToastCtx {
  toast: (message: string, kind?: Toast['kind']) => void;
}
const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    const t = window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
    void t;
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((tst) => (
          <div key={tst.id} className={`toast toast-${tst.kind}`}>{tst.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

/* ============================ Online ============================ */
interface OnlineCtx {
  online: boolean;
  syncPending: number;
}
const OnlineContext = createContext<OnlineCtx>({ online: true, syncPending: 0 });

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [syncPending, setSyncPending] = useState(0);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Pull outbox size on visibility changes (after a flush cycle)
  useEffect(() => {
    let inter = 0;
    const tick = async () => {
      try {
        setSyncPending(await outboxCount());
      } catch { /* noop */ }
    };
    void tick();
    inter = window.setInterval(() => void tick(), 15000);
    return () => window.clearInterval(inter);
  }, []);

  const value = useMemo(() => ({ online, syncPending }), [online, syncPending]);
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline(): OnlineCtx {
  return useContext(OnlineContext);
}