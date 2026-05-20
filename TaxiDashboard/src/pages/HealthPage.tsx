import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthStatus {
  status:   'ok' | 'degraded';
  uptime:   number;
  memory:   { heapUsedMb: number; heapTotalMb: number; rssMb: number };
  db:       { status: 'ok' | 'error'; latencyMs?: number; error?: string };
  redis:    { status: 'ok' | 'error'; latencyMs?: number; error?: string };
  version:  string;
  checkedAt: string;
}

interface Metrics {
  realtime: {
    onlineDrivers:      number;
    pendingRides:       number;
    activeRides:        number;
    openSupportTickets: number;
  };
  today: {
    completedRides: number;
    revenueAmount:  number;
  };
  totals: {
    users: number;
  };
  system: {
    uptimeSeconds: number;
    heapUsedMb:    number;
    heapTotalMb:   number;
    rssMb:         number;
    nodeVersion:   string;
    env:           string;
  };
  collectedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  );
}

function ProbeCard({
  label,
  probe,
}: {
  label: string;
  probe: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
}) {
  const ok = probe.status === 'ok';
  return (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center mb-1">
        <StatusDot ok={ok} />
        <span className="font-semibold text-sm text-gray-800">{label}</span>
      </div>
      {ok ? (
        <p className="text-xs text-gray-500 ml-4.5">
          {probe.latencyMs != null ? `Latency: ${probe.latencyMs}ms` : 'Connected'}
        </p>
      ) : (
        <p className="text-xs text-red-600 ml-4 break-words">{probe.error ?? 'Unreachable'}</p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string;
  value:   string | number;
  sub?:    string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-extrabold ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [health,      setHealth]      = useState<HealthStatus | null>(null);
  const [metrics,     setMetrics]     = useState<Metrics | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [h, m] = await Promise.all([
        apiClient.get<HealthStatus>('/health').then(r => r.data),
        apiClient.get<Metrics>('/admin/metrics').then(r => r.data),
      ]);
      setHealth(h);
      setMetrics(m);
      setLastRefresh(new Date());
    } catch {
      setError('Could not fetch observability data. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const overall = health?.status === 'ok' && !error;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          {lastRefresh && (
            <p className="text-xs text-gray-400 mt-1">
              Last updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30 s
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Overall status banner */}
      {health && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${overall ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <span className={`text-2xl ${overall ? 'text-emerald-600' : 'text-red-600'}`}>
            {overall ? '✅' : '⚠️'}
          </span>
          <div>
            <p className={`font-bold text-sm ${overall ? 'text-emerald-800' : 'text-red-800'}`}>
              {overall ? 'All systems operational' : 'One or more systems degraded'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              API v{health.version} · Uptime {fmtUptime(health.uptime)} · Node {metrics?.system.nodeVersion ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Service probes */}
      {health && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Service Probes</h2>
          <div className="grid grid-cols-2 gap-4">
            <ProbeCard label="PostgreSQL" probe={health.db} />
            <ProbeCard label="Redis" probe={health.redis} />
          </div>
        </div>
      )}

      {/* Real-time metrics */}
      {metrics && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Real-time</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Online Drivers"
                value={metrics.realtime.onlineDrivers}
                accent="text-emerald-600"
              />
              <MetricCard
                label="Pending Rides"
                value={metrics.realtime.pendingRides}
                accent={metrics.realtime.pendingRides > 0 ? 'text-amber-600' : 'text-gray-900'}
              />
              <MetricCard
                label="Active Rides"
                value={metrics.realtime.activeRides}
                accent="text-indigo-600"
              />
              <MetricCard
                label="Open Tickets"
                value={metrics.realtime.openSupportTickets}
                accent={metrics.realtime.openSupportTickets > 10 ? 'text-red-600' : 'text-gray-900'}
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Today</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard
                label="Completed Rides"
                value={metrics.today.completedRides}
              />
              <MetricCard
                label="Revenue"
                value={fmtCurrency(metrics.today.revenueAmount)}
                accent="text-emerald-700"
              />
              <MetricCard
                label="Total Users"
                value={metrics.totals.users}
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Process Memory</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Heap Used', value: `${metrics.system.heapUsedMb} MB` },
                  { label: 'Heap Total', value: `${metrics.system.heapTotalMb} MB` },
                  { label: 'RSS', value: `${metrics.system.rssMb} MB` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-lg font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
              {/* Heap usage bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Heap utilization</span>
                  <span>{Math.round((metrics.system.heapUsedMb / metrics.system.heapTotalMb) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min((metrics.system.heapUsedMb / metrics.system.heapTotalMb) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-right">
            Metrics collected at {new Date(metrics.collectedAt).toLocaleTimeString()}
          </p>
        </>
      )}

      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
