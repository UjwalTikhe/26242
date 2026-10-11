import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { AssessmentStatus } from '@sih/contracts';
import { canTransition } from '@sih/contracts';
import {
  generatePlan, getAnalysisStatus, getAssessment, getDeclaration, getMapping, getPlan,
  mapAssessment, startAssessment, submitDeclaration,
} from '../../lib/client';
import { useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, ErrorBox, Loading, SectionTitle, StatusBadge } from '../../components/ui';
import { fmtDate, pct, useLocalized } from '../../components/helpers';
import { DeclarationForm } from './declarationForm';

const STEP_INDEX: Record<AssessmentStatus, number> = {
  DRAFT: 0, DECLARED: 1, MAPPED: 2, PLAN_READY: 3, IN_PROGRESS: 3,
  SUBMITTED: 4, AI_ANALYZED: 4, UNDER_REVIEW: 4, REASSESS: 3,
  REVIEWED: 5, APPROVED: 5, REJECTED: 5,
};

export default function AssessmentHome() {
  const { id = '' } = useParams();
  const { t } = useLang();
  const toast = useToast().toast;
  const qc = useQueryClient();
  const loc = useLocalized();
  const [busy, setBusy] = useState(false);

  const aq = useQuery({ queryKey: ['assessment', id], queryFn: () => getAssessment(id), retry: false });
  const status = aq.data?.status;
  const past = (s: AssessmentStatus[]) => !!status && s.includes(status);

  const dq = useQuery({
    queryKey: ['declaration', id], queryFn: () => getDeclaration(id), retry: false,
    enabled: past(['DECLARED', 'MAPPED', 'PLAN_READY', 'IN_PROGRESS', 'SUBMITTED', 'AI_ANALYZED', 'UNDER_REVIEW', 'REASSESS', 'REVIEWED', 'APPROVED', 'REJECTED']),
  });
  const mq = useQuery({
    queryKey: ['mapping', id], queryFn: () => getMapping(id), retry: false,
    enabled: past(['MAPPED', 'PLAN_READY', 'IN_PROGRESS', 'SUBMITTED', 'AI_ANALYZED', 'UNDER_REVIEW', 'REASSESS', 'REVIEWED', 'APPROVED', 'REJECTED']),
  });
  const pq = useQuery({
    queryKey: ['plan', id], queryFn: () => getPlan(id), retry: false,
    enabled: past(['PLAN_READY', 'IN_PROGRESS', 'SUBMITTED', 'AI_ANALYZED', 'UNDER_REVIEW', 'REASSESS']),
  });
  const anq = useQuery({
    queryKey: ['analysis-status', id], queryFn: () => getAnalysisStatus(id), retry: false,
    enabled: status === 'SUBMITTED', refetchInterval: 2500,
  });

  async function run<T>(fn: () => Promise<T>, okMsg?: string) {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['assessment', id] });
      if (okMsg) toast(okMsg, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const stepIdx = status ? STEP_INDEX[status] : 0;
  const steps = [t('stepDeclare'), t('stepMap'), t('stepPlan'), t('stepPractice'), t('stepReview'), t('stepDecision')];

  const submitDecl = useMutation({
    mutationFn: (answers: Parameters<typeof submitDeclaration>[1]['answers']) =>
      submitDeclaration(id, { answers, language: aq.data?.language }),
  });

  if (aq.isLoading) return <AppShell><Loading /></AppShell>;
  if (aq.isError) return <AppShell><ErrorBox error={aq.error} retry={() => aq.refetch()} /></AppShell>;
  const a = aq.data!;

  return (
    <AppShell>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{t('myAssessments')}</h1>
            <StatusBadge status={a.status} />
            <span className="muted small">{t('round')} {a.round}</span>
          </div>
          <div className="muted small mono">{a.id}</div>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/worker">{t('back')}</Link>
      </div>

      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s} className={`step${i < stepIdx ? ' done' : ''}${i === stepIdx ? ' now' : ''}`}>{s}</div>
        ))}
      </div>

      {(status === 'PLAN_READY' || status === 'IN_PROGRESS' || status === 'REASSESS') && (
        <Card>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>{t('planTitle')}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {pq.data ? t('planBody', { n: pq.data.tasks.length, w: pq.data.totalWeight }) : t('loading')}
                {pq.data ? ` · ${loc(pq.data.qpTitle)} · NSQF ${pq.data.nsqfLevel}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {canTransition(a.status, 'IN_PROGRESS') && status === 'PLAN_READY' && (
                <Button variant="saffron" disabled={busy} onClick={() => run(() => startAssessment(id))}>{t('start')}</Button>
              )}
              <Link className="btn btn-primary" to={`/worker/a/${id}/tasks`}>{t('continueAssessment')}</Link>
            </div>
          </div>
        </Card>
      )}

      {status === 'DRAFT' && (
        <DeclarationForm
          busy={submitDecl.isPending}
          onSubmit={(answers) => run(() => submitDecl.mutateAsync(answers), t('taskSaved'))}
        />
      )}

      {status === 'DECLARED' && (
        <Card title={t('stepMap')}>
          <p className="muted">{t('mappingBody')}</p>
          <Button variant="saffron" disabled={busy} onClick={() => run(() => mapAssessment(id, undefined), t('taskSaved'))}>
            {busy ? '…' : `${t('stepMap')}`}
          </Button>
          {dq.data && (
            <div style={{ marginTop: 14 }}>
              <h4>{t('declarationTitle')}</h4>
              <dl className="key-value">
                <dt>{t('yearsExperience')}</dt><dd>{dq.data.answers.yearsExperience}</dd>
                <dt>{t('workTypes')}</dt><dd>{dq.data.answers.workTypes.join(', ')}</dd>
                <dt>{t('toolsUsed')}</dt><dd>{dq.data.answers.toolsUsed.join(', ')}</dd>
                <dt>{t('tasksCanPerform')}</dt><dd>{dq.data.answers.tasksCanPerform.join(', ')}</dd>
              </dl>
            </div>
          )}
        </Card>
      )}

      {status === 'MAPPED' && (
        <Card title={t('mappingTitle')}>
          <p className="muted">{t('mappingBody')}</p>
          {mq.data?.matches.map((m, i) => (
            <div key={m.tradePackId} className="card" style={{ marginTop: 10, boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ marginBottom: 2 }}>{i === 0 ? '★ ' : ''}{m.qpTitle}</h3>
                  <span className="muted small">NSQF Level {m.nsqfLevel} {m.jobRole ? `· ${m.jobRole}` : ''}</span>
                </div>
                <span className="badge bg-mapped">{t('confidence', { p: Math.round(m.confidence * 100) })}</span>
              </div>
              <p className="small" style={{ marginTop: 8 }}>{t('reasoning', { r: m.reasoning })}</p>
              {m.matchedConcepts.length > 0 && (
                <p className="small muted">{t('matchedConcepts', { c: m.matchedConcepts.join(', ') })}</p>
              )}
              <Button
                variant={i === 0 ? 'saffron' : 'outline'}
                className="btn-sm"
                disabled={busy}
                onClick={() => run(() => generatePlan(id, m.tradePackId), t('taskSaved'))}
              >
                {t('confirmMapping')}
              </Button>
            </div>
          ))}
          {mq.isLoading && <Loading />}
        </Card>
      )}

      {status === 'SUBMITTED' && (
        <Card title={t('status')}>
          <Alert kind="info">
            {anq.data?.state === 'running' ? t('analysisRunning')
              : anq.data?.state === 'done' ? t('analysisDone')
              : t('analysisQueued')}
          </Alert>
        </Card>
      )}

      {status === 'AI_ANALYZED' && (
        <Card title={t('status')}>
          <Alert kind="ok">{t('analysisDone')}</Alert>
        </Card>
      )}

      {status === 'UNDER_REVIEW' && (
        <Card title={t('status')}>
          <Alert kind="info">{t('reviewTitle')}. An assessor will review your evidence.</Alert>
        </Card>
      )}

      {status === 'REASSESS' && (
        <Card title={t('ovReassess')}>
          <Alert kind="err">{t('ovReassess')}. {t('continueAssessment')} below with round {a.round}.</Alert>
        </Card>
      )}

      {status === 'REVIEWED' && (
        <Card title={t('stepDecision')}>
          <Alert kind="ok">{t('ovReviewed')}. Awaiting final decision.</Alert>
          <Link className="btn btn-outline btn-sm" to={`/worker/a/${id}/result`}>{t('results')}</Link>
        </Card>
      )}

      {(status === 'APPROVED' || status === 'REJECTED') && (
        <Card title={t('stepDecision')}>
          <Alert kind={status === 'APPROVED' ? 'ok' : 'err'}>
            {status === 'APPROVED' ? t('approved') : t('rejected')}
          </Alert>
          <Link className="btn btn-saffron" to={`/worker/a/${id}/result`}>{t('results')}</Link>
        </Card>
      )}

      <SectionTitle>{t('status')}</SectionTitle>
      <Card>
        <ul className="timeline">
          {a.statusHistory.map((h, i) => {
            const last = i === a.statusHistory.length - 1;
            return (
              <li key={`${h.status}-${h.at}`} className={last ? 'cur' : 'done'}>
                <div>
                  <StatusBadge status={h.status} />
                  <div className="muted small">{fmtDate(h.at)}{h.note ? ` · ${h.note}` : ''}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted small">{t('updated')}: {fmtDate(a.updatedAt)}</p>
      </Card>
    </AppShell>
  );
}