import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { certificatePdfUrl, getAssessment, getDecision, getReport } from '../../lib/client';
import { useLang } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, ErrorBox, Loading, SectionTitle, StatusBadge } from '../../components/ui';
import { fmtDate, useLocalized } from '../../components/helpers';
import { API_BASE } from '../../config';

export default function WorkerResult() {
  const { id = '' } = useParams();
  const { t } = useLang();
  const loc = useLocalized();

  const aq = useQuery({ queryKey: ['assessment', id], queryFn: () => getAssessment(id) });
  const rq = useQuery({ queryKey: ['report', id], queryFn: () => getReport(id), retry: false });
  const dq = useQuery({ queryKey: ['decision', id], queryFn: () => getDecision(id), retry: false });

  if (aq.isLoading) return <AppShell><Loading /></AppShell>;
  if (aq.isError) return <AppShell><ErrorBox error={aq.error} retry={() => aq.refetch()} /></AppShell>;
  const a = aq.data!;
  const approved = dq.data?.outcome === 'APPROVED';

  return (
    <AppShell>
      <div className="digi-toolbar justify-between">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <h1 className="mt-0 mb-0">{t('results')}</h1>
            <StatusBadge status={a.status} />
          </div>
          <div className="text-muted text-sm text-mono">{a.id}</div>
        </div>
        <Link className="digi-btn digi-btn-ghost digi-btn-sm digi-btn-inline" to={`/worker/a/${id}`} style={{ textDecoration: 'none' }}>{t('back')}</Link>
      </div>

      {rq.isError && <Alert kind="info">Assessment report is not available yet.</Alert>}
      {rq.isLoading && <Loading />}

      {rq.data && (
        <>
          <div className="digi-grid-2">
            <Card>
              <div className="digi-score-display">
                <div className="digi-score-num">{Math.round(rq.data.overallScore)}%</div>
                <div className="text-muted text-sm">{t('overallScore', { s: Math.round(rq.data.overallScore) })}</div>
                <div className="mt-8">
                  <span className={`digi-pill ${rq.data.recommendation === 'certify' ? 'digi-pill-green' : rq.data.recommendation === 'not_certified' ? 'digi-pill-red' : 'digi-pill-orange'}`}>
                    {t('recommendation', { r: rq.data.recommendation.replace(/_/g, ' ') })}
                  </span>
                </div>
                <div className="text-muted text-sm mt-8">
                  NSQF {rq.data.currentNsqfLevel} to {rq.data.suggestedNsqfLevel}
                </div>
                {!rq.data.criticalSafetyPassed && <Alert kind="err">Critical safety criteria not met.</Alert>}
              </div>
            </Card>

            <Card title={t('planTitle')}>
              <dl className="digi-kv">
                <dt>{t('passed')}</dt><dd>{rq.data.skillsPassed.length}</dd>
                <dt>{t('needsWork')}</dt><dd>{rq.data.skillsNeedingImprovement.length}</dd>
                <dt>Consistency</dt><dd>{Math.round(rq.data.consistencyScore * 100)}%</dd>
                <dt>Assessor overrides</dt><dd>{rq.data.assessorOverrides}</dd>
                <dt>Generated</dt><dd>{fmtDate(rq.data.generatedAt)}</dd>
              </dl>
              {rq.data.summary && <p className="text-sm text-muted mt-8">{loc(rq.data.summary)}</p>}
            </Card>
          </div>

          <SectionTitle>NOS-wise results</SectionTitle>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table className="digi-table">
                <thead><tr><th>NOS</th><th>Skill</th><th>Score</th><th>Result</th></tr></thead>
                <tbody>
                  {[...rq.data.skillsPassed, ...rq.data.skillsNeedingImprovement].map((s) => (
                    <tr key={s.nosRef}>
                      <td className="text-mono">{s.nosRef}</td>
                      <td>{s.title}{s.criticalSafety && <span className="digi-pill digi-pill-red" style={{ marginLeft: 6 }}>safety</span>}</td>
                      <td>{Math.round(s.score * 100)}%</td>
                      <td><span className={`digi-pill ${s.passed ? 'digi-pill-green' : 'digi-pill-orange'}`}>{s.passed ? t('passed') : t('needsWork')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {rq.data.bridgeTraining.length > 0 && (
            <>
              <SectionTitle>Bridge training suggestions</SectionTitle>
              {rq.data.bridgeTraining.map((b, i) => (
                <Card key={i}>
                  <h3 className="mb-4">{b.skillArea}</h3>
                  <p className="text-muted text-sm text-mono">{b.nosRefs.join(', ')}</p>
                  <p>{loc(b.suggestion)}</p>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {dq.data && (
        <>
          <SectionTitle>{t('decisionTitle')}</SectionTitle>
          <Card>
            <Alert kind={approved ? 'ok' : 'err'}>
              {approved ? t('approved') : t('rejected')}
              {dq.data.comments ? `: ${dq.data.comments}` : ''}
            </Alert>
            {approved && dq.data.certificateId && (
              <div className="digi-toolbar mt-8">
                <a className="digi-btn digi-btn-orange digi-btn-inline" href={`${API_BASE}${certificatePdfUrl(dq.data.certificateId)}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  {t('downloadPdf')}
                </a>
                <Link className="digi-btn digi-btn-outline digi-btn-inline" to="/verify" style={{ textDecoration: 'none' }}>{t('viewCertificate')} / {t('verify')}</Link>
              </div>
            )}
          </Card>
        </>
      )}

      <div className="mt-16">
        <Button variant="ghost" className="digi-btn-inline" onClick={() => location.reload()}>{t('checkAgain')}</Button>
      </div>
    </AppShell>
  );
}