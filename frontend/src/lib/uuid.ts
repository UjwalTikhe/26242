/** RFC-4122 v4 UUIDs — every offline-created record is keyed by one of these. */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable per-install device id (used for X-Client-Id and evidence.deviceId). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('dakshsetu.deviceId');
    if (!id) {
      id = uuid();
      localStorage.setItem('dakshsetu.deviceId', id);
    }
    return id;
  } catch {
    return uuid();
  }
}

/** ISO-8601 with offset, local device time (server compares for LWW). */
export function nowIso(): string {
  return new Date().toISOString();
}