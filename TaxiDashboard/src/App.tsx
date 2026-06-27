import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import DriversPage from './pages/DriversPage';
import RidesPage from './pages/RidesPage';
import PassengersPage from './pages/PassengersPage';
import CompaniesPage from './pages/CompaniesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import TariffsPage from './pages/TariffsPage';
import EarningsPage from './pages/EarningsPage';
import PlansPage from './pages/PlansPage';
import SubscribersPage from './pages/SubscribersPage';
import SubscriptionPage from './pages/SubscriptionPage';
import PromoCodesPage from './pages/PromoCodesPage';
import MessagesPage from './pages/MessagesPage';
import AuditLogsPage from './pages/AuditLogsPage';
import PayoutsPage from './pages/PayoutsPage';
import PlatformFinancesPage from './pages/PlatformFinancesPage';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';
import HealthPage from './pages/HealthPage';
import FraudPage from './pages/FraudPage';

export default function App() {
  const { initialize, isInitialized, user } = useAuthStore();

  useEffect(() => { initialize(); }, [initialize]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />

        {/* Protected — admin + company */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin', 'company']} />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<OverviewPage />} />

            <Route path="/dashboard/drivers"   element={<DriversPage />} />
            <Route path="/dashboard/clients"   element={<PassengersPage />} />
            <Route path="/dashboard/rides"     element={<RidesPage />} />
            <Route path="/dashboard/companies"    element={<CompaniesPage />} />
            <Route path="/dashboard/analytics"    element={<AnalyticsPage />} />
            <Route path="/dashboard/live"         element={<LiveMonitorPage />} />
            <Route path="/dashboard/tariffs"      element={<TariffsPage />} />
            <Route path="/dashboard/earnings"     element={<EarningsPage />} />
            <Route path="/dashboard/plans"        element={<PlansPage />} />
            <Route path="/dashboard/subscribers"  element={<SubscribersPage />} />
            <Route path="/dashboard/subscription" element={<SubscriptionPage />} />
            <Route path="/dashboard/promo-codes"  element={<PromoCodesPage />} />
            <Route path="/dashboard/messages"     element={<MessagesPage />} />
            <Route path="/dashboard/audit-logs"   element={<AuditLogsPage />} />
            <Route path="/dashboard/payouts"      element={<PayoutsPage />} />
            <Route path="/dashboard/platform-finances" element={<PlatformFinancesPage />} />
            <Route path="/dashboard/profile"  element={<ProfilePage />} />
            <Route path="/dashboard/support"      element={<SupportPage />} />
            <Route path="/dashboard/health"       element={<HealthPage />} />
            <Route path="/dashboard/fraud"        element={<FraudPage />} />
          </Route>
        </Route>

        {/* Fallbacks */}
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-center">
      <div>
        <p className="text-5xl mb-4">🔒</p>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 text-sm mb-6">
          You don't have permission to view this page.
        </p>
        <a href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm underline">
          Back to Login
        </a>
      </div>
    </div>
  );
}
