import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { VerifyResult } from '../lib/client';
import { verifyCertificate } from '../lib/client';
import { useLang } from '../store/providers';
import { Alert, Loading } from '../components/ui';
import { DigiHeader } from '../components/layout';
import { fmtDate } from '../components/helpers';

interface CertificateTier {
  id: string;
  badge: string;
  title: string;
  authority: string;
  nsqfLevel: string;
  scheme: string;
  tagColor: string;
  features: string[];
  sampleNo: string;
}

const GOV_CERTIFICATE_TIERS: CertificateTier[] = [
  {
    id: 'nsqf-rpl',
    badge: 'NSQF-RPL',
    title: 'National RPL Skill Competency Certificate',
    authority: 'NCVET / MSDE (Ministry of Skill Development & Entrepreneurship)',
    nsqfLevel: 'Level 3 / Level 4',
    scheme: 'PMKVY 4.0 RPL Scheme',
    tagColor: '#2e8540',
    features: [
      'Tamper-evident SHA-256 evidence audit hash sequence',
      'NOS-level performance criteria grading (70% practical threshold)',
      'Direct wage credit & contractor licensing eligibility',
      'DigiLocker verifiable QR credential'
    ],
    sampleNo: 'SIH-RPL-2026-00000001',
  },
  {
    id: 'safety-licence',
    badge: 'SAFETY-PASS',
    title: 'Hazardous Works & Safety Compliance License',
    authority: 'Directorate General of Factory Advice Service & Labour Institutes (DGFASLI)',
    nsqfLevel: 'Statutory Safety Floor',
    scheme: 'National OSH Code 2020',
    tagColor: '#d97706',
    features: [
      'Mandatory Lockout-Tagout (LOTO) & Power Isolation Verification',
      'PPE compliance & Hot Work fire safety protocol validation',
      'Zero-tolerance safety veto (auto-rejects reckless practice)',
      'Site safety supervisor sign-off authorization'
    ],
    sampleNo: 'OSH-SAF-2026-00049211',
  },
  {
    id: 'bridge-course',
    badge: 'BRIDGE-PATH',
    title: 'Micro-Credential & Gap-to-Pathway Certificate',
    authority: 'Skill India Digital Hub (SIDH)',
    nsqfLevel: 'Bridge to Level 5',
    scheme: 'Pradhan Mantri Kaushal Vikas Yojana',
    tagColor: '#0b5cab',
    features: [
      'Pinpoints exact missing technical performance criteria (e.g. 3-phase wiring)',
      'Links directly to free ITI bridge training modules',
      'Enables progressive upward mobility without repeating basic tests',
      'Instant employer apprenticeship recommendation'
    ],
    sampleNo: 'SIDH-GAP-2026-00098234',
  },
  {
    id: 'green-skill',
    badge: 'GREEN-SOLAR',
    title: 'Suryamitra / Renewable Energy Add-on Credential',
    authority: 'Skill Council for Green Jobs (SCGJ)',
    nsqfLevel: 'Level 4 Specialization',
    scheme: 'PM Surya Ghar Muft Bijli Yojana',
    tagColor: '#059669',
    features: [
      'Rooftop solar inverter, earthing & PV array installation validation',
      'Net metering & grid synchronization testing competencies',
      'Government subsidy empanelled contractor certification',
      'Carbon-credit installer identification tag'
    ],
    sampleNo: 'SCGJ-SOL-2026-00012903',
  },
];

