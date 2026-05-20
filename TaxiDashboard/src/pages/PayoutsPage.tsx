import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverBalance {
  driverId:     string;
  firstName:    string;
  lastName:     string;
  vehiclePlate: string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
}

type LedgerEntryType = 'credit' | 'payout';

interface LedgerEntry {
  id:            string;
  type:          LedgerEntryType;
  amount:        number;
  rideId:        string | null;
  commissionPct: number | null;
  note:          string | null;
  createdAt:     string;
}

interface DriverWallet {
  driverId:     string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
  entries:      LedgerEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

// ── Driver detail panel ───────────────────────────────────────────────────────

function DriverWalletPanel({
  driverId,
  onClose,
  onPayoutCreated,
}: {
  driverId: string;
  onClose: () => void;
  onPayoutCreated: () => void;
}) {
  const [wallet,   setWallet]   = useState<DriverWallet | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [amount,   setAmount]   = useState('');
  const [note,     setNote]     = useState('');
  const [paying,   setPaying]   = useState(false);
  const [payError, setPayError] = useState('');

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<DriverWallet>(`/admin/drivers/${driverId}/wallet`);
      setWallet(res.data);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  const handlePayout = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setPayError('Enter a valid positive amount.'); return; }
    if (wallet && amt > wallet.balance) {
      setPayError(`Amount exceeds balance (${money(wallet.balance)}).`);
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      await apiClient.post(`/admin/drivers/${driverId}/payout`, { amount: amt, note: note || undefined });
      setAmount('');
      setNote('');
      await loadWallet();
      onPayoutCreated();
    } catch (err: any) {
      setPayError(err?.response?.data?.message ?? 'Failed to create payout.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Driver Wallet</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        {loading || !wallet ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Balance summary */}
            <div className="px-6 py-5 bg-indigo-600 text-white">
              <p className="text-sm opacity-80 mb-1">Available Balance</p>
              <p className="text-4xl font-bold">{money(wallet.balance)}</p>
              <div className="flex gap-6 mt-3 text-sm">
                <div>
                  <span className="opacity-70">Earned </span>
                  <span className="font-semibold text-green-300">{money(wallet.totalCredits)}</span>
                </div>
                <div>
                  <span className="opacity-70">Paid out </span>
                  <span className="font-semibold text-amber-300">{money(wallet.totalPayouts)}</span>
                </div>
              </div>
            </div>

            {/* Payout form */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700 mb-2">Record a Payout</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Note (e.g. Bank transfer)"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={handlePayout}
                  disabled={paying}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {paying ? '…' : 'Pay Out'}
                </button>
              </div>
              {payError && (
                <p className="text-red-600 text-xs mt-1">{payError}</p>
              )}
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto">
              {wallet.entries.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">No transactions yet</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {wallet.entries.map(e => (
                    <li key={e.id} className="flex items-center px-6 py-3 gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.type === 'credit' ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium truncate">
                          {e.type === 'credit'
                            ? `Ride credit${e.commissionPct != null ? ` (${e.commissionPct}%)` : ''}`
                            : `Payout${e.note ? ` — ${e.note}` : ''}`}
                        </p>
                        <p className="text-xs text-gray-400">{fmt(e.createdAt)}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${e.type === 'credit' ? 'text-green-600' : 'text-amber-600'}`}>
                        {e.type === 'credit' ? '+' : '−'}{money(e.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [drivers,  setDrivers]  = useState<DriverBalance[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showAll,  setShowAll]  = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const LIMIT = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get<{ drivers: DriverBalance[]; total: number }>(
        `/admin/wallet/balances?page=${p}&limit=${LIMIT}&all=${showAll}`,
      );
      setDrivers(res.data.drivers);
      setTotal(res.data.total);
      setPage(p);
    } catch {
      setError('Failed to load wallet balances.');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Driver Payouts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Driver wallet balances and payout management
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600"
          />
          Show all drivers
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-3xl mb-2">💵</p>
            <p className="text-sm">
              {showAll ? 'No drivers with ledger entries yet' : 'No drivers with outstanding balance'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Driver</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Plate</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Total Earned</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Paid Out</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Balance</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drivers.map(d => (
                  <tr key={d.driverId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {d.firstName} {d.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{d.vehiclePlate}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-semibold">
                      {money(d.totalCredits)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600">
                      {money(d.totalPayouts)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold text-base ${d.balance > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
                        {money(d.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(d.driverId)}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        View / Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} &bull; {total} drivers
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Driver wallet slide-over panel */}
      {selected && (
        <DriverWalletPanel
          driverId={selected}
          onClose={() => setSelected(null)}
          onPayoutCreated={() => load(page)}
        />
      )}
    </div>
  );
}
