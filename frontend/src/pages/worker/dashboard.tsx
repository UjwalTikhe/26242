import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAssessments } from '../../lib/client';
import { useAuth, useLang } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Empty, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { fmtDate } from '../../components/helpers';

export default function WorkerDashboard() {
  const { t } = useLang();
  const { user, profile } = useAuth();
  const q = useQuery({ queryKey: ['assessments'], queryFn: () => listAssessments({ limit: 50 }) });

  return (
    <AppShell>
      {/* DigiLocker Issued Documents Banner */}
      <div className="digi-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="digi-pill digi-pill-green">Aadhaar Linked</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>Digital Credentials</span>
        </div>
        <h2>{profile?.fullName ?? user?.displayName ?? 'Skill Candidate'}</h2>
        <p style={{ margin: 0, opacity: 0.95, fontSize: '0.85rem' }}>
          Registered Mobile: +91 {user?.phone || 'XXXXXXXXXX'} · NSQF RPL Candidate
        </p>
      </div>

      {/* Quick Action Button */}
      <div style={{ marginBottom: 14 }}>
        <Link className="digi-btn digi-btn-orange" to="/worker/new" style={{ gap: 8 }}>
          <span>+ Apply for New Skill Assessment</span>
        </Link>
      </div>

      {/* Diagnostic Session Button */}
      <div style={{ marginBottom: 14 }}>
        <Link className="digi-btn digi-btn-primary" to="/worker/diagnostic/new" style={{ gap: 8 }}>
          <span>📡 Start Diagnostic Session</span>
        </Link>
      </div>

      {/* Active Skill Credentials / Assessments */}
      <div className="digi-card">
        <div className="digi-card-header">
          <h3>My Skill Records & Certifications</h3>
          <span className="digi-pill digi-pill-blue">
            {q.data?.items.length ?? 0} Recorded
          </span>
        </div>

        {q.isLoading && <Loading />}
        {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
        {q.data && q.data.items.length === 0 && (
          <Empty>
            <p style={{ fontSize: '0.9rem', color: '#596a80' }}>
              No active skill assessments found in your locker.
            </p>
            <Link className="digi-btn digi-btn-primary" to="/worker/new" style={{ maxWidth: 220, margin: '8px auto 0' }}>
              Start First Assessment
            </Link>
          </Empty>
        )}

        {q.data && q.data.items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.data.items.map((a) => (
              <div
                key={a.id}
                style={{
                  border: '1px solid #d5dbe5',
                  borderRadius: 6,
                  padding: 12,
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#15325b' }}>
                      RPL Assessment
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                      ID: {a.id.slice(0, 18)}...
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                <div style={{ fontSize: '0.8rem', color: '#596a80', marginBottom: 10 }}>
                  Round: {a.round} · Updated: {fmtDate(a.updatedAt)}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    className="digi-btn digi-btn-primary"
                    to={`/worker/a/${a.id}`}
                    style={{ flex: 1, minHeight: 36, padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    {['DRAFT', 'DECLARED', 'MAPPED', 'PLAN_READY', 'IN_PROGRESS'].includes(a.status) ? 'Continue Assessment →' : 'View Competency Details'}
                  </Link>
                  {a.status === 'APPROVED' && (
                    <Link
                      className="digi-btn digi-btn-outline"
                      to={`/worker/a/${a.id}/result`}
                      style={{ minHeight: 36, padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      Certificate 🏅
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidate Profile Details Card */}
      <div className="digi-card">
        <div className="digi-card-header">
          <h3>Candidate Profile</h3>
          <Link to="/worker/profile" style={{ fontSize: '0.8rem', color: '#0b5cab', fontWeight: 600 }}>
            Edit Profile
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: '0.85rem' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Full Name</div>
            <strong>{profile?.fullName ?? user?.displayName ?? '—'}</strong>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Experience</div>
            <strong>{profile?.yearsExperience ?? 0} Years</strong>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Preferred Language</div>
            <strong>{profile?.language?.toUpperCase() ?? user?.language?.toUpperCase() ?? 'EN'}</strong>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Registered Trades</div>
            <strong>{profile?.trades?.join(', ') || 'General'}</strong>
          </div>
        </div>
      </div>
    </AppShell>
  );
}