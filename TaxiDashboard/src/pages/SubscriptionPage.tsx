import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  maxDrivers: number;
  features: string[];
  isActive: boolean;
}

type SubStatus = 'active' | 'trialing' | 'past_due' | 'cancelled';

interface CompanySubscription {
  id: string;
  planId: string;
  status: SubStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  plan: Plan;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_META: Record<SubStatus, { label: string; cls: string }> = {
  active:    { label: '● Active',    cls: 'text-green-600 bg-green-50 border-green-200' },
  trialing:  { label: '○ Trial',     cls: 'text-blue-600  bg-blue-50  border-blue-200'  },
  past_due:  { label: '⚠ Past Due',  cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  cancelled: { label: '✕ Cancelled', cls: 'text-red-600   bg-red-50   border-red-200'   },
};

// ── Current Plan Banner ───────────────────────────────────────────────────────

function CurrentPlanBanner({
  sub,
  onCancel,
  cancelling,
}: {
  sub: CompanySubscription;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const meta = STATUS_META[sub.status];
  const isCancelled = sub.status === 'cancelled';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{sub.plan.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">Up to {sub.plan.maxDrivers} drivers</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-3xl font-extrabold text-gray-900">
            {fmtPrice(sub.plan.priceMonthly)}
          </span>
          <span className="text-sm text-gray-400">/mo</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${meta.cls}`}>
          {meta.label}
        </span>
        <span className="text-sm text-gray-500">
          {isCancelled
            ? `Cancelled on ${sub.cancelledAt ? fmtDate(sub.cancelledAt) : '—'}`
            : `Renews on ${fmtDate(sub.currentPeriodEnd)}`}
        </span>
      </div>

      {sub.plan.features.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-5">
          {sub.plan.features.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1">
              <span className="text-green-500 font-bold text-xs">✓</span> {f}
            </li>
          ))}
        </ul>
      )}

      {!isCancelled && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="text-sm font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel Subscription'}
        </button>
      )}
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onSelect,
  loading,
}: {
  plan: Plan;
  isCurrent: boolean;
  onSelect: () => void;
  loading: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 flex flex-col gap-4 transition-all ${
      isCurrent
        ? 'border-indigo-500 ring-2 ring-indigo-200'
        : 'border-gray-200 hover:border-indigo-300'
    }`}>
      {isCurrent && (
        <span className="self-start bg-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
          Current Plan
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
        <div className="text-right shrink-0">
          <span className="text-2xl font-extrabold text-gray-900">{fmtPrice(plan.priceMonthly)}</span>
          <span className="text-xs text-gray-400">/mo</span>
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

      <button
        onClick={onSelect}
        disabled={isCurrent || loading}
        className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
          isCurrent
            ? 'border border-indigo-300 text-indigo-500 cursor-default'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </span>
        ) : isCurrent ? 'Current Plan' : 'Select Plan'}
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [sub,     setSub]     = useState<CompanySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [cancelling,    setCancelling]    = useState(false);

  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [plansRes, subRes] = await Promise.all([
        apiClient.get<Plan[]>('/subscriptions/plans'),
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

  const handleSelect = async (plan: Plan) => {
    const isSwitch = sub && sub.status !== 'cancelled' && sub.planId !== plan.id;
    const msg = isSwitch
      ? `Switch to the "${plan.name}" plan for ${fmtPrice(plan.priceMonthly)}/mo?`
      : `Subscribe to the "${plan.name}" plan for ${fmtPrice(plan.priceMonthly)}/mo?\n\nYou'll start with a 30-day free trial.`;

    if (!confirm(msg)) return;

    setSubscribingId(plan.id);
    try {
      const { data } = await apiClient.post<CompanySubscription>('/subscriptions/subscribe', { planId: plan.id });
      setSub(data);
      showToast(isSwitch ? '✓ Plan switched successfully!' : '✓ Trial started! Welcome aboard.');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Could not subscribe. Please try again.');
    } finally {
      setSubscribingId(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription?\nYour plan stays active until the end of the billing period.')) return;
    setCancelling(true);
    try {
      const { data } = await apiClient.post<CompanySubscription>('/subscriptions/cancel');
      setSub(data);
      showToast('Subscription cancelled.');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Could not cancel.');
    } finally {
      setCancelling(false);
    }
  };

  const currentPlanId =
    sub && sub.status !== 'cancelled' ? sub.planId : null;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Subscription</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose the plan that fits your fleet size and needs.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-green-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Current plan */}
          {sub && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Your Plan</p>
              <CurrentPlanBanner sub={sub} onCancel={handleCancel} cancelling={cancelling} />
            </>
          )}

          {/* Available plans */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            {sub ? 'Available Plans' : 'Choose a Plan'}
          </p>

          {plans.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-600 font-medium">No plans available yet</p>
              <p className="text-gray-400 text-sm mt-1">Contact support to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={plan.id === currentPlanId}
                  onSelect={() => handleSelect(plan)}
                  loading={subscribingId === plan.id}
                />
              ))}
            </div>
          )}

          {/* Trial note */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
            <p className="text-sm text-blue-700">
              🔒 All new subscriptions include a <strong>30-day free trial</strong>.
              No payment required until the trial ends.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
