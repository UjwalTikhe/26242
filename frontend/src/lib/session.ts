import type { User, WorkerProfile } from '@sih/contracts';
import { deviceId } from './uuid';

/** Persisted session (access + refresh tokens). Kept in localStorage for PWA restarts. */
const A = 'dakshsetu.access';
const R = 'dakshsetu.refresh';
const U = 'dakshsetu.user';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function loadSession(): Session | null {
  try {
    const a = localStorage.getItem(A);
    const r = localStorage.getItem(R);
    const u = localStorage.getItem(U);
    if (!a || !r || !u) return null;
    return { accessToken: a, refreshToken: r, user: JSON.parse(u) as User };
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(A, s.accessToken);
  localStorage.setItem(R, s.refreshToken);
  localStorage.setItem(U, JSON.stringify(s.user));
}

export function patchUser(user: User): void {
  localStorage.setItem(U, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(A);
  localStorage.removeItem(R);
  localStorage.removeItem(U);
}

export function accessToken(): string | null {
  return localStorage.getItem(A);
}

export function refreshToken(): string | null {
  return localStorage.getItem(R);
}

export function clientId(): string {
  return deviceId();
}