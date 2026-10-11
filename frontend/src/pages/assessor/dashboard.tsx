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
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('queue')}</h1>
          <p className="muted" style={{ margin: 0 }}>{t('rolesAssessorD')}</p>
        </div>
        <Link className="btn btn-outline btn-sm" to="/fairness">{t('admin')}</Link>
      </div>

      <Card>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
        {q.data && q.data.items.length === 0 && <Empty>{t('noQueue')}</Empty>}
        {q.data && q.data.items.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Assessment</th><th>{t('status')}</th><th>{t('round')}</th><th>{t('updated')}</th><th>Claimed</th><th /></tr>
            </thead>
            <tbody>
              {q.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="mono small">{a.id}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.round}</td>
                  <td className="small muted">{fmtDate(a.updatedAt)}</td>
                  <td className="small">{a.claimedBy ? '✓' : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn btn-outline btn-sm" to={`/assessor/a/${a.id}`}>
                      {['SUBMITTED', 'AI_ANALYZED'].includes(a.status) ? t('claim') : t('reviewTitle')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <Button variant="ghost" className="btn-sm" onClick={() => q.refetch()}>{t('retry')}</Button>
      </div>
    </AppShell>
  );
}