// Minimal tus 1.0 client (create → chunked PATCH with resume+progress).
// Metadata keys must match the backend's `UploadMetadata` schema exactly.
import { API_BASE } from '../config';
import { accessToken, clientId } from './session';

export interface TusMeta {
  assessmentId: string;
  taskId?: string;
  kind: 'photo' | 'video' | 'audio' | 'document';
  capturedAt: string;
  clientSha256?: string;
  deviceId?: string;
  appVersion?: string;
  lat?: string;
  lng?: string;
  accuracy?: string;
  language?: string;
  mimeType?: string;
  narrationText?: string;
  narrationSource?: string;
}

export interface TusProgress {
  offset: number;
  size: number;
  percent: number;
}

function b64u(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function encodeMetadata(meta: TusMeta): string {
  return Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k} ${b64u(String(v))}`)
    .join(',');
}

async function createUpload(file: Blob, meta: TusMeta): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken() ?? ''}`,
      'Upload-Length': String(file.size),
      'Upload-Metadata': encodeMetadata(meta),
      'Content-Type': 'application/offset+octet-stream',
      'X-Client-Id': clientId(),
      'X-Api-Version': '1',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`tus create failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const location = res.headers.get('Location');
  if (!location) throw new Error('tus create: no Location header');
  // Location may be absolute or relative — normalise against the API base.
  return location.startsWith('http') ? location : `${API_BASE}${location}`;
}

function uploadChunk(url: string, chunk: Blob, offset: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', url, true);
    xhr.setRequestHeader('Upload-Offset', String(offset));
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken() ?? ''}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const next = xhr.getResponseHeader('Upload-Offset');
        resolve(next ? Number(next) : offset + chunk.size);
      } else {
        reject(new Error(`tus patch failed: ${xhr.status} ${xhr.responseText?.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => reject(new Error('tus patch network error'));
    xhr.send(chunk);
  });
}

export async function tusUpload(
  file: Blob,
  meta: TusMeta,
  onProgress?: (p: TusProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const size = file.size;
  const CHUNK = 8 * 1024 * 1024; // 8 MiB — safe on rural 3G and retried by resume
  let url = await createUpload(file, meta);
  let offset = 0;
  if (signal) signal.throwIfAborted?.();
  while (offset < size) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const chunk = file.slice(offset, Math.min(offset + CHUNK, size));
    // Resume-aware: a HEAD first is optional; the server rejects a wrong
    // offset, in which case we re-sync the offset and try again.
    try {
      offset = await uploadChunk(url, chunk, offset);
    } catch (err) {
      const off = await headOffset(url);
      if (off !== null && off <= size && off > offset) offset = off;
      else throw err;
    }
    onProgress?.({ offset, size, percent: size === 0 ? 1 : offset / size });
  }
}

async function headOffset(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${accessToken() ?? ''}` },
    });
    if (!res.ok) return null;
    const v = res.headers.get('Upload-Offset');
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}