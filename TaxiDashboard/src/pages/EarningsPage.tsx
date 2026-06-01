import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

interface DriverFinance {
  driverId:          string;
  firstName:         string;
  lastName:          string;
  vehiclePlate:      string;
  cashCollected:     number;
  cashOwedToCompany: number;
  cardTotal:         number;
  cardOwedToDriver:  number;
  expensesTotal:     number;
  driverEarning:     number;
  companyEarning:    number;
  platformEarning:   number;
  effectiveCommissionPct: number;
  hasCommissionOverride:  boolean;
}

interface CompanySummary {
  cashRevenue:           number;
  cardRevenue:           number;
  totalRevenue:          number;
  cashOwedByDrivers:     number;
  cardOwedToDrivers:     number;
  cardGross:             number;
  platformFee:           number;
  cardDriverShare:       number;
  driverExpenses:        number;
  companyCommissionPct:  number;
  driverCommissionPct:   number;
  platformCommissionPct: number;
}

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'This week',  value: 'week'  },
  { label: 'This month', value: 'month' },
  { label: 'All time',   value: 'all'   },
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

// ─── Component ───────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [period,   setPeriod]   = useState<Period>('week');
  const [summary,  setSummary]  = useState<CompanySummary | null>(null);
  const [drivers,  setDrivers]  = useState<DriverFinance[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Default-commission editor (whole company)
  const [editDefault,     setEditDefault]     = useState(false);
  const [defaultInput,    setDefaultInput]    = useState('');
  const [defaultSaving,   setDefaultSaving]   = useState(false);
  const [defaultError,    setDefaultError]    = useState<string | null>(null);

  // Per-driver commission editor
  const [perDriverTarget, setPerDriverTarget] = useState<DriverFinance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, drvRes] = await Promise.all([
        apiClient.get<CompanySummary>(`/company/finances/summary?period=${period}`),
        apiClient.get<DriverFinance[]>(`/company/finances/drivers?period=${period}`),
      ]);
      setSummary(sumRes.data);
      setDrivers(drvRes.data);
    } catch {
      setError('Failed to load earnings data.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Company default commission ─────────────────────────────────────────
  const openDefaultEditor = () => {
    setDefaultInput(String(summary?.driverCommissionPct ?? 70));
    setDefaultError(null);
    setEditDefault(true);
  };
  const saveDefault = async () => {
    const pct = parseFloat(defaultInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setDefaultError('Enter a value between 0 and 100.');
      return;
    }
    setDefaultSaving(true);
    setDefaultError(null);
    try {
      await apiClient.patch('/company/commission', { driverCommissionPct: pct });
      setEditDefault(false);
      load();
    } catch {
      setDefaultError('Failed to save. Please try again.');
    } finally {
      setDefaultSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Earnings</h2>
          <p className="text-sm text-gray-500 mt-1">Revenue breakdown for your fleet</p>
        </div>
        <button
          onClick={openDefaultEditor}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          ⚙️ Set Default Commission
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
      ) : summary ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total revenue"
              value={fmt(summary.totalRevenue)}
              sub={`${drivers.length} driver${drivers.length === 1 ? '' : 's'}`}
              color="indigo"
            />
            <SummaryCard
              label="💵 Cash revenue"
              value={fmt(summary.cashRevenue)}
              sub="company share of cash"
              color="green"
            />
            <SummaryCard
              label="💳 Card revenue"
              value={fmt(summary.cardRevenue)}
              sub={`after ${summary.platformCommissionPct}% platform fee`}
              color="yellow"
            />
            <SummaryCard
              label="📋 Driver expenses"
              value={fmt(summary.driverExpenses)}
              sub="fuel, repairs, etc."
              color="slate"
            />
          </div>

          {/* Card breakdown card */}
          {summary.cardGross > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Card payment breakdown — {fmt(summary.cardGross)} gross
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>🌐 Platform fee ({summary.platformCommissionPct}%)</span>
                  <span className="font-bold text-gray-500">−{fmt(summary.platformFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>🏢 You ({summary.companyCommissionPct}% of remainder)</span>
                  <span className="font-bold text-indigo-700">+{fmt(summary.cardRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>🚗 Drivers ({summary.driverCommissionPct}% of remainder)</span>
                  <span className="font-bold text-yellow-700">+{fmt(summary.cardDriverShare)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Outstanding cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Drivers owe you</p>
              <p className="text-2xl font-extrabold text-green-900 mt-1">
                {fmt(summary.cashOwedByDrivers)}
              </p>
              <p className="text-xs text-green-600 mt-0.5">cash to collect</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">You owe drivers</p>
              <p className="text-2xl font-extrabold text-yellow-900 mt-1">
                {fmt(summary.cardOwedToDrivers)}
              </p>
              <p className="text-xs text-yellow-600 mt-0.5">card share to pay</p>
            </div>
          </div>

          {/* Commission callout */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-800">
                Default commission: drivers keep <span className="text-lg">{summary.driverCommissionPct}%</span>,
                you keep <span className="text-lg">{summary.companyCommissionPct}%</span>
              </p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Click ✏️ on any driver row to give them a custom rate.
              </p>
            </div>
            <button
              onClick={openDefaultEditor}
              className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
            >
              Change
            </button>
          </div>

          {/* Per-driver table */}
          {drivers.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
              <p className="text-4xl mb-3">💰</p>
              <p className="text-gray-600 font-medium">No earnings data yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Earnings appear here once drivers complete rides with fares.
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
                      <th className="px-4 py-3 text-left">Driver</th>
                      <th className="px-4 py-3 text-center">Comm %</th>
                      <th className="px-4 py-3 text-right">🚗 Driver</th>
                      <th className="px-4 py-3 text-right">🏢 You</th>
                      <th className="px-4 py-3 text-right">🌐 Platform</th>
                      <th className="px-4 py-3 text-right">Cash owed</th>
                      <th className="px-4 py-3 text-right">Card owed</th>
                      <th className="px-4 py-3 text-right">Expenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drivers.map(row => (
                      <tr key={row.driverId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{row.firstName} {row.lastName}</div>
                          <div className="font-mono text-xs text-gray-400">{row.vehiclePlate}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setPerDriverTarget(row)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                              row.hasCommissionOverride
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            ✏️ {row.effectiveCommissionPct}%
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-block bg-yellow-100 text-yellow-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                            {fmt(row.driverEarning)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-block bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-md tabular-nums">
                            {fmt(row.companyEarning)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                          {fmt(row.platformEarning)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-700 font-semibold tabular-nums">
                          {fmt(row.cashOwedToCompany)}
                        </td>
                        <td className="px-4 py-3 text-right text-yellow-700 font-semibold tabular-nums">
                          {fmt(row.cardOwedToDriver)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                          {row.expensesTotal > 0 ? fmt(row.expensesTotal) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Default-commission modal */}
      {editDefault && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Set default commission</h3>
            <p className="text-sm text-gray-500 mb-5">
              Applies to all drivers who don't have a custom override.
            </p>

            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Driver share %
            </label>
            <div className="flex items-center gap-2 mb-1">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={defaultInput}
                onChange={e => setDefaultInput(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. 70"
              />
              <span className="text-gray-500 font-bold text-sm">%</span>
            </div>

            {defaultInput !== '' && !isNaN(parseFloat(defaultInput)) && (
              <p className="text-xs text-gray-400 mb-4">
                Drivers keep <strong>{parseFloat(defaultInput).toFixed(1)}%</strong> →
                Company keeps <strong>{(100 - parseFloat(defaultInput)).toFixed(1)}%</strong>
              </p>
            )}

            {defaultError && (
              <p className="text-sm text-red-600 mb-4">{defaultError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setEditDefault(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
                disabled={defaultSaving}
              >
                Cancel
              </button>
              <button
                onClick={saveDefault}
                disabled={defaultSaving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
              >
                {defaultSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-driver commission modal */}
      {perDriverTarget && summary && (
        <PerDriverCommissionModal
          driver={perDriverTarget}
          companyDefaultPct={summary.driverCommissionPct}
          onClose={() => setPerDriverTarget(null)}
          onDone={() => { setPerDriverTarget(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Per-driver commission modal ─────────────────────────────────────────────
function PerDriverCommissionModal({
  driver, companyDefaultPct, onClose, onDone,
}: {
  driver: DriverFinance;
  companyDefaultPct: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [input,   setInput]   = useState(String(driver.effectiveCommissionPct));
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  const save = async (clear = false) => {
    if (!clear) {
      const n = parseFloat(input);
      if (isNaN(n) || n < 0 || n > 100) {
        setErr('Enter a value between 0 and 100.');
        return;
      }
    }
    setSaving(true);
    setErr(null);
    try {
      await apiClient.patch(`/company/finances/drivers/${driver.driverId}/commission`, {
        pct: clear ? null : parseFloat(input),
      });
      onDone();
    } catch {
      setErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Edit commission</h3>
        <p className="text-sm text-gray-500">
          {driver.firstName} {driver.lastName} · <span className="font-mono">{driver.vehiclePlate}</span>
        </p>
        <p className="text-xs text-gray-400 mb-5">
          Company default: {companyDefaultPct}%
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
          Driver's share (0–100)
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <span className="text-gray-500 font-bold text-sm">%</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          The remainder goes to you. Platform fee (10%) is taken from card rides before this split.
        </p>

        {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {driver.hasCommissionOverride && (
          <button
            onClick={() => save(true)}
            disabled={saving}
            className="w-full mt-3 text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-60"
          >
            Revert to company default ({companyDefaultPct}%)
          </button>
        )}
      </div>
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
