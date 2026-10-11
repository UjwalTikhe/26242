import { useQuery } from '@tanstack/react-query';
import { getFairness } from '../../lib/client';
import { useLang } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Card, ErrorBox, Loading } from '../../components/ui';

export default function FairnessPage() {
  const { t } = useLang();
  const q = useQuery({ queryKey: ['fairness'], queryFn: getFairness });

  return (
    <AppShell>
      <h1>{t('fairnessTitle')}</h1>
      <p className="text-muted">Approval rates and average scores by group dimension. Used to detect and correct bias in AI-assisted scoring.</p>

      <Card>
        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
        {q.data && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="digi-table">
                <thead>
                  <tr>
                    <th>{t('dimension')}</th><th>{t('value')}</th><th>{t('count')}</th><th>{t('avgScore')}</th><th>{t('approvalRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.buckets.map((b, i) => (
                    <tr key={i}>
                      <td><span className="digi-chip">{b.dimension}</span></td>
                      <td>{b.value}</td>
                      <td>{b.count}</td>
                      <td>{b.avgScore.toFixed(1)}</td>
                      <td>{Math.round(b.approvalRate * 100)}%</td>
                    </tr>
                  ))}
                  {q.data.buckets.length === 0 && (
                    <tr><td colSpan={5} className="text-muted">No completed assessments yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-muted text-sm mt-8">{q.data.note}</p>
          </>
        )}
      </Card>
    </AppShell>
  );
}