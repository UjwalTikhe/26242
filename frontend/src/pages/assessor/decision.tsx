import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAssessment, getReport, getReview, submitDecision } from '../../lib/client';
import { useAuth, useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, ErrorBox, Loading, SectionTitle, StatusBadge } from '../../components/ui';
import { fmtDate, useLocalized } from '../../components/helpers';

export default function DecisionPage() {
  const { id = '' } = useParams();
  const { t } = useLang();
  const toast = useToast().toast;
  const qc = useQueryClient();
  const loc = useLocalized();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [comments, setComments] = useState('');

  const aq = useQuery({ queryKey: ['assessment', id], queryFn: () => getAssessment(id) });
  const rq = useQuery({ queryKey: ['report', id], queryFn: () => getReport(id), retry: false });
  const revq = useQuery({ queryKey: ['review', id], queryFn: () => getReview(id), retry: false });

  const decide = useMutation({
    mutationFn: (outcome: 'APPROVED' | 'REJECTED') => submitDecision(id, outcome, comments || undefined),
    onSuccess: async () => {
      toast(t('sendDecision') + ' ✓', 'ok');
      await qc.invalidateQueries({ queryKey: ['assessment', id] });
      navigate('/assessor');
    },
    onError: (e) => toast(e instanceof Error ? e.message : String(e), 'err'),
  });

  if (aq.isLoading) return <AppShell><Loading /></AppShell>;
  if (aq.isError) return <AppShell><ErrorBox error={aq.error} retry={() => aq.refetch()} /></AppShell>;
  const a = aq.data!;
  const authorized = user?.role === 'authorized_assessor' || user?.role === 'admin';
  const canDecide = a.status === 'REVIEWED' && authorized;

  return (
    <AppShell>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <h1 style={{ margin: 0 }}>{t('decisionTitle')}</h1>
            <StatusBadge status={a.status} />
          </div>
          <div className="muted small mono">{a.id}</div>
        </div>
        <Link className="btn btn-ghost btn-sm" to={`/assessor/a/${id}`}>{t('back')}</Link>
      </div>

      {!authorized && (
        <Alert kind="info">Only an <b>authorized assessor</b> can issue the final decision. You can review but not decide.</Alert>
      )}

      {rq.data && (
        <Card title={t('results')}>
          <div className="grid grid-2">
            <div className="score-ring">
              <div className="score-num">{Math.round(rq.data.overallScore)}%</div>
              <span className={`badge ${rq.data.recommendation === 'certify' ? 'bg-approved' : rq.data.recommendation === 'not_certified' ? 'bg-rejected' : 'bg-in_progress'}`}>
                {rq.data.recommendation.replace(/_/g, ' ')}
              </span>
            </div>
            <dl className="key-value">
              <dt>Critical safety</dt><dd>{rq.data.criticalSafetyPassed ? '✓ passed' : '✗ failed'}</dd>
              <dt>Assessor overrides</dt><dd>{rq.data.assessorOverrides}</dd>
              <dt>NSQF level</dt><dd>{rq.data.currentNsqfLevel} → {rq.data.suggestedNsqfLevel}</dd>
              <dt>Generated</dt><dd>{fmtDate(rq.data.generatedAt)}</dd>
            </dl>
          </div>
          {rq.data.summary && <p className="small muted">{loc(rq.data.summary)}</p>}
        </Card>
      )}

      {revq.data && (
        <>
          <SectionTitle>Assessor review</SectionTitle>
          <Card>
            <Alert kind={revq.data.outcome === 'REVIEWED' ? 'ok' : 'err'}>Outcome: {revq.data.outcome}</Alert>
            {revq.data.overallComment && <p className="muted small">{revq.data.overallComment}</p>}
          </Card>
        </>
      )}

      {canDecide ? (
        <Card title={t('decisionTitle')}>
          <div className="field">
            <label className="field-label">{t('decisionComment')}</label>
            <textarea className="textarea" value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
          <div className="toolbar">
            <Button variant="success" disabled={decide.isPending} onClick={() => decide.mutate('APPROVED')}>{t('approve')}</Button>
            <Button variant="danger" disabled={decide.isPending} onClick={() => decide.mutate('REJECTED')}>{t('reject')}</Button>
          </div>
        </Card>
      ) : a.status !== 'REVIEWED' ? (
        <Alert kind="info">{t('decisionTitle')} available after the review is completed (status REVIEWED).</Alert>
      ) : null}
    </AppShell>
  );
}