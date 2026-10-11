import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, SIH_HINT } from '../config';
import { useAuth, useLang } from '../store/providers';
import { GovHeader } from '../components/layout';

export default function Landing() {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cert, setCert] = useState('');

  return (
    <>
      <GovHeader />
      <div className="container" style={{ paddingTop: 20 }}>
        {/* Institutional System Notice */}
        <div className="panel" style={{ borderLeft: '4px solid var(--primary-navy)', background: '#FFFFFF' }}>
          <h2>National Skills Qualifications Framework (NSQF) Assessment Portal</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            DakshSetu assesses informal workers across certified trade packs: Electrician (ELE/Q1401), Plumber (PSC/Q0104), and Welder (CSC/Q0204). Complete hands-on evaluation with offline support and tamper-evident logging.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {user?.role === 'worker' ? (
              <Link className="btn btn-primary" to="/worker">
                Go to Candidate Dashboard
              </Link>
            ) : (
              <Link className="btn btn-primary" to="/login">
                Candidate Access (Phone OTP)
              </Link>
            )}
            <Link
              className="btn btn-secondary"
              to={user?.role === 'assessor' || user?.role === 'authorized_assessor' ? '/assessor' : '/assessor/login'}
            >
              Assessor / Audit Login
            </Link>
          </div>
        </div>

        {/* Dense Institutional Information Grid */}
        <div className="row">
          <div className="col-2">
            <div className="panel">
              <div className="panel-header">
                <h3>Assessment Workflow Specifications</h3>
                <span className="status-tag navy">12-State Machine</span>
              </div>
              <table className="table-dense">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Stage</th>
                    <th>Module</th>
                    <th>Authority</th>
                    <th>Offline Capability</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>01</td>
                    <td>Candidate Self-Declaration (Experience, Tools, Tasks)</td>
                    <td>Candidate (Voice / Form)</td>
                    <td>Local IndexedDB Outbox</td>
                  </tr>
                  <tr>
                    <td>02</td>
                    <td>AI NSQF Qualification Pack Matching</td>
                    <td>Automated Model (RAG / NOS)</td>
                    <td>Server Process</td>
                  </tr>
                  <tr>
                    <td>03</td>
                    <td>Practical Task Execution (Tool ID, Safety, Wiring, Faults)</td>
                    <td>Candidate (Media / Audio)</td>
                    <td>Full Offline Operation</td>
                  </tr>
                  <tr>
                    <td>04</td>
                    <td>AI Evidence Triage & Timestamp Bookmarking</td>
                    <td>Analysis Worker (Non-binding)</td>
                    <td>Background Job</td>
                  </tr>
                  <tr>
                    <td>05</td>
                    <td>Assessor Review & Final Decision</td>
                    <td>Authorized Assessor (Binding)</td>
                    <td>Assessor Portal</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Active Qualification Packs in Repository</h3>
                <span className="status-tag pass">Verified NOS</span>
              </div>
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Trade Category</th>
                    <th>QP Reference</th>
                    <th>NSQF Level</th>
                    <th>Safety Flooring</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Electrician Domestic Solutions</strong></td>
                    <td>ELE/Q1401</td>
                    <td>Level 4</td>
                    <td>Mandatory Isolation Veto</td>
                  </tr>
                  <tr>
                    <td><strong>Plumber General</strong></td>
                    <td>PSC/Q0104</td>
                    <td>Level 4</td>
                    <td>Pressure Test Verification</td>
                  </tr>
                  <tr>
                    <td><strong>Manual Metal Arc Welder</strong></td>
                    <td>CSC/Q0204</td>
                    <td>Level 3</td>
                    <td>PPE & Hot Work Discipline</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="col">
            <div className="panel">
              <div className="panel-header">
                <h3>Public Credential Verification</h3>
                <span className="status-tag">No Auth Required</span>
              </div>
              <p className="small muted">
                Verify any issued RPL certificate using the registration identifier. Displays NSQF level, NOS breakdown, and tamper-evident SHA-256 audit hash.
              </p>
              <div className="form-group">
                <label className="form-label">Certificate Identifier</label>
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
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => cert.trim() && navigate(`/verify?no=${encodeURIComponent(cert.trim())}`)}
              >
                Search Registry
              </button>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Integrity & Compliance Controls</h3>
              </div>
              <p className="small" style={{ margin: '0 0 6px 0' }}>
                <strong>Evidence Chain:</strong> SHA-256 per-assessment hash sequence.
              </p>
              <p className="small" style={{ margin: '0 0 6px 0' }}>
                <strong>Resumable Protocol:</strong> Chunked binary uploads via tus.
              </p>
              <p className="small" style={{ margin: '0 0 6px 0' }}>
                <strong>Human-in-the-Loop:</strong> AI scores are assistive recommendations; assessors hold sole decision authority.
              </p>
            </div>
          </div>
        </div>

        {/* Administrative Footer */}
        <div style={{ borderTop: '1px solid var(--solid-border)', paddingTop: 16, marginTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span className="small muted">
            {APP_NAME} · {SIH_HINT} · Government RPL Skill Assessment System
          </span>
          <span className="small muted">
            <Link to="/tos">Terms of Service</Link> | <Link to="/privacy">Privacy Policy</Link>
          </span>
        </div>
      </div>
    </>
  );
}