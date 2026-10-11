import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, SIH_HINT } from '../config';
import { useAuth, useLang } from '../store/providers';
import { GovHeader } from '../components/layout';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cert, setCert] = useState('');

  return (
    <>
      <GovHeader />
      <div className="container" style={{ paddingTop: 12, paddingBottom: 32 }}>
        {/* Worker Action Focus Card */}
        <div className="panel" style={{ borderLeft: '4px solid var(--primary-navy)', background: '#FFFFFF', padding: '16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="status-tag navy">RPL Skill Certification</span>
            <span className="small muted">NSQF Level 3-4</span>
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 8, lineHeight: 1.3 }}>
            Government RPL Candidate Assessment Portal
          </h2>
          <p className="muted small" style={{ marginBottom: 14 }}>
            For informal workers with prior skills in Electrician, Plumber, or Welder trades. Take practical tests, upload voice/video evidence, and earn an official NSQF credential. Operates in full offline mode.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {user?.role === 'worker' ? (
              <Link className="btn btn-primary" to="/worker" style={{ width: '100%' }}>
                Enter Candidate Portal
              </Link>
            ) : (
              <Link className="btn btn-primary" to="/login" style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
                Start Candidate Test (Mobile OTP)
              </Link>
            )}
            <Link
              className="btn btn-secondary"
              to={user?.role === 'assessor' || user?.role === 'authorized_assessor' ? '/assessor' : '/assessor/login'}
              style={{ width: '100%' }}
            >
              Assessor / Reviewer Login
            </Link>
          </div>
        </div>

        {/* Mobile-Friendly Active Qualification Packs */}
        <div className="panel" style={{ padding: '14px' }}>
          <div className="panel-header" style={{ marginBottom: 8, paddingBottom: 6 }}>
            <h3 style={{ fontSize: '1rem' }}>Active Trade Qualification Packs</h3>
            <span className="status-tag pass">Verified</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '8px 10px', background: '#FFFFFF', border: '1px solid var(--solid-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>Electrician Domestic Solutions</strong>
                <span className="status-tag navy">Level 4</span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>QP: ELE/Q1401 · Mandatory Isolation Veto</div>
            </div>

            <div style={{ padding: '8px 10px', background: '#FFFFFF', border: '1px solid var(--solid-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>Plumber General</strong>
                <span className="status-tag navy">Level 4</span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>QP: PSC/Q0104 · Pressure Test Verification</div>
            </div>

            <div style={{ padding: '8px 10px', background: '#FFFFFF', border: '1px solid var(--solid-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>Manual Metal Arc Welder</strong>
                <span className="status-tag navy">Level 3</span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>QP: CSC/Q0204 · PPE & Hot Work Discipline</div>
            </div>
          </div>
        </div>

        {/* Mobile Assessment Steps Accordion / Card */}
        <div className="panel" style={{ padding: '14px' }}>
          <div className="panel-header" style={{ marginBottom: 8, paddingBottom: 6 }}>
            <h3 style={{ fontSize: '1rem' }}>Assessment Process Sequence</h3>
            <span className="status-tag">5 Steps</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.88rem' }}>
            <div style={{ padding: '6px 8px', borderLeft: '3px solid var(--primary-navy)', background: '#FFFFFF', border: '1px solid var(--solid-border)', borderLeftWidth: 3 }}>
              <strong>1. Self-Declaration:</strong> Voice or form declaration of years, tools, and tasks performed.
            </div>
            <div style={{ padding: '6px 8px', borderLeft: '3px solid var(--primary-navy)', background: '#FFFFFF', border: '1px solid var(--solid-border)', borderLeftWidth: 3 }}>
              <strong>2. NSQF Match:</strong> Instant AI qualification pack ranking and target level recommendation.
            </div>
            <div style={{ padding: '6px 8px', borderLeft: '3px solid var(--primary-navy)', background: '#FFFFFF', border: '1px solid var(--solid-border)', borderLeftWidth: 3 }}>
              <strong>3. Practical Test:</strong> Tool identification, safety MCQs, hands-on wiring/pipe activity, and fault finding (supports full offline mode).
            </div>
            <div style={{ padding: '6px 8px', borderLeft: '3px solid var(--primary-navy)', background: '#FFFFFF', border: '1px solid var(--solid-border)', borderLeftWidth: 3 }}>
              <strong>4. AI Evidence Triage:</strong> Keyframe extraction, transcript matching, and safety issue flagging.
            </div>
            <div style={{ padding: '6px 8px', borderLeft: '3px solid var(--primary-navy)', background: '#FFFFFF', border: '1px solid var(--solid-border)', borderLeftWidth: 3 }}>
              <strong>5. Assessor Audit & Certification:</strong> Assessor reviews flags, sets final scores, and issues QR certificate.
            </div>
          </div>
        </div>

        {/* Public Credential Verification Card */}
        <div className="panel" style={{ padding: '14px' }}>
          <div className="panel-header" style={{ marginBottom: 8, paddingBottom: 6 }}>
            <h3 style={{ fontSize: '1rem' }}>Verify a Certificate</h3>
            <span className="status-tag">Instant</span>
          </div>
          <p className="small muted" style={{ marginBottom: 8 }}>
            Enter certificate identifier to verify legitimacy and view NOS competency breakdown.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. SIH-RPL-2026-00000001"
              value={cert}
              onChange={(e) => setCert(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && cert.trim()) {
                  navigate(`/verify?no=${encodeURIComponent(cert.trim())}`);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => cert.trim() && navigate(`/verify?no=${encodeURIComponent(cert.trim())}`)}
            >
              Verify Credential
            </button>
          </div>
        </div>

        {/* Compact Footer */}
        <div style={{ textAlign: 'center', borderTop: '1px solid var(--solid-border)', paddingTop: 14, marginTop: 16 }}>
          <div className="small muted">
            {APP_NAME} · {SIH_HINT}
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            <Link to="/tos">Terms</Link> · <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </div>
    </>
  );
}