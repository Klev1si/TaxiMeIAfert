import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

interface DriverRow {
  driverId:     string;
  firstName:    string | null;
  lastName:     string | null;
  rides:        number;
  totalFare:    number;
  driverShare:  number;
  companyShare: number;
}

interface EarningsSummary {
  rides:        number;
  totalFare:    number;
  driverShare:  number;
  companyShare: number;
}

interface EarningsResponse {
  period:        string;
  commissionPct: number;
  summary:       EarningsSummary;
  perDriver:     DriverRow[];
}

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All time',   value: 'all'   },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [period,      setPeriod]      = useState<Period>('week');
  const [data,        setData]        = useState<EarningsResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // Commission editor
  const [editComm,    setEditComm]    = useState(false);
  const [commInput,   setCommInput]   = useState('');
  const [commSaving,  setCommSaving]  = useState(false);
  const [commError,   setCommError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<EarningsResponse>(`/company/earnings?period=${period}`);
      setData(res.data);
    } catch {
      setError('Failed to load earnings data.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const openCommEditor = () => {
    setCommInput(String(data?.commissionPct ?? 70));
    setCommError(null);
    setEditComm(true);
  };

  const saveCommission = async () => {
    const pct = parseFloat(commInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setCommError('Enter a value between 0 and 100.');
      return;
    }
    setCommSaving(true);
    setCommError(null);
    try {
      await apiClient.patch('/company/commission', { driverCommissionPct: pct });
      setEditComm(false);
      load(); // re-fetch with new commission
    } catch {
      setCommError('Failed to save. Please try again.');
    } finally {
      setCommSaving(false);
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Earnings</h2>
          <p className="text-sm text-gray-500 mt-1">Revenue breakdown for your fleet</p>
        </div>
        <button
          onClick={openCommEditor}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          ⚙️ Set Commission
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

      {/* Content */}
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
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total fare"
              value={fmt(data.summary.totalFare)}
              sub={`${data.summary.rides} ride${data.summary.rides !== 1 ? 's' : ''}`}
              color="indigo"
            />
            <SummaryCard
              label={`Driver share (${data.commissionPct}%)`}
              value={fmt(data.summary.driverShare)}
              sub="paid to drivers"
              color="green"
            />
            <SummaryCard
              label={`Company share (${(100 - data.commissionPct).toFixed(0)}%)`}
              value={fmt(data.summary.companyShare)}
              sub="your revenue"
              color="yellow"
            />
            <SummaryCard
              label="Completed rides"
              value={String(data.summary.rides)}
              sub="with fare data"
              color="slate"
            />
          </div>

          {/* Commission callout */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-800">
                Current commission: drivers keep <span className="text-lg">{data.commissionPct}%</span>,
                company keeps <span className="text-lg">{(100 - data.commissionPct).toFixed(0)}%</span>
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Applies to all fares calculated from tariffs.
              </p>
            </div>
            <button
              onClick={openCommEditor}
              className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
            >
              Change
            </button>
          </div>

          {/* Per-driver table */}
          {data.perDriver.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
              <p className="text-4xl mb-3">💰</p>
              <p className="text-gray-600 font-medium">No earnings data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Earnings appear here once drivers complete rides with fares calculated from tariffs.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Per-driver breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-6 py-3 text-left">Driver</th>
                      <th className="px-6 py-3 text-right">Rides</th>
                      <th className="px-6 py-3 text-right">Total fare</th>
                      <th className="px-6 py-3 text-right">Driver share</th>
                      <th className="px-6 py-3 text-right">Company share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.perDriver.map(row => (
                      <tr key={row.driverId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {row.firstName && row.lastName
                            ? `${row.firstName} ${row.lastName}`
                            : <span className="text-gray-400 italic">Unknown driver</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">{row.rides}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">
                          {fmt(row.totalFare)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-block bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-md">
                            {fmt(row.driverShare)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-block bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-md">
                            {fmt(row.companyShare)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <tr>
                      <td className="px-6 py-3 text-gray-700">Total</td>
                      <td className="px-6 py-3 text-right text-gray-700">{data.summary.rides}</td>
                      <td className="px-6 py-3 text-right text-gray-900">{fmt(data.summary.totalFare)}</td>
                      <td className="px-6 py-3 text-right text-green-700">{fmt(data.summary.driverShare)}</td>
                      <td className="px-6 py-3 text-right text-yellow-700">{fmt(data.summary.companyShare)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Commission modal */}
      {editComm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Set Driver Commission</h3>
            <p className="text-sm text-gray-500 mb-5">
              Enter the percentage of each fare that drivers keep.
              The remainder goes to your company.
            </p>

            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Driver commission %
            </label>
            <div className="flex items-center gap-2 mb-1">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commInput}
                onChange={e => setCommInput(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. 70"
              />
              <span className="text-gray-500 font-bold text-sm">%</span>
            </div>

            {commInput !== '' && !isNaN(parseFloat(commInput)) && (
              <p className="text-xs text-gray-400 mb-4">
                Drivers keep <strong>{parseFloat(commInput).toFixed(1)}%</strong> →
                Company keeps <strong>{(100 - parseFloat(commInput)).toFixed(1)}%</strong>
              </p>
            )}

            {commError && (
              <p className="text-sm text-red-600 mb-4">{commError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setEditComm(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
                disabled={commSaving}
              >
                Cancel
              </button>
              <button
                onClick={saveCommission}
                disabled={commSaving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
              >
                {commSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub: string;
  color: 'indigo' | 'green' | 'yellow' | 'slate';
}) {
  const colorMap = {
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-900',
    green:  'bg-green-50  border-green-100  text-green-900',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-900',
    slate:  'bg-slate-50  border-slate-100  text-slate-900',
  };
  const subColor = {
    indigo: 'text-indigo-500',
    green:  'text-green-500',
    yellow: 'text-yellow-600',
    slate:  'text-slate-500',
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-2">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className={`text-xs mt-1 ${subColor[color]}`}>{sub}</p>
    </div>
  );
}
