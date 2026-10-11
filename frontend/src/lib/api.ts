import { API_BASE } from '../config';
import { accessToken, refreshToken, saveSession } from './session';
import { clientId } from './session';
import { nowIso } from './uuid';

export class ApiError extends Error {
  status: number;
  code?: string;
  data: unknown;
  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD';
  body?: unknown;
  /** Set by the offline outbox; never auto-refreshed twice. */
  raw?: boolean;
  /** Skip auth header (public routes still work without tokens). */
  anonymous?: boolean;
  timeoutMs?: number;
  /** Extra headers merged last (e.g. Idempotency-Key from the outbox). */
  headers?: Record<string, string>;
}

let refreshing: Promise<boolean> | null = null;

/** Token refresh dance: on 401, refresh once then replay the original request. */
async function refreshTokenFlow(): Promise<boolean> {
  const rt = refreshToken();
  if (!rt) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Client-Id': clientId(), 'X-Api-Version': '1' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { user: { id: string; role: string; displayName?: string }; tokens: { accessToken: string; refreshToken: string; expiresInSec: number } };
        saveSession({
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
          user: data.user as never,
        });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-Client-Id': clientId(),
    'X-Api-Version': '1',
    'Accept': 'application/json',
  };
  if (!opts.anonymous) {
    const at = accessToken();
    if (at) headers['Authorization'] = `Bearer ${at}`;
  }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.headers) Object.assign(headers, opts.headers);

  const doFetch = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch();
  if (res.status === 401 && !opts.anonymous && !opts.raw && (await refreshTokenFlow())) {
    const at = accessToken();
    if (at) headers['Authorization'] = `Bearer ${at}`;
    res = await doFetch();
  }

  if (!res.ok) {
    let message = `${method} ${path} failed (${res.status})`;
    let code: string | undefined;
    let data: unknown;
    try {
      const j = (await res.json()) as { message?: string; error?: string; code?: string };
      if (j.message) message = j.message;
      code = j.code ?? j.error;
      data = j;
    } catch {
      data = await res.text().catch(() => undefined);
    }
    throw new ApiError(res.status, message, code, data);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export interface IdempotentOpts {
  idempotencyKey: string;
  clientUpdatedAt: string;
}

export function withIdempotency(opts: IdempotentOpts): Record<string, string> {
  return {
    'Idempotency-Key': opts.idempotencyKey,
    'X-Client-Updated-At': opts.clientUpdatedAt,
  };
}

export function verifyUrl(certificateNo: string): string {
  // Public verification page lives on the frontend origin (works without login).
  return `${window.location.origin}/verify?no=${encodeURIComponent(certificateNo)}`;
}

export { nowIso as clientNow };