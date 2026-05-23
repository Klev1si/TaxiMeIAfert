import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type FraudEventType =
  | 'concurrent_ride_attempt'
  | 'gps_spoof_detected'
  | 'otp_lockout'
  | 'promo_abuse';

interface FraudEvent {
  id:        string;
  type:      FraudEventType;
  userId:    string | null;
  driverId:  string | null;
  rideId:    string | null;
  metadata:  Record<string, unknown> | null;
  createdAt: string;
}

interface FraudResponse {
  events: FraudEvent[];
  total:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<FraudEventType, { label: string; badge: string; icon: string }> = {
  concurrent_ride_attempt: { label: 'Duplicate Ride',  badge: 'bg-orange-100 text-orange-800', icon: '🚕' },
  gps_spoof_detected:      { label: 'GPS Spoof',       badge: 'bg-red-100 text-red-800',       icon: '📡' },
  otp_lockout:             { label: 'OTP Lockout',     badge: 'bg-purple-100 text-purple-800', icon: '🔒' },
  promo_abuse:             { label: 'Promo Abuse',     badge: 'bg-yellow-100 text-yellow-800', icon: '🏷️' },
};

const PAGE_SIZE = 20;

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortId(id: string | null) {
  return id ? id.slice(0, 8) + '…' : '—';
}

// ── Metadata viewer ───────────────────────────────────────────────────────────

function MetadataCell({ meta }: { meta: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!meta || Object.keys(meta).length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline-offset-2 underline"
      >
        {open ? 'Hide' : 'Show'}
      </button>
      {open && (
        <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 max-w-xs overflow-x-auto text-gray-700 whitespace-pre-wrap break-all">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FraudPage() {
  const [events,      setEvents]      = useState<FraudEvent[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [page,        setPage]        = useState(1);
  const [filterType,  setFilterType]  = useState('');
  const [filterUser,  _setFilterUser]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {
        page:  String(page),
        limit: String(PAGE_SIZE),
      };
      if (filterType) params.type   = filterType;
      if (filterUser) params.userId = filterUser;

      const { data } = await apiClient.get<FraudResponse>('/admin/fraud/events', { params });
      setEvents(data.events);
      setTotal(data.total);
    } catch {
      setError('Could not load fraud events.');
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterUser]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fraud Controls</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} flagged event{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setPage(1); load(); }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TYPE_CONFIG) as [FraudEventType, typeof TYPE_CONFIG[FraudEventType]][]).map(
          ([type, cfg]) => (
            <button
              key={type}
              onClick={() => { setFilterType(filterType === type ? '' : type); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filterType === type
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
              }`}
            >
              <span>{cfg.icon}</span>
              {cfg.label}
            </button>
          ),
        )}
        {filterType && (
          <button
            onClick={() => { setFilterType(''); setPage(1); }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-400 hover:text-gray-600"
          >
            × Clear filter
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-4xl mb-3">🛡️</p>
            <p className="text-sm font-medium">No fraud events found</p>
            <p className="text-xs mt-1">The system will flag events here automatically</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ride ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map(ev => {
                const cfg = TYPE_CONFIG[ev.type] ?? { label: ev.type, badge: 'bg-gray-100 text-gray-700', icon: '⚠️' };
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
                        <span>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(ev.userId)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(ev.driverId)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{shortId(ev.rideId)}</td>
                    <td className="px-4 py-3"><MetadataCell meta={ev.metadata} /></td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400 whitespace-nowrap">{fmt(ev.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Page {page} of {totalPages} · {total} events
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
