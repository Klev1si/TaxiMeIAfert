import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

type BillingPeriod = 'monthly' | 'quarterly' | 'yearly';
type SubStatus     = 'active' | 'pending' | 'trialing' | 'past_due' | 'cancelled';
type PaymentMethod = 'card' | 'cash';
type SubState      = 'inactive' | 'active' | 'grace' | 'blocked';

interface Plan {
  id: string;
  name: string;
  price: number | string;
  billingPeriod: BillingPeriod;
  maxDrivers: number;
  features: string[];
  isActive: boolean;
}

interface CompanySubscription {
  id: string;
  planId: string;
  status: SubStatus;
  paymentMethod: PaymentMethod;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  plan: Plan;
  state?: SubState;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number | string) { return `€${Number(n).toFixed(2)}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function periodLabel(p: BillingPeriod) {
  return p === 'monthly' ? '/mo' : p === 'quarterly' ? '/3mo' : '/yr';
}

const STATUS_META: Record<SubStatus, { label: string; cls: string }> = {
  active:    { label: '● Active',     cls: 'text-green-600 bg-green-50 border-green-200' },
  pending:   { label: '⏳ Awaiting',   cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  trialing:  { label: '○ Trial',       cls: 'text-blue-600  bg-blue-50  border-blue-200'  },
  past_due:  { label: '⚠ Past Due',    cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  cancelled: { label: '✕ Cancelled',   cls: 'text-red-600   bg-red-50   border-red-200'   },
};

// ── State banner (grace / blocked) ────────────────────────────────────────────

function StateBanner({ state, periodEnd }: { state: SubState; periodEnd: string }) {
  if (state === 'grace') {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-5 py-3 mb-5 text-sm">
        ⚠ Your subscription expired on <strong>{fmtDate(periodEnd)}</strong>. You're in a 3-day grace period — renew now to avoid losing access.
      </div>
    );
  }
  if (state === 'blocked') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 mb-5 text-sm">
        ⛔ Your subscription is blocked. Renew to start accepting rides again.
      </div>
    );
  }
  return null;
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan, isCurrent, onPickCard, onPickCash, busy,
}: {
  plan: Plan;
  isCurrent: boolean;
  onPickCard: (planId: string) => void;
  onPickCash: (planId: string) => void;
  busy: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 flex flex-col gap-4 transition-all ${
      isCurrent ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300'
    }`}>
      {isCurrent && (
        <span className="self-start bg-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
          Current Plan
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">
            {plan.billingPeriod === 'quarterly' ? '3-month' : plan.billingPeriod} billing
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-2xl font-extrabold text-gray-900">{fmtPrice(plan.price)}</span>
          <span className="text-xs text-gray-400">{periodLabel(plan.billingPeriod)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-2">Up to <strong>{plan.maxDrivers}</strong> drivers</p>

      <div className="border-t border-gray-100" />

      {plan.features.length > 0 && (
        <ul className="space-y-2 flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="text-green-500 font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onPickCard(plan.id)}
          disabled={busy}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-60"
        >
          Pay with card
        </button>
        <button
          onClick={() => onPickCash(plan.id)}
          disabled={busy}
          className="border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-sm font-bold rounded-xl py-2.5 disabled:opacity-60"
        >
          Pay in cash
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [sub,     setSub]     = useState<CompanySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [plansRes, subRes] = await Promise.all([
        apiClient.get<Plan[]>('/subscriptions/plans?audience=company'),
        apiClient.get<CompanySubscription | null>('/subscriptions/my'),
      ]);
      setPlans(plansRes.data);
      setSub(subRes.data);
    } catch {
      setError('Could not load subscription data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCard = async (planId: string) => {
    setBusyPlan(planId);
    try {
      const { data } = await apiClient.post<{ url: string }>('/subscriptions/checkout', { planId });
      window.location.href = data.url;
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Could not start card payment.');
      setBusyPlan(null);
    }
  };

  const handleCash = async (planId: string) => {
    if (!confirm('Request a cash payment? Your subscription will activate once the admin confirms receipt.')) return;
    setBusyPlan(planId);
    try {
      await apiClient.post('/subscriptions/cash-request', { planId });
      showToast('Cash payment requested — admin will confirm.');
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Could not request cash payment.');
    } finally {
      setBusyPlan(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? Your plan stays active until the end of the billing period.')) return;
    try {
      await apiClient.post('/subscriptions/cancel');
      showToast('Subscription cancelled.');
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Could not cancel.');
    }
  };

  const currentPlanId = sub && sub.status !== 'cancelled' ? sub.planId : null;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Subscription</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pick a plan and pay by card (Paysera) or request a cash payment.
        </p>
      </div>

      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {sub?.state && sub.state !== 'active' && sub.state !== 'inactive' && (
            <StateBanner state={sub.state} periodEnd={sub.currentPeriodEnd} />
          )}

          {sub && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{sub.plan?.name ?? 'Subscription'}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {sub.plan ? `Up to ${sub.plan.maxDrivers} drivers` : ''}
                  </p>
                </div>
                {sub.plan && (
                  <div className="text-right shrink-0">
                    <span className="text-3xl font-extrabold text-gray-900">{fmtPrice(sub.plan.price)}</span>
                    <span className="text-sm text-gray-400">{periodLabel(sub.plan.billingPeriod)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_META[sub.status].cls}`}>
                  {STATUS_META[sub.status].label}
                </span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded ${
                  sub.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {sub.paymentMethod === 'cash' ? '💵 Cash' : '💳 Card'}
                </span>
                <span className="text-sm text-gray-500">
                  {sub.status === 'cancelled'
                    ? `Cancelled on ${sub.cancelledAt ? fmtDate(sub.cancelledAt) : '—'}`
                    : `Renews on ${fmtDate(sub.currentPeriodEnd)}`}
                </span>
              </div>

              {sub.status !== 'cancelled' && sub.status !== 'pending' && (
                <button
                  onClick={handleCancel}
                  className="text-sm font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-4 py-2 transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
              {sub.status === 'pending' && sub.paymentMethod === 'cash' && (
                <p className="text-xs text-gray-500 italic">
                  Your cash payment is pending — the subscription will activate once the admin confirms it.
                </p>
              )}
            </div>
          )}

          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            {sub ? 'Available Plans' : 'Choose a Plan'}
          </p>

          {plans.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-600 font-medium">No plans available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={plan.id === currentPlanId}
                  onPickCard={handleCard}
                  onPickCash={handleCash}
                  busy={busyPlan === plan.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
