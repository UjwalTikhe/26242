import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAssessments } from '../../lib/client';
import { useAuth, useLang } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Button, Card, Empty, ErrorBox, Loading, SectionTitle, StatusBadge } from '../../components/ui';
import { fmtDate } from '../../components/helpers';

export default function WorkerDashboard() {
  const { t } = useLang();
  const { user, profile } = useAuth();
  const q = useQuery({ queryKey: ['assessments'], queryFn: () => listAssessments({ limit: 50 }) });

  return (
    <AppShell>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{t('dashboard')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('welcome', { name: profile?.fullName ?? user?.displayName ?? 'Worker' })}</p>
        </div>
        <Link className="btn btn-saffron" to="/worker/new">{t('newApplication')}</Link>
      </div>

      <div className="grid grid-2">
        <Card title={t('myAssessments')}>
          {q.isLoading && <Loading />}
          {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
          {q.data && q.data.items.length === 0 && (
            <Empty>
              <p>{t('noAssessments')}</p>
              <Link className="btn btn-primary" to="/worker/new">{t('newApplication')}</Link>
            </Empty>
          )}
          {q.data && q.data.items.length > 0 && (
            <div>
              {q.data.items.map((a) => (
                <div className="list-row" key={a.id}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={a.status} />
                      <span className="muted small">{t('round')} {a.round}</span>
                    </div>
                    <div className="muted small mono" style={{ marginTop: 4 }}>{a.id}</div>
                    <div className="muted small">{t('updated')}: {fmtDate(a.updatedAt)}</div>
                  </div>
                  <Link className="btn btn-outline btn-sm" to={`/worker/a/${a.id}`}>
                    {['DRAFT', 'DECLARED', 'MAPPED', 'PLAN_READY', 'IN_PROGRESS'].includes(a.status) ? t('continue') : t('view')}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div>
          <Card title={t('displayName')}>
            <dl className="key-value">
              <dt>{t('displayName')}</dt><dd>{profile?.fullName ?? user?.displayName ?? '—'}</dd>
              <dt>{t('phone')}</dt><dd className="mono">{profile?.phone ?? user?.phone ?? '—'}</dd>
              <dt>{t('yearsExperience')}</dt><dd>{profile?.yearsExperience ?? 0}</dd>
              <dt>Trade</dt><dd>{profile?.trades?.join(', ') || '—'}</dd>
              <dt>{t('language')}</dt><dd>{profile?.language ?? user?.language}</dd>
            </dl>
            <div style={{ marginTop: 12 }}>
              <Link className="btn btn-outline btn-sm" to="/worker/profile">{t('save')} / {t('displayName')}</Link>
            </div>
          </Card>

          <Card title={t('verify')}>
            <p className="muted small">{t('verifyPromoD')}</p>
            <Link className="btn btn-ghost btn-sm" to="/verify">{t('verify')}</Link>
          </Card>
        </div>
      </div>

      <SectionTitle>{t('dashboard')}</SectionTitle>
      <p className="muted small">
        Offline-first: if you lose connectivity your work is saved on your device and synced automatically.
      </p>
      <Button variant="ghost" className="btn-sm" onClick={() => q.refetch()}>{t('retry')}</Button>
    </AppShell>
  );
}