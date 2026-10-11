import { useEffect, useState } from 'react';
import type { Evidence } from '@sih/contracts';
import { evidenceBlob } from '../lib/client';

/** Renders auth-protected evidence bytes as an img/video/audio tile. */
export function EvidenceTile({ evidence, onClick }: { evidence: Evidence; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    evidenceBlob(evidence.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setErr(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence.id]);

  const label = evidence.kind;
  return (
    <div className="media-tile" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <span className="kind">{label}</span>
      {err ? (
        <div className="empty small" style={{ padding: '34px 8px' }}>Unavailable</div>
      ) : !url ? (
        <div className="empty small" style={{ padding: '34px 8px' }}>…</div>
      ) : evidence.kind === 'photo' ? (
        <img src={url} alt={`evidence ${evidence.seq}`} />
      ) : evidence.kind === 'video' ? (
        <video src={url} controls preload="metadata" />
      ) : (
        <div style={{ padding: 8 }}>
          <audio src={url} controls style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}

export function EvidenceGrid({ items, onOpen }: { items: Evidence[]; onOpen?: (e: Evidence) => void }) {
  if (!items.length) return <p className="muted small">No evidence attached yet.</p>;
  return (
    <div className="media-grid">
      {items.map((e) => (
        <EvidenceTile key={e.id} evidence={e} onClick={onOpen ? () => onOpen(e) : undefined} />
      ))}
    </div>
  );
}