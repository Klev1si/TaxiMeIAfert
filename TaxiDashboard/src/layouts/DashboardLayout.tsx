import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  companyOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',           label: 'Overview',     icon: '📊' },
  { to: '/dashboard/analytics', label: 'Analytics',    icon: '📈', adminOnly: true },
  { to: '/dashboard/live',      label: 'Live Monitor', icon: '🟢' },
  { to: '/dashboard/drivers',   label: 'Drivers',      icon: '🚗' },
  { to: '/dashboard/clients',   label: 'Passengers',   icon: '👤', adminOnly: true },
  { to: '/dashboard/rides',     label: 'Rides',        icon: '📍' },
  { to: '/dashboard/tariffs',   label: 'Tariffs',      icon: '💰' },
  { to: '/dashboard/earnings',     label: 'Earnings',     icon: '💵', companyOnly: true },
  { to: '/dashboard/subscription', label: 'Subscription', icon: '💳', companyOnly: true },
  { to: '/dashboard/companies',    label: 'Companies',    icon: '🏢', adminOnly: true },
  { to: '/dashboard/plans',        label: 'Plans',        icon: '📋', adminOnly: true },
  { to: '/dashboard/promo-codes',  label: 'Promo Codes',  icon: '🏷️', adminOnly: true },
  { to: '/dashboard/payouts',      label: 'Payouts',      icon: '💸', adminOnly: true },
  { to: '/dashboard/platform-finances', label: 'Platform Finances', icon: '📊', adminOnly: true },
  { to: '/dashboard/support',      label: 'Support',      icon: '🎫', adminOnly: true },
  { to: '/dashboard/fraud',        label: 'Fraud',        icon: '🛡️', adminOnly: true },
  { to: '/dashboard/audit-logs',   label: 'Audit Logs',   icon: '🔍', adminOnly: true },
  { to: '/dashboard/health',       label: 'Health',       icon: '💚', adminOnly: true },
];

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'super_admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.adminOnly  && !isAdmin) return false;
    if (item.companyOnly && isAdmin) return false;
    return true;
  });

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚕</span>
          <div>
            <p className="text-white font-bold text-sm leading-tight">TaxiApp</p>
            <p className="text-slate-400 text-xs">
              {isAdmin ? 'Super Admin' : 'Company'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-slate-700">
        <div className="px-3 mb-3">
          <p className="text-slate-400 text-xs">Signed in as</p>
          <p className="text-white text-sm font-medium truncate">{user?.phone}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-900/40 hover:text-red-400 transition-colors"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Mobile backdrop ────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar — desktop: always visible; mobile: slide-in drawer ──── */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-slate-900 flex flex-col z-40 transition-transform duration-300
          lg:static lg:translate-x-0 lg:z-auto lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent />
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shrink-0 flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {isAdmin ? 'Admin Dashboard' : 'Company Dashboard'}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
