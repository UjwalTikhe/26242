import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { VerifyResult } from '../lib/client';
import { verifyCertificate } from '../lib/client';
import { useLang } from '../store/providers';
import { Alert, Button, Card, Loading, SectionTitle } from '../components/ui';
import { GovHeader } from '../components/layout';
import { fmtDate } from '../components/helpers';

export default function Verify() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('no') ?? '');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(no: string) {
    if (!no.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await verifyCertificate(no.trim());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const no = params.get('no');
    if (no) void run(no);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <GovHeader />
      <main className="page">
        <div className="container">
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h1>{t('verify')}</h1>
            <Card>
              <p className="muted">{t('verifyPromoD')}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  className="input" style={{ flex: 1, minWidth: 240 }}
                  placeholder={t('verifyPlaceholder')}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setParams({ no: input.trim() }); void run(input); } }}
                />
                <Button variant="saffron" onClick={() => { setParams({ no: input.trim() }); void run(input); }} disabled={busy || !input.trim()}>
                  {busy ? '…' : t('verifyBtn')}
                </Button>
              </div>
              {error && <Alert kind="err">{error}</Alert>}
              {busy && <Loading />}
            </Card>

            {result && (
              <Card>
                {result.valid ? (
                  <>
                    <Alert kind="ok"><b>✓ {t('verifyValid')}</b></Alert>
                    <dl className="key-value">
                      <dt>{t('displayName')}</dt><dd>{result.holder?.name ?? result.certificate?.holderName}</dd>
                      <dt>Trade</dt><dd>{result.holder?.trade ?? result.certificate?.qpTitle}</dd>
                      <dt>NSQF Level</dt><dd>{result.holder?.nsqfLevel ?? result.certificate?.nsqfLevel}</dd>
                      <dt>Certificate No.</dt><dd className="mono">{result.certificate?.certificateNo}</dd>
                      <dt>Overall score</dt><dd>{result.assessment?.overallScore ?? result.certificate?.overallScore}%</dd>
                      <dt>{t('issueDate', { d: '' })}</dt><dd>{fmtDate(result.certificate?.issuedAt)}</dd>
                    </dl>
                  </>
                ) : (
                  <Alert kind="err">✗ {t('verifyInvalid')}{result.reason ? ` (${result.reason})` : ''}</Alert>
                )}
              </Card>
            )}

            <SectionTitle>About</SectionTitle>
            <p className="muted small">
              Every certificate issued through DakshSetu carries a QR code and a certificate number. Anyone —
              an employer, a training partner, or a government officer — can verify it instantly here, with no login.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
