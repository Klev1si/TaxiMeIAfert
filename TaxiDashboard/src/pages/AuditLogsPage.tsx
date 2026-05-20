import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

interface AuditLog {
  id:         string;
  adminId:    string;
  adminPhone: string | null;
  action:     string;
  targetType: string;
  targetId:   string | null;
  metadata:   Record<string, unknown> | null;
  createdAt:  string;
}

// ── Action badge colour ───────────────────────────────────────────────────────

function actionColour(action: string): string {
  if (action.includes('approved')) return 'bg-green-100 text-green-800';
  if (action.includes('rejected')) return 'bg-red-100   text-red-800';
  if (action.includes('created'))  return 'bg-blue-100  text-blue-800';
  if (action.includes('updated'))  return 'bg-yellow-100 text-yellow-800';
  if (action.includes('deleted'))  return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-700';
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Filters
  const [filterAction,     setFilterAction]     = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');
  const [filterFrom,       setFilterFrom]       = useState('');
  const [filterTo,         setFilterTo]         = useState('');

  // Expanded row for metadata
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const LIMIT = 50;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: String(LIMIT),
      });
      if (filterAction)     params.set('action',     filterAction);
      if (filterTargetType) params.set('targetType', filterTargetType);
      if (filterFrom)       params.set('from',       filterFrom);
      if (filterTo)         params.set('to',         filterTo);

      const res = await apiClient.get<{ logs: AuditLog[]; total: number }>(
        `/admin/audit-logs?${params.toString()}`,
      );
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPage(p);
    } catch {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterTargetType, filterFrom, filterTo]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Logs</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Immutable record of every significant admin action
          </p>
        </div>
        <span className="text-sm text-gray-400">{total.toLocaleString()} entries</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Action prefix</label>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All actions</option>
              <option value="driver">driver.*</option>
              <option value="document">document.*</option>
              <option value="company">company.*</option>
              <option value="tariff">tariff.*</option>
              <option value="promo">promo.*</option>
              <option value="plan">plan.*</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target type</label>
            <select
              value={filterTargetType}
              onChange={e => setFilterTargetType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All types</option>
              <option value="driver">driver</option>
              <option value="document">document</option>
              <option value="company">company</option>
              <option value="tariff">tariff</option>
              <option value="promo">promo</option>
              <option value="plan">plan</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input
              type="datetime-local"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input
              type="datetime-local"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => load(1)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setFilterAction('');
              setFilterTargetType('');
              setFilterFrom('');
              setFilterTo('');
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
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
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No audit log entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Timestamp</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Admin</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Target</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <>
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">
                        {fmt(log.createdAt)}
                      </td>

                      {/* Admin */}
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-medium">
                          {log.adminPhone ?? '—'}
                        </div>
                        <div className="text-gray-400 text-xs font-mono truncate max-w-[140px]">
                          {log.adminId}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${actionColour(log.action)}`}>
                          {log.action}
                        </span>
                      </td>

                      {/* Target */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-700 capitalize">{log.targetType}</span>
                        {log.targetId && (
                          <div className="text-gray-400 text-xs font-mono truncate max-w-[140px]">
                            {log.targetId}
                          </div>
                        )}
                      </td>

                      {/* Expand toggle */}
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {log.metadata
                          ? <span className="text-indigo-500 hover:underline">
                              {expandedId === log.id ? '▲ hide' : '▼ show'}
                            </span>
                          : <span>—</span>
                        }
                      </td>
                    </tr>

                    {/* Expanded metadata row */}
                    {expandedId === log.id && log.metadata && (
                      <tr key={`${log.id}-meta`} className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
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
            Page {page} of {totalPages} &bull; {total.toLocaleString()} total entries
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
