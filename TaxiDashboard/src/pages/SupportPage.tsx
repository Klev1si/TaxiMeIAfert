import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type TicketCategory =
  | 'ride_issue' | 'payment' | 'account'
  | 'driver_behavior' | 'app_bug' | 'other';

interface TicketSummary {
  id:           string;
  userId:       string;
  userRole:     string;
  category:     TicketCategory;
  subject:      string;
  status:       TicketStatus;
  priority:     TicketPriority;
  rideId:       string | null;
  createdAt:    string;
  updatedAt:    string;
  messageCount: number;
}

interface SupportMessage {
  id:         string;
  authorId:   string;
  authorRole: 'user' | 'admin';
  body:       string;
  createdAt:  string;
}

interface TicketDetail extends TicketSummary {
  messages: SupportMessage[];
}

// ── API helpers ───────────────────────────────────────────────────────────────

const supportAdminApi = {
  // API returns { tickets: [...], total: number }
  getTickets: (params: Record<string, string>) =>
    apiClient
      .get<{ tickets: TicketSummary[]; total: number }>('/admin/support/tickets', { params })
      .then(r => r.data.tickets),
  getTicket: (id: string) =>
    apiClient
      .get<TicketDetail>(`/admin/support/tickets/${id}`)
      .then(r => r.data),
  updateTicket: (id: string, body: { status?: TicketStatus; priority?: TicketPriority }) =>
    apiClient
      .patch<TicketDetail>(`/admin/support/tickets/${id}`, body)
      .then(r => r.data),
  addMessage: (id: string, body: string) =>
    apiClient
      .post<SupportMessage>(`/admin/support/tickets/${id}/messages`, { body })
      .then(r => r.data),
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  resolved:    'bg-green-100 text-green-800',
  closed:      'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'bg-slate-100 text-slate-600',
  normal: 'bg-blue-50 text-blue-600',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  ride_issue:      '🚗 Ride Issue',
  payment:         '💳 Payment',
  account:         '👤 Account',
  driver_behavior: '🚨 Driver Behaviour',
  app_bug:         '🐛 App Bug',
  other:           '❓ Other',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Ticket Detail Panel ───────────────────────────────────────────────────────

function TicketPanel({
  ticketId,
  onClose,
  onUpdated,
}: {
  ticketId:  string;
  onClose:   () => void;
  onUpdated: (t: Partial<TicketSummary> & { id: string }) => void;
}) {
  const [ticket,  setTicket]  = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply,   setReply]   = useState('');
  const [sending, setSending] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await supportAdminApi.getTicket(ticketId);
      setTicket(data);
    } catch {
      setError('Could not load ticket.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (ticket) {
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [ticket?.messages.length]);

  const handleStatusChange = async (status: TicketStatus) => {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await supportAdminApi.updateTicket(ticket.id, { status });
      setTicket(updated);
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  };

  const handlePriorityChange = async (priority: TicketPriority) => {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await supportAdminApi.updateTicket(ticket.id, { priority });
      setTicket(updated);
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!ticket || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await supportAdminApi.addMessage(ticket.id, reply.trim());
      setReply('');
      const newStatus: TicketStatus = ticket.status === 'open' ? 'in_progress' : ticket.status;
      setTicket(prev => prev
        ? { ...prev, messages: [...prev.messages, msg], status: newStatus }
        : prev,
      );
      // Keep the list row in sync
      onUpdated({ ...ticket, status: newStatus, messageCount: ticket.messages.length + 1 });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm">{error || 'Not found'}</div>
    );
  }

  const isClosed = ticket.status === 'closed';

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200 shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          <p className="font-semibold text-gray-900 truncate">{ticket.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {CATEGORY_LABELS[ticket.category]} · {ticket.userRole} · #{ticket.id.slice(0, 8)}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      {/* Controls */}
      <div className="flex gap-3 px-4 py-3 border-b border-gray-100 shrink-0 flex-wrap">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
          <select
            value={ticket.status}
            onChange={e => handleStatusChange(e.target.value as TicketStatus)}
            disabled={saving}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
          <select
            value={ticket.priority}
            onChange={e => handlePriorityChange(e.target.value as TicketPriority)}
            disabled={saving}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {PRIORITY_OPTIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">Created</p>
          <p className="text-xs font-medium text-gray-600">{fmt(ticket.createdAt)}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {ticket.messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 pt-8">No messages yet.</p>
        ) : (
          ticket.messages.map(msg => {
            const isAdmin = msg.authorRole === 'admin';
            return (
              <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                    isAdmin
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  {!isAdmin && (
                    <p className={`text-xs font-semibold mb-1 ${isAdmin ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {ticket.userRole === 'driver' ? '🚗 Driver' : '👤 Client'}
                    </p>
                  )}
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <p className={`text-xs mt-1.5 ${isAdmin ? 'text-indigo-200 text-right' : 'text-gray-400'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' '}
                    {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={msgEndRef} />
      </div>

      {/* Reply bar */}
      {isClosed ? (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-400 italic shrink-0">
          This ticket is closed.
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            maxLength={3000}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendReply();
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">{reply.length}/3000 · Ctrl+Enter to send</span>
            <button
              onClick={handleSendReply}
              disabled={!reply.trim() || sending}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [tickets,    setTickets]    = useState<TicketSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [selected,   setSelected]   = useState<string | null>(null);

  // Filters
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterUserRole, setFilterUserRole] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterStatus)   params.status   = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterCategory) params.category = filterCategory;
      if (filterUserRole) params.userRole = filterUserRole;
      const data = await supportAdminApi.getTickets(params);
      setTickets(data);
    } catch {
      setError('Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterCategory, filterUserRole]);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = (updated: Partial<TicketSummary> & { id: string }) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  };

  return (
    <div className="flex h-full gap-0 -m-6">
      {/* ── Left: ticket list ────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-200 ${selected ? 'w-[55%]' : 'w-full'}`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Support Tickets</h1>
            <button
              onClick={load}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>

            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Categories</option>
              {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>

            <select
              value={filterUserRole}
              onChange={e => setFilterUserRole(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">All Users</option>
              <option value="client">Client</option>
              <option value="driver">Driver</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-center text-red-500 text-sm py-10">{error}</p>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-4xl mb-3">🎫</p>
              <p className="text-sm font-medium">No tickets found</p>
              <p className="text-xs mt-1">Try adjusting the filters above</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Msgs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t.id === selected ? null : t.id)}
                    className={`cursor-pointer transition-colors ${
                      t.id === selected
                        ? 'bg-indigo-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[220px]">{t.subject}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABELS[t.category]}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-medium text-gray-600 capitalize">{t.userRole}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status]}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmt(t.updatedAt)}</td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-gray-500">{t.messageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right: ticket detail panel ───────────────────────────── */}
      {selected && (
        <div className="w-[45%] flex flex-col border-l border-gray-200 bg-gray-50">
          <TicketPanel
            key={selected}
            ticketId={selected}
            onClose={() => setSelected(null)}
            onUpdated={handleUpdated}
          />
        </div>
      )}
    </div>
  );
}
