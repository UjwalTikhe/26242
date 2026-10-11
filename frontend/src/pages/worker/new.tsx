import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createAssessment, listTrades } from '../../lib/client';
import { onlineOrQueue } from '../../lib/sync';
import { enqueue } from '../../lib/sync';
import { useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, Field, Loading } from '../../components/ui';
import { uuid } from '../../lib/uuid';
import { useLocalized } from '../../components/helpers';

export default function NewAssessment() {
  const { t, lang } = useLang();
  const toast = useToast().toast;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const loc = useLocalized();
  const [tradeHint, setTradeHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const trades = useQuery({ queryKey: ['trades'], queryFn: listTrades });

  async function create() {
    setBusy(true);
    setMsg(null);
    const clientId = uuid();
    const body = { id: clientId, language: lang, tradeHint: tradeHint || undefined };
    try {
      const result = await onlineOrQueue(
        () => createAssessment(body),
        async () => {
          await enqueue({ kind: 'api', url: '/api/v1/assessments', method: 'POST', body });
        },
      );
      await qc.invalidateQueries({ queryKey: ['assessments'] });
      if (result.applied && result.result) {
        toast(t('created'), 'ok');
        navigate(`/worker/a/${result.result.id}`);
      } else {
        toast(t('offline'), 'info');
        navigate(`/worker/a/${clientId}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1>{t('newApplication')}</h1>
      <Card>
        <p className="text-muted">{t('govt')}</p>
        <Field label={t('chooseTrade')} optional>
          {trades.isLoading ? <Loading /> : (
            <select className="digi-select" value={tradeHint} onChange={(e) => setTradeHint(e.target.value)}>
              <option value="">Let AI decide from my declaration</option>
              {(trades.data?.items ?? []).map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {loc(tp.title, tp.id)} (NSQF {tp.qp?.nsqfLevel ?? '-'})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button variant="saffron" onClick={create} disabled={busy} style={{ width: '100%' }}>
          {busy ? t('creating') : t('create')}
        </Button>
        {msg && <Alert kind="err">{msg}</Alert>}
      </Card>
    </AppShell>
  );
}