import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { claimReview, getAnalysis, getAssessment, getPlan, getReview, listAnswers, listEvidence, submitReview } from '../../lib/client';
import { useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, ErrorBox, Loading, SectionTitle, StatusBadge } from '../../components/ui';
import { EvidenceGrid } from '../../components/media';
import { useLocalized } from '../../components/helpers';

export default function ReviewPage() {
  const { id = '' } = useParams();
  const { t } = useLang();
  const toast = useToast().toast;
  const qc = useQueryClient();
  const loc = useLocalized();
  const navigate = useNavigate();

  const aq = useQuery({ queryKey: ['assessment', id], queryFn: () => getAssessment(id) });
  const pq = useQuery({ queryKey: ['plan', id], queryFn: () => getPlan(id), retry: false });
  const anq = useQuery({ queryKey: ['analysis', id], queryFn: () => getAnalysis(id), retry: false });
  const rq = useQuery({ queryKey: ['answers', id], queryFn: () => listAnswers(id), retry: false });
  const eq = useQuery({ queryKey: ['evidence', id], queryFn: () => listEvidence(id, 200), retry: false });
  const revq = useQuery({ queryKey: ['review', id], queryFn: () => getReview(id), retry: false });

  const tasks = pq.data?.tasks ?? [];
  const aiByTask = useMemo(() => new Map((anq.data?.items ?? []).map((it) => [it.taskId, it])), [anq.data]);
  const respByTask = useMemo(() => new Map((rq.data?.items ?? []).map((r) => [r.taskId, r])), [rq.data]);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reassess, setReassess] = useState<Record<string, boolean>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<'REVIEWED' | 'REASSESS'>('REVIEWED');
  const [overall, setOverall] = useState('');

  useEffect(() => {
    if (!tasks.length) return;
    setScores((prev) => {
      const next = { ...prev };
      for (const tk of tasks) {
        if (next[tk.id] !== undefined) continue;
        const ai = aiByTask.get(tk.id)?.aiScore;
        const auto = respByTask.get(tk.id)?.autoScore?.score;
        next[tk.id] = ai ?? auto ?? 0;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length, aiByTask, respByTask]);

  const claim = useMutation({
    mutationFn: () => claimReview(id),
    onSuccess: async () => {
      toast(t('claimed'), 'ok');
      await qc.invalidateQueries({ queryKey: ['assessment', id] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : String(e), 'err'),
  });

  const review = useMutation({
    mutationFn: () =>
      submitReview(id, {
        items: tasks.map((tk) => ({
          taskId: tk.id,
          finalScore: accept[tk.id] ? (aiByTask.get(tk.id)?.aiScore ?? scores[tk.id] ?? 0) : (scores[tk.id] ?? 0),
          acceptAi: !!accept[tk.id],
          comment: comments[tk.id] || undefined,
        })),
        overallComment: overall || undefined,
        outcome,
        reassessmentTasks: outcome === 'REASSESS'
          ? tasks.filter((tk) => reassess[tk.id]).map((tk) => ({ taskId: tk.id, reason: reasons[tk.id] || 'Re-assessment required' }))
          : [],
      }),
    onSuccess: async () => {
      toast(t('sendReview'), 'ok');
      await qc.invalidateQueries({ queryKey: ['assessment', id] });
      navigate('/assessor');
    },
    onError: (e) => toast(e instanceof Error ? e.message : String(e), 'err'),
  });

  if (aq.isLoading) return <AppShell><Loading /></AppShell>;
  if (aq.isError) return <AppShell><ErrorBox error={aq.error} retry={() => aq.refetch()} /></AppShell>;
  const a = aq.data!;
  const canReview = a.status === 'UNDER_REVIEW';
  const canClaim = ['SUBMITTED', 'AI_ANALYZED'].includes(a.status);

  return (
    <AppShell>
      <div className="digi-toolbar justify-between">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1 className="mt-0 mb-0">{t('reviewTitle')}</h1>
            <StatusBadge status={a.status} />
            <span className="text-muted text-sm">{t('round')} {a.round}</span>
          </div>
          <div className="text-muted text-sm text-mono">{a.id}</div>
        </div>
        <Link className="digi-btn digi-btn-ghost digi-btn-sm digi-btn-inline" to="/assessor" style={{ textDecoration: 'none' }}>{t('back')}</Link>
      </div>

      {canClaim && (
        <Card>
          <p className="text-muted">{t('claim')}. This assessment is waiting for an assessor.</p>
          <Button variant="saffron" disabled={claim.isPending} onClick={() => claim.mutate()}>
            {claim.isPending ? '...' : t('claim')}
          </Button>
        </Card>
      )}

      {revq.data && !canClaim && <Alert kind="ok">{t('ovReviewed')}: {revq.data.outcome}</Alert>}

      {canReview && (
        <>
          {anq.data && anq.data.safetySummary.criticalFlags > 0 && (
            <Alert kind="err">[!] {anq.data.safetySummary.criticalFlags} critical-safety flag(s) raised by AI.</Alert>
          )}

          {tasks.map((tk) => {
            const ai = aiByTask.get(tk.id);
            const auto = respByTask.get(tk.id)?.autoScore?.score;
            return (
              <Card key={tk.id} title={<span>{loc(tk.title)} {tk.criticalSafety && <span className="digi-pill digi-pill-red">safety</span>}</span>}>
                <div className="digi-grid-2">
                  <div>
                    <dl className="digi-kv">
                      <dt>Rubric weight</dt><dd>{tk.weight}%</dd>
                      <dt>Auto-score</dt><dd>{auto !== undefined ? `${Math.round(auto * 100)}%` : '-'}</dd>
                      <dt>AI score</dt><dd>{ai?.aiScore !== null && ai?.aiScore !== undefined ? `${Math.round(ai.aiScore * 100)}%` : 'deferred'}</dd>
                      <dt>AI confidence</dt><dd>{ai ? `${Math.round(ai.confidence * 100)}%` : '-'}</dd>
                      <dt>Routing</dt><dd>{ai?.routing ?? '-'}</dd>
                    </dl>
                    {ai && ai.flags.length > 0 && (
                      <div className="mt-8">
                        {ai.flags.map((f, i) => (
                          <Alert key={i} kind={f.severity === 'critical' ? 'err' : 'info'}>
                            <b>{f.kind}</b>: {f.message}
                          </Alert>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="digi-check-item" style={{ marginBottom: 8 }}>
                      <input type="checkbox" checked={!!accept[tk.id]} onChange={(e) => setAccept((s) => ({ ...s, [tk.id]: e.target.checked }))} />
                      <span>{t('acceptAi')}</span>
                    </label>
                    <div className="digi-form-group">
                      <label className="digi-label">{t('yourScore')}: {Math.round((scores[tk.id] ?? 0) * 100)}%</label>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={scores[tk.id] ?? 0}
                        disabled={!!accept[tk.id]}
                        onChange={(e) => setScores((s) => ({ ...s, [tk.id]: Number(e.target.value) }))}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="digi-form-group">
                      <label className="digi-label">{t('comment')}</label>
                      <input className="digi-input" value={comments[tk.id] ?? ''} onChange={(e) => setComments((s) => ({ ...s, [tk.id]: e.target.value }))} />
                    </div>
                    <label className="digi-check-item" style={{ marginBottom: 8 }}>
                      <input type="checkbox" checked={!!reassess[tk.id]} onChange={(e) => setReassess((s) => ({ ...s, [tk.id]: e.target.checked }))} />
                      <span>{t('ovReassess')}</span>
                    </label>
                    {reassess[tk.id] && (
                      <input className="digi-input" placeholder={t('reassessReason')} value={reasons[tk.id] ?? ''} onChange={(e) => setReasons((s) => ({ ...s, [tk.id]: e.target.value }))} />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          <Card title={t('outcome')}>
            <div className="digi-check-group" style={{ marginBottom: 12 }}>
              <label className={`digi-check-item${outcome === 'REVIEWED' ? ' selected' : ''}`}>
                <input type="radio" checked={outcome === 'REVIEWED'} onChange={() => setOutcome('REVIEWED')} />
                <span>{t('ovReviewed')}</span>
              </label>
              <label className={`digi-check-item${outcome === 'REASSESS' ? ' selected' : ''}`}>
                <input type="radio" checked={outcome === 'REASSESS'} onChange={() => setOutcome('REASSESS')} />
                <span>{t('ovReassess')}</span>
              </label>
            </div>
            <div className="digi-form-group">
              <label className="digi-label">{t('overallComment')}</label>
              <textarea className="digi-textarea" value={overall} onChange={(e) => setOverall(e.target.value)} />
            </div>
            <Button variant="primary" disabled={review.isPending} onClick={() => review.mutate()}>
              {review.isPending ? '...' : t('sendReview')}
            </Button>
          </Card>
        </>
      )}

      {a.status === 'REVIEWED' && (
        <Card title={t('decisionTitle')}>
          <Alert kind="ok">{t('ovReviewed')}. Final decision pending.</Alert>
          <Link className="digi-btn digi-btn-orange digi-btn-inline" to={`/assessor/a/${id}/decision`} style={{ textDecoration: 'none', marginTop: 8 }}>{t('decisionTitle')}</Link>
        </Card>
      )}
      {(a.status === 'APPROVED' || a.status === 'REJECTED') && (
        <Card title={t('decisionTitle')}>
          <Alert kind={a.status === 'APPROVED' ? 'ok' : 'err'}>{a.status === 'APPROVED' ? t('approved') : t('rejected')}</Alert>
        </Card>
      )}

      <SectionTitle>{t('evidenceTitle')}</SectionTitle>
      <Card>
        {eq.isLoading ? <Loading /> : <EvidenceGrid items={eq.data?.items ?? []} />}
      </Card>
    </AppShell>
  );
}