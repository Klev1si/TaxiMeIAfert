import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

interface AdminDriverFinance {
  driverId:       string;
  firstName:      string;
  lastName:       string;
  vehiclePlate:   string;
  companyId:      string | null;
  companyName:    string | null;
  cashTotal:      number;
  cardTotal:      number;
  driverEarning:  number;
  companyEarning: number;
  platformEarning: number;
  cardDueToDriver: number;
  effectiveCommissionPct: number;
}

interface AdminCompanyFinance {
  companyId:       string;
  companyName:     string;
  driverCount:     number;
  cashTotal:       number;
  cardTotal:       number;
  driverEarning:   number;
  companyEarning:  number;
  platformEarning: number;
  cardDueToDrivers: number;
}

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All time',   value: 'all'   },
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

type Tab = 'drivers' | 'companies';

export default function PlatformFinancesPage() {
  const [tab,       setTab]       = useState<Tab>('drivers');
  const [period,    setPeriod]    = useState<Period>('week');
  const [drivers,   setDrivers]   = useState<AdminDriverFinance[]>([]);
  const [companies, setCompanies] = useState<AdminCompanyFinance[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, cRes] = await Promise.all([
        apiClient.get<AdminDriverFinance[]>(`/admin/finances/drivers?period=${period}`),
        apiClient.get<AdminCompanyFinance[]>(`/admin/finances/companies?period=${period}`),
      ]);
      setDrivers(dRes.data);
      setCompanies(cRes.data);
    } catch {
      setError('Failed to load finances.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const rows: { driverEarning: number; companyEarning: number; platformEarning: number; cardDue: number }[] = tab === 'drivers'
      ? drivers.map(d => ({
          driverEarning:   d.driverEarning,
          companyEarning:  d.companyEarning,
          platformEarning: d.platformEarning,
          cardDue:         d.cardDueToDriver,
        }))
      : companies.map(c => ({
          driverEarning:   c.driverEarning,
          companyEarning:  c.companyEarning,
          platformEarning: c.platformEarning,
          cardDue:         c.cardDueToDrivers,
        }));
    const t = { driver: 0, company: 0, platform: 0, cardDue: 0 };
    for (const r of rows) {
      t.driver   += r.driverEarning;
      t.company  += r.companyEarning;
      t.platform += r.platformEarning;
      t.cardDue  += r.cardDue;
    }
    return {
      driver:   Math.round(t.driver   * 100) / 100,
      company:  Math.round(t.company  * 100) / 100,
      platform: Math.round(t.platform * 100) / 100,
      cardDue:  Math.round(t.cardDue  * 100) / 100,
    };
  }, [tab, drivers, companies]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Platform Finances</h2>
        <p className="text-sm text-gray-500 mt-1">Cross-platform earnings: drivers, companies, and what the platform owes</p>
      </div>

      {/* Tab switch */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('drivers')}
          className={`flex-1 lg:flex-none lg:px-6 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            tab === 'drivers'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
          }`}
        >
          🚗 Drivers
        </button>
        <button
          onClick={() => setTab('companies')}
          className={`flex-1 lg:flex-none lg:px-6 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            tab === 'companies'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
          }`}
        >
          🏢 Companies
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              period === p.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={load} className="mt-3 text-sm text-indigo-600 hover:underline font-semibold">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide opacity-80 mb-2">
                Platform earnings
              </p>
              <p className="text-2xl font-extrabold text-indigo-900">{fmt(totals.platform)}</p>
              <p className="text-xs text-indigo-500 mt-1">
                10% of all card revenue
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide opacity-80 mb-2">
                Drivers earned
              </p>
              <p className="text-2xl font-extrabold text-yellow-900">{fmt(totals.driver)}</p>
              <p className="text-xs text-yellow-600 mt-1">across all drivers</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide opacity-80 mb-2">
                Companies earned
              </p>
              <p className="text-2xl font-extrabold text-green-900">{fmt(totals.company)}</p>
              <p className="text-xs text-green-600 mt-1">across all companies</p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide opacity-80 mb-2">
                💳 Platform owes
              </p>
              <p className="text-2xl font-extrabold text-orange-900">{fmt(totals.cardDue)}</p>
              <p className="text-xs text-orange-600 mt-1">card share due to drivers</p>
            </div>
          </div>

          {/* Per-driver or per-company table */}
          {tab === 'drivers' ? (
            <DriversTable rows={drivers} />
          ) : (
            <CompaniesTable rows={companies} />
          )}
        </>
      )}
    </div>
  );
}

// ── Drivers table ─────────────────────────────────────────────────────────────
function DriversTable({ rows }: { rows: AdminDriverFinance[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-gray-600 font-medium">No driver data for this period yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">All drivers · {rows.length}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Driver</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-center">Comm %</th>
              <th className="px-4 py-3 text-right">Cash</th>
              <th className="px-4 py-3 text-right">Card</th>
              <th className="px-4 py-3 text-right">🚗 Driver</th>
              <th className="px-4 py-3 text-right">🏢 Company</th>
              <th className="px-4 py-3 text-right">🌐 Platform</th>
              <th className="px-4 py-3 text-right">Platform owes (card)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.driverId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{r.firstName} {r.lastName}</div>
                  <div className="font-mono text-xs text-gray-400">{r.vehiclePlate}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {r.companyName ? `🏢 ${r.companyName}` : <span className="italic text-gray-400">👤 Solo</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-block bg-gray-100 text-gray-700 font-bold text-xs px-2 py-0.5 rounded-md">
                    {r.effectiveCommissionPct}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(r.cashTotal)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(r.cardTotal)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-yellow-100 text-yellow-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.driverEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.companyEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.platformEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-orange-700 tabular-nums">
                  {fmt(r.cardDueToDriver)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Companies table ───────────────────────────────────────────────────────────
function CompaniesTable({ rows }: { rows: AdminCompanyFinance[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
        <p className="text-4xl mb-3">🏢</p>
        <p className="text-gray-600 font-medium">No company data for this period yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">All companies · {rows.length}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-center">Drivers</th>
              <th className="px-4 py-3 text-right">Cash</th>
              <th className="px-4 py-3 text-right">Card</th>
              <th className="px-4 py-3 text-right">🚗 Drivers</th>
              <th className="px-4 py-3 text-right">🏢 Company</th>
              <th className="px-4 py-3 text-right">🌐 Platform</th>
              <th className="px-4 py-3 text-right">Platform owes drivers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.companyId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">🏢 {r.companyName}</td>
                <td className="px-4 py-3 text-center text-gray-600">{r.driverCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(r.cashTotal)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmt(r.cardTotal)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-yellow-100 text-yellow-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.driverEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-green-100 text-green-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.companyEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-block bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                    {fmt(r.platformEarning)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-orange-700 tabular-nums">
                  {fmt(r.cardDueToDrivers)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
