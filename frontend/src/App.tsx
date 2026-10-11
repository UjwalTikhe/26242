import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/providers';
import Landing from './pages/landing';
import Login from './pages/login';
import AssessorLogin from './pages/assessorLogin';
import Verify from './pages/verify';
import WorkerDashboard from './pages/worker/dashboard';
import WorkerProfilePage from './pages/worker/profile';
import NewAssessment from './pages/worker/new';
import AssessmentHome from './pages/worker/assessment';
import TaskRunner from './pages/worker/tasks';
import WorkerResult from './pages/worker/result';
import AssessorDashboard from './pages/assessor/dashboard';
import ReviewPage from './pages/assessor/review';
import DecisionPage from './pages/assessor/decision';
import FairnessPage from './pages/assessor/fairness';

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const to = roles.includes('worker') ? '/login' : '/assessor/login';
    return <Navigate to={to} replace state={{ from: location.pathname }} />;
  }
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/assessor/login" element={<AssessorLogin />} />
      <Route path="/verify" element={<Verify />} />

      <Route path="/worker" element={<RequireRole roles={['worker']}><WorkerDashboard /></RequireRole>} />
      <Route path="/worker/profile" element={<RequireRole roles={['worker']}><WorkerProfilePage /></RequireRole>} />
      <Route path="/worker/new" element={<RequireRole roles={['worker']}><NewAssessment /></RequireRole>} />
      <Route path="/worker/a/:id" element={<RequireRole roles={['worker']}><AssessmentHome /></RequireRole>} />
      <Route path="/worker/a/:id/tasks" element={<RequireRole roles={['worker']}><TaskRunner /></RequireRole>} />
      <Route path="/worker/a/:id/result" element={<RequireRole roles={['worker']}><WorkerResult /></RequireRole>} />

      <Route path="/assessor" element={<RequireRole roles={['assessor', 'authorized_assessor', 'admin']}><AssessorDashboard /></RequireRole>} />
      <Route path="/assessor/a/:id" element={<RequireRole roles={['assessor', 'authorized_assessor', 'admin']}><ReviewPage /></RequireRole>} />
      <Route path="/assessor/a/:id/decision" element={<RequireRole roles={['assessor', 'authorized_assessor', 'admin']}><DecisionPage /></RequireRole>} />
      <Route path="/fairness" element={<RequireRole roles={['assessor', 'authorized_assessor', 'admin']}><FairnessPage /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}