import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { assessorQueue } from '../../lib/client';
import { useLang } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Button, Card, Empty, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { fmtDate } from '../../components/helpers';

export default function AssessorDashboard() {
  const { t } = useLang();
  const q = useQuery({ queryKey: ['assessor-queue'], queryFn: () => assessorQueue(40) });

  return (
    <AppShell>
      <div className="digi-toolbar justify-between">
        <div>
          <h1 className="mt-0 mb-0">{t('queue')}</h1>
          <p className="text-muted mt-0">{t('rolesAssessorD')}</p>
        </div>
        <Link className="digi-btn digi-btn-outline digi-btn-sm digi-btn-inline" to="/fairness" style={{ textDecoration: 'none' }}>{t('admin')}</Link>
      </div>

      <Card>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
        {q.data && q.data.items.length === 0 && <Empty>{t('noQueue')}</Empty>}
        {q.data && q.data.items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="digi-table">
              <thead>
                <tr>
                  <th>Assessment</th><th>{t('status')}</th><th>{t('round')}</th><th>{t('updated')}</th><th>Claimed</th><th />
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="text-mono text-sm">{a.id.slice(0, 8)}...</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{a.round}</td>
                    <td className="text-sm text-muted">{fmtDate(a.updatedAt)}</td>
                    <td className="text-sm">{a.claimedBy ? '[done]' : '-'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="digi-btn digi-btn-outline digi-btn-sm digi-btn-inline" to={`/assessor/a/${a.id}/review`} style={{ textDecoration: 'none' }}>
                        {['SUBMITTED', 'AI_ANALYZED'].includes(a.status) ? t('claim') : t('reviewTitle')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="digi-toolbar mt-12">
        <Link className="digi-btn digi-btn-primary digi-btn-sm digi-btn-inline" to="/assessor/sensor-dashboard" style={{ textDecoration: 'none', marginRight: 8 }}>
          📡 Sensor Dashboard
        </Link>
        <Button variant="ghost" className="digi-btn-sm digi-btn-inline" onClick={() => q.refetch()}>{t('retry')}</Button>
      </div>
    </AppShell>
  );
}