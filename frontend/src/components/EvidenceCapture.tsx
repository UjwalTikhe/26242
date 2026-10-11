import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EvidenceSpec, MediaType } from '@sih/contracts';
import { listEvidence } from '../lib/client';
import { tusUpload, type TusMeta } from '../lib/tus';
import { enqueue, isOnline } from '../lib/sync';
import { sha256Hex } from '../lib/sha256';
import { deviceId, nowIso } from '../lib/uuid';
import { getGps } from '../lib/gps';
import { APP_VERSION } from '../config';
import { useLang } from '../store/providers';
import { Alert, Spinner } from './ui';
import { EvidenceGrid } from './media';
import type { Lang } from '../i18n/strings';

interface Props {
  assessmentId: string;
  taskId: string;
  spec: EvidenceSpec;
  language: Lang;
  /** audio narration: hand the typed/confirmed transcript to the parent (task textAnswer). */
  onNarration?: (text: string) => void;
}

/** Captures photo/video/audio evidence, hashes + GPS-tags it locally, and
 *  uploads through tus (or queues it offline). */
export function EvidenceCapture({ assessmentId, taskId, spec, language, onNarration }: Props) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaTypes: MediaType[] = spec.media;

  const eq = useQuery({
    queryKey: ['evidence', assessmentId],
    queryFn: () => listEvidence(assessmentId, 100),
  });
  const mine = (eq.data?.items ?? []).filter((e) => e.taskId === taskId);
  const count = mine.length;
  const atMax = count >= spec.maxCount;
  const satisfied = count >= spec.minCount;

  const accept = mediaTypes
    .map((m) => (m === 'photo' ? 'image/*' : m === 'video' ? 'video/*' : m === 'audio' ? 'audio/*' : '*/*'))
    .join(',');

  async function handleFile(file: File) {
    setError(null);
    try {
      const kind: MediaType = mediaTypes.find((m) => {
        if (m === 'photo') return file.type.startsWith('image/');
        if (m === 'video') return file.type.startsWith('video/');
        if (m === 'audio') return file.type.startsWith('audio/');
        return m === 'document';
      }) ?? mediaTypes[0];
      const [sha, gps] = await Promise.all([sha256Hex(file), spec.requireGps ? getGps() : Promise.resolve(undefined)]);
      const meta: TusMeta = {
        assessmentId,
        taskId,
        kind: kind as TusMeta['kind'],
        capturedAt: nowIso(),
        clientSha256: sha,
        deviceId: deviceId(),
        appVersion: APP_VERSION,
        language,
        mimeType: file.type,
        lat: gps ? String(gps.lat) : undefined,
        lng: gps ? String(gps.lng) : undefined,
        accuracy: gps?.accuracy !== undefined ? String(gps.accuracy) : undefined,
        narrationText: transcript.trim() || undefined,
        narrationSource: transcript.trim() ? 'client' : undefined,
      };
      if (kind === 'audio' && transcript.trim()) onNarration?.(transcript.trim());

      if (isOnline()) {
        setProgress(0);
        await tusUpload(file, meta, (p) => setProgress(Math.round(p.percent * 100)));
        setProgress(null);
        await qc.invalidateQueries({ queryKey: ['evidence', assessmentId] });
      } else {
        await enqueue({ kind: 'upload', file: { name: file.name, type: file.type, meta }, fileBlob: file });
        setQueued((q) => q + 1);
      }
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <strong>{t('evidenceTitle')}</strong>
        <span className={`badge ${satisfied ? 'bg-approved' : 'bg-in_progress'}`}>
          {count} / {spec.minCount}–{spec.maxCount} {mediaTypes.join(', ')}
        </span>
      </div>

      {spec.requireWorkerInFrame && <p className="muted small">Ensure the worker is visible performing the task.</p>}
      {spec.narrationRequired && <p className="muted small">{t('narrationTranscript')}</p>}

      {mediaTypes.includes('audio') && (
        <textarea
          className="textarea"
          placeholder={t('narrationTranscript')}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          style={{ marginBottom: 10 }}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={mediaTypes.includes('photo') ? 'environment' : undefined}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {!atMax && (
        <div className="upload-zone" onClick={() => inputRef.current?.click()}>
          <div style={{ fontSize: '1.4rem' }}>＋</div>
          <div>
            {mediaTypes.map((m) => (m === 'photo' ? t('addPhoto') : m === 'video' ? t('addVideo') : m === 'audio' ? t('addAudio') : 'Document')).join(' / ')}
          </div>
          <div className="small">{isOnline() ? 'Camera / gallery' : t('offline')}</div>
        </div>
      )}

      {progress !== null && (
        <div style={{ marginTop: 10 }}>
          <div className="small muted">{t('uploading', { p: progress })}</div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {queued > 0 && <Alert kind="info">{t('syncPending', { n: queued })}</Alert>}
      {error && <Alert kind="err">{error}</Alert>}

      <div style={{ marginTop: 12 }}>
        {eq.isLoading ? <Spinner /> : <EvidenceGrid items={mine} />}
      </div>
    </div>
  );
}