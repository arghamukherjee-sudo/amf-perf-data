import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import Spinner from './components/ui/Spinner';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import InviteAcceptPage from './components/auth/InviteAcceptPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import TeamPage from './pages/TeamPage';
import LeadAssignmentPage from './pages/LeadAssignmentPage';
import RevenuePage from './pages/RevenuePage';
import AttendancePage from './pages/AttendancePage';
import WeeklyTargetsPage from './pages/WeeklyTargetsPage';
import MonthlyTargetsPage from './pages/MonthlyTargetsPage';
import KpiPage from './pages/KpiPage';
import PerformancePage from './pages/PerformancePage';
import BillingCyclesPage from './pages/BillingCyclesPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { hasRole } from './stores/authStore';

function ProtectedRoute({ children, minRole }: { children: React.ReactNode; minRole?: 'team_member' | 'admin' | 'super_admin' }) {
  const { initialized, loading, profile } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (minRole && !hasRole(minRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#1e293b' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#1e293b' },
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="team"
            element={
              <ProtectedRoute minRole="team_member">
                <TeamPage />
              </ProtectedRoute>
            }
          />
          <Route path="leads" element={<LeadAssignmentPage />} />
          <Route path="revenue" element={<RevenuePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="weekly-targets" element={<WeeklyTargetsPage />} />
          <Route
            path="monthly-targets"
            element={
              <ProtectedRoute minRole="team_member">
                <MonthlyTargetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="kpi"
            element={
              <ProtectedRoute minRole="team_member">
                <KpiPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="performance"
            element={
              <ProtectedRoute minRole="team_member">
                <PerformancePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="billing-cycles"
            element={
              <ProtectedRoute minRole="team_member">
                <BillingCyclesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="reports"
            element={
              <ProtectedRoute minRole="team_member">
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute minRole="team_member">
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
