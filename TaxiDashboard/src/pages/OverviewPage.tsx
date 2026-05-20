import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface Stats {
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  activeDrivers: number;
  pendingDrivers: number;
  totalClients: number;
  totalCompanies: number;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  sub?: string;
}

function StatCard({ label, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const endpoint = isAdmin ? '/admin/stats' : '/company/stats';
    apiClient.get<Stats>(endpoint)
      .then(({ data }) => setStats(data))
      .catch(() => setError('Could not load statistics.'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 font-medium">{error || 'No data available.'}</p>
      </div>
    );
  }

  const completionRate = stats.totalRides > 0
    ? Math.round((stats.completedRides / stats.totalRides) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Overview</h2>
        <p className="text-sm text-gray-500 mt-1">Platform-wide statistics</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Rides"
          value={stats.totalRides.toLocaleString()}
          icon="📍"
          color="bg-indigo-50"
        />
        <StatCard
          label="Completed Rides"
          value={stats.completedRides.toLocaleString()}
          icon="✅"
          color="bg-green-50"
          sub={`${completionRate}% completion rate`}
        />
        <StatCard
          label="Cancelled Rides"
          value={stats.cancelledRides.toLocaleString()}
          icon="❌"
          color="bg-red-50"
        />
        <StatCard
          label="Active Drivers"
          value={stats.activeDrivers.toLocaleString()}
          icon="🚗"
          color="bg-blue-50"
          sub={stats.pendingDrivers > 0 ? `${stats.pendingDrivers} pending approval` : undefined}
        />
        {isAdmin && (
          <>
            <StatCard
              label="Passengers"
              value={stats.totalClients.toLocaleString()}
              icon="👤"
              color="bg-purple-50"
            />
            <StatCard
              label="Companies"
              value={stats.totalCompanies.toLocaleString()}
              icon="🏢"
              color="bg-amber-50"
            />
          </>
        )}
      </div>

      {/* Pending drivers alert */}
      {isAdmin && stats.pendingDrivers > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {stats.pendingDrivers} driver{stats.pendingDrivers !== 1 ? 's' : ''} pending approval
            </p>
            <p className="text-amber-600 text-xs mt-0.5">
              Go to Drivers → Pending to review and approve them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
