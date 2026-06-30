import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import SubscriptionAnalytics from '../components/SubscriptionAnalytics';

type Audience      = 'driver' | 'company';
type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
type SubStatus     = 'active' | 'pending' | 'trialing' | 'past_due' | 'cancelled';
type PaymentMethod = 'card' | 'cash';

interface Plan {
  id: string;
  name: string;
  price: number | string;
  billingPeriod: BillingPeriod;
  targetAudience: Audience;
}

interface SubRow {
  id: string;
  kind: Audience;
  planId: string;
  plan: Plan | null;
  status: SubStatus;
  paymentMethod: PaymentMethod;
  payseraOrderId: string | null;
  paidByAdminId: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  subjectId: string;
}

interface ListResp {
  rows: SubRow[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<SubStatus, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export default function SubscribersPage() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Filters
  const [audience,       setAudience]       = useState<'' | Audience>('');
  const [status,         setStatus]         = useState<'' | SubStatus>('');
  const [paymentMethod,  setPaymentMethod]  = useState<'' | PaymentMethod>('');
  const [expiringDays,   setExpiringDays]   = useState('');

  // Plans (for mark-paid plan switcher)
  const [allPlans, setAllPlans] = useState<Plan[]>([]);

  // Modal
  const [payModal,       setPayModal]       = useState<SubRow | null>(null);
  const [newPlanId,      setNewPlanId]      = useState('');
  const [newPeriodEnd,   setNewPeriodEnd]   = useState('');
  const [paymentRef,     setPaymentRef]     = useState('');
  const [saving,         setSaving]         = useState(false);
  const [modalErr,       setModalErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (audience)      params.set('audience', audience);
    if (status)        params.set('status', status);
    if (paymentMethod) params.set('paymentMethod', paymentMethod);
    if (expiringDays)  params.set('expiringInDays', expiringDays);
    try {
      const { data } = await apiClient.get<ListResp>(`/admin/subscriptions?${params}`);
      setRows(data.rows);
    } catch {
      setError('Failed to load subscriptions.');
    } finally {
      setLoading(false);
    }
  }, [audience, status, paymentMethod, expiringDays]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiClient.get<Plan[]>('/admin/plans').then(({ data }) => setAllPlans(data)).catch(() => {});
  }, []);

  const openPayModal = (row: SubRow) => {
    setPayModal(row);
    setNewPlanId(row.planId);
    setNewPeriodEnd('');
    setPaymentRef('');
    setModalErr('');
  };

  const handleMarkPaid = async () => {
    if (!payModal) return;
    setModalErr('');
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (newPlanId && newPlanId !== payModal.planId) body.newPlanId = newPlanId;
      if (newPeriodEnd) body.newPeriodEnd = new Date(newPeriodEnd).toISOString();
      if (paymentRef.trim()) body.paymentReference = paymentRef.trim();
      await apiClient.post(
        `/admin/subscriptions/${payModal.kind}/${payModal.id}/mark-paid`,
        body,
      );
      setPayModal(null);
      load();
    } catch (err: any) {
      setModalErr(err?.response?.data?.message ?? 'Could not mark as paid.');
    } finally {
      setSaving(false);
    }
  };

  // Filter the plans list shown in the modal to match this row's audience
  const planOptions = payModal
    ? allPlans.filter(p => p.targetAudience === payModal.kind)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subscribers</h2>
          <p className="text-sm text-gray-500 mt-1">All driver and company subscriptions. Mark cash payments and adjust plans here.</p>
        </div>
      </div>

      <SubscriptionAnalytics />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Audience</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            value={audience} onChange={e => setAudience(e.target.value as any)}>
            <option value="">All</option>
            <option value="driver">Drivers</option>
            <option value="company">Companies</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            value={status} onChange={e => setStatus(e.target.value as any)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Payment</label>
          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}>
            <option value="">All</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Expiring in (days)</label>
          <input type="number" min="0"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
            value={expiringDays} onChange={e => setExpiringDays(e.target.value)}
            placeholder="any" />
        </div>
        <div className="flex items-end">
          <button onClick={load}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg py-1.5">
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-gray-600 font-medium">No subscriptions match these filters</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Kind</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Period End</th>
                <th className="px-4 py-3 text-left">Paid At</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => {
                const days = daysUntil(r.currentPeriodEnd);
                return (
                  <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.kind === 'driver'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.plan?.name ?? '—'}</div>
                      {r.plan && (
                        <div className="text-xs text-gray-500">
                          €{Number(r.plan.price).toFixed(2)} / {r.plan.billingPeriod}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        r.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'
                      }`}>
                        {r.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{fmtDate(r.currentPeriodEnd)}</div>
                      <div className={`text-xs ${
                        days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'
                      }`}>
                        {days < 0 ? `${-days} days overdue` : `${days} days left`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(r.paidAt)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs font-mono truncate max-w-[180px]">
                      {r.paymentReference ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openPayModal(r)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5"
                      >
                        Mark paid / edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mark-paid modal ─────────────────────────────────────────────── */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Mark cash payment</h3>
              <button onClick={() => setPayModal(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="text-sm text-gray-600">
                <span className="font-semibold capitalize">{payModal.kind}</span> subscription —
                current plan: <span className="font-medium text-gray-900">{payModal.plan?.name}</span>
              </div>

              {modalErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{modalErr}</div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Plan</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  value={newPlanId} onChange={e => setNewPlanId(e.target.value)}>
                  {planOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — €{Number(p.price).toFixed(2)} / {p.billingPeriod}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Override new period end <span className="text-gray-400 font-normal">(optional — defaults to plan length from today)</span>
                </label>
                <input type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Payment reference / note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                  placeholder="e.g. Receipt #4501 — paid at office" />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setPayModal(null)}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleMarkPaid} disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg py-2.5">
                {saving ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