export default function Verify() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const [selectedTier, setSelectedTier] = useState<string>('nsqf-rpl');
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

  const activeTier = GOV_CERTIFICATE_TIERS.find((t) => t.id === selectedTier) ?? GOV_CERTIFICATE_TIERS[0];

  return (
    <>
      <DigiHeader />
      <main className="digi-container">
        {/* DigiLocker Institutional Verification Banner */}
        <div className="digi-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="digi-pill digi-pill-green">Public Trust Registry</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>Digital India</span>
          </div>
          <h2>National Credential Verifier</h2>
          <p>
            Verify government-backed skill credentials, safety licenses, and bridge-training pathways with zero login. Scans DigiLocker QR codes instantly.
          </p>
        </div>

        {/* Certificate Innovation Selector (Tabs) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15325b', marginBottom: 6 }}>
            Select Certification Category to Verify:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {GOV_CERTIFICATE_TIERS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  setSelectedTier(tier.id);
                  setInput(tier.sampleNo);
                }}
                style={{
                  padding: '8px 10px',
                  border: `1.5px solid ${selectedTier === tier.id ? '#0b5cab' : '#d5dbe5'}`,
                  borderRadius: 6,
                  background: selectedTier === tier.id ? '#e9f2fa' : '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: selectedTier === tier.id ? '#08437d' : '#1d2d42',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: tier.tagColor }}>
                    {tier.badge}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{tier.nsqfLevel}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tier.title.split(' ')[0]} {tier.title.split(' ')[1]}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Tier Feature Highlight Card */}
        <div className="digi-card" style={{ borderLeft: `4px solid ${activeTier.tagColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <h3 style={{ fontSize: '0.95rem', color: '#15325b' }}>{activeTier.title}</h3>
            <span className="digi-pill" style={{ background: '#f1f5f9', color: activeTier.tagColor, border: `1px solid ${activeTier.tagColor}` }}>
              {activeTier.nsqfLevel}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 8 }}>
            <strong>Authority:</strong> {activeTier.authority}
          </div>
          
          <div style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '8px 10px', borderRadius: 4, border: '1px solid #e2e8f0', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#334155' }}>Core Institutional Features:</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.4 }}>
              {activeTier.features.map((feat, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>{feat}</li>
              ))}
            </ul>
          </div>

          {/* Verification Search Bar */}
          <div className="digi-form-group" style={{ marginBottom: 8 }}>
            <label className="digi-label">Credential Number / QR Identifier</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="digi-input"
                style={{ fontFamily: 'monospace', fontWeight: 600 }}
                placeholder={`e.g. ${activeTier.sampleNo}`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setParams({ no: input.trim() });
                    void run(input);
                  }
                }}
              />
              <button
                type="button"
                className="digi-btn digi-btn-primary"
                style={{ width: 'auto', padding: '0 16px', minHeight: 44, whiteSpace: 'nowrap' }}
                onClick={() => {
                  setParams({ no: input.trim() });
                  void run(input);
                }}
                disabled={busy || !input.trim()}
              >
                {busy ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>

          {error && <div style={{ marginTop: 8 }}><Alert kind="err">{error}</Alert></div>}
          {busy && <div style={{ textAlign: 'center', padding: 12 }}><Loading /></div>}
        </div>

        {/* Verification Result Card */}
        {result && (
          <div className="digi-card" style={{ borderTop: result.valid ? '4px solid #2e8540' : '4px solid #b91c1c' }}>
            {result.valid ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span className="digi-pill digi-pill-green">✓ Validated Authentic Record</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>DigiLocker Trust Node</span>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 12, borderRadius: 6, marginBottom: 12 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#166534' }}>
                    {result.holder?.name ?? result.certificate?.holderName}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#15803d', marginTop: 2 }}>
                    Certified: {result.holder?.trade ?? result.certificate?.qpTitle}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: '0.85rem', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>NSQF Awarded Level</div>
                    <strong>Level {result.holder?.nsqfLevel ?? result.certificate?.nsqfLevel}</strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Competency Score</div>
                    <strong style={{ color: '#15803d' }}>
                      {result.assessment?.overallScore ?? result.certificate?.overallScore}% (PASSED)
                    </strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Certificate Registration No.</div>
                    <strong style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{result.certificate?.certificateNo}</strong>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Date of Issue</div>
                    <strong>{fmtDate(result.certificate?.issuedAt)}</strong>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, fontSize: '0.75rem', color: '#64748b' }}>
                  <strong>Digital Security:</strong> SHA-256 tamper-evident audit hash verified by Authorized ITI Assessor.
                </div>
              </>
            ) : (
              <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>✗ Invalid or Revoked Certificate</div>
                <div style={{ fontSize: '0.8rem', marginTop: 2 }}>
                  {result.reason || 'No matching official NSQF certification found for this identifier in the national database.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Digital India Compliance Note */}
        <div style={{ textAlign: 'center', padding: '12px 6px', fontSize: '0.75rem', color: '#64748b' }}>
          Skill India Digital Hub · NCVET · DigiLocker Compliant Verifier
        </div>
      </main>
    </>
  );
}
