import { useEffect, useState } from 'react';
import apiClient from '../api/client';

interface Analytics {
  mrr: number;
  arr: number;
  activeCount: number;
  audienceCounts:   { driver: number; company: number };
  statusCounts:     Record<string, number>;
  stateCounts:      { active: number; grace: number; blocked: number; inactive: number };
  paymentMix:       { card: number; cash: number };
  planMix:          Array<{ planId: string; planName: string; billingPeriod: string; count: number }>;
  revenue30d:       number;
  revenueByMonth:   Array<{ month: string; revenue: number }>;
  expiringSoon:     number;
  expiringByAudience: { driver: number; company: number };
  cancelled30d:     number;
  churnRate30d:     number;
  generatedAt:      string;
}

const fmt€ = (n: number) =>
  `€${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SubscriptionAnalytics() {
  const [data,    setData]    = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    apiClient.get<Analytics>('/admin/subscriptions/analytics')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5 flex justify-center">
        <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-5 text-sm">
        {error || 'No analytics available.'}
      </div>
    );
  }

  const maxRev = Math.max(1, ...data.revenueByMonth.map(m => m.revenue));

  return (
    <div className="mb-5 space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="MRR"           value={fmt€(data.mrr)}        sub={`ARR ${fmt€(data.arr)}`}  tone="indigo" />
        <Kpi label="Active subs"   value={String(data.activeCount)}
             sub={`${data.audienceCounts.driver} drivers · ${data.audienceCounts.company} companies`} tone="green" />
        <Kpi label="Revenue (30d)" value={fmt€(data.revenue30d)}
             sub={`${data.cancelled30d} cancelled · ${data.churnRate30d.toFixed(2)}% churn`} tone="amber" />
        <Kpi label="Expiring (7d)" value={String(data.expiringSoon)}
             sub={`${data.expiringByAudience.driver} drivers · ${data.expiringByAudience.company} companies`}
             tone={data.expiringSoon > 0 ? 'red' : 'gray'} />
      </div>

      {/* State + payment-mix + 6-month trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Subscription state</h3>
          <div className="space-y-2">
            <StateBar label="Active"  count={data.stateCounts.active}   total={data.activeCount + data.stateCounts.grace + data.stateCounts.blocked} color="bg-green-500"  />
            <StateBar label="Grace"   count={data.stateCounts.grace}    total={data.activeCount + data.stateCounts.grace + data.stateCounts.blocked} color="bg-amber-500"  />
            <StateBar label="Blocked" count={data.stateCounts.blocked}  total={data.activeCount + data.stateCounts.grace + data.stateCounts.blocked} color="bg-red-500"    />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment mix (active)</h3>
          <div className="space-y-2">
            <StateBar label="Card" count={data.paymentMix.card} total={data.paymentMix.card + data.paymentMix.cash} color="bg-indigo-500" />
            <StateBar label="Cash" count={data.paymentMix.cash} total={data.paymentMix.card + data.paymentMix.cash} color="bg-gray-500"   />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Top plans</h4>
            {data.planMix.length === 0 ? (
              <p className="text-xs text-gray-400">No active subscriptions yet.</p>
            ) : data.planMix.slice(0, 4).map(p => (
              <div key={p.planId} className="flex justify-between text-sm py-0.5">
                <span className="text-gray-700 truncate mr-2">{p.planName} · {p.billingPeriod}</span>
                <span className="font-semibold text-gray-900">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue · last 6 months</h3>
          <div className="flex items-end gap-2 h-32 mt-2">
            {data.revenueByMonth.map(m => {
              const heightPct = (m.revenue / maxRev) * 100;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] font-semibold text-gray-700">{fmt€(m.revenue)}</div>
                  <div className="w-full bg-gray-100 rounded relative" style={{ height: '100%' }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-indigo-500 rounded"
                         style={{ height: `${heightPct}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-500">{m.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'indigo' | 'green' | 'amber' | 'red' | 'gray' }) {
  const ring: Record<typeof tone, string> = {
    indigo: 'border-indigo-200 bg-indigo-50',
    green:  'border-green-200  bg-green-50',
    amber:  'border-amber-200  bg-amber-50',
    red:    'border-red-200    bg-red-50',
    gray:   'border-gray-200   bg-white',
  };
  const valColor: Record<typeof tone, string> = {
    indigo: 'text-indigo-700',
    green:  'text-green-700',
    amber:  'text-amber-700',
    red:    'text-red-700',
    gray:   'text-gray-900',
  };
  return (
    <div className={`rounded-xl border p-4 ${ring[tone]}`}>
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valColor[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function StateBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-gray-900">{count}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded">
        <div className={`h-2 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
