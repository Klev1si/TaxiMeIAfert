import { useEffect, useState, useCallback, useRef } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import type { Variant } from '../components/StatusBadge';

type RideStatus = 'all' | 'requested' | 'accepted' | 'driving_to_pickup' | 'in_progress' | 'completed' | 'cancelled';

const ACTIVE_STATUSES = new Set(['accepted', 'driving_to_pickup', 'in_progress']);

interface Ride {
  id: string;
  status: string;
  clientId: string;
  driverId: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  paymentStatus: string;
  cancelReason: string | null;
  driverRating: number | null;
  totalFare: number | null;
  discountAmount: number | null;
  promoCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface ChatMessage {
  rideId: string;
  text: string;
  fromRole: 'driver' | 'client';
  ts: number;
}

interface ChatData {
  rideId: string;
  status: string;
  messages: ChatMessage[];
}

const STATUS_OPTIONS: { value: RideStatus; label: string }[] = [
  { value: 'all',               label: 'All' },
  { value: 'requested',         label: 'Requested' },
  { value: 'accepted',          label: 'Accepted' },
  { value: 'driving_to_pickup', label: 'En Route' },
  { value: 'in_progress',       label: 'In Progress' },
  { value: 'completed',         label: 'Completed' },
  { value: 'cancelled',         label: 'Cancelled' },
];

function rideStatusVariant(status: string): Variant {
  switch (status) {
    case 'completed':         return 'green';
    case 'cancelled':         return 'red';
    case 'in_progress':       return 'indigo';
    case 'driving_to_pickup':
    case 'accepted':          return 'blue';
    default:                  return 'yellow';
  }
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LIMIT = 20;
const CHAT_POLL_MS = 4000; // refresh chat every 4 s during active rides

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ ride, onClose }: { ride: Ride; onClose: () => void }) {
  const [chat,    setChat]    = useState<ChatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChat = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ChatData>(`/company/rides/${ride.id}/chat`);
      setChat(data);
      setError('');
    } catch {
      setError('Could not load chat.');
    } finally {
      setLoading(false);
    }
  }, [ride.id]);

  useEffect(() => {
    fetchChat();
    // Poll only while the ride is active
    if (ACTIVE_STATUSES.has(ride.status)) {
      pollRef.current = setInterval(fetchChat, CHAT_POLL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchChat, ride.status]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages.length]);

  const isActive = ACTIVE_STATUSES.has(ride.status);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Dimmed backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900">Ride Chat</h3>
              {isActive && (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[260px]">{ride.id}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {ride.pickupAddress ?? '—'} → {ride.dropoffAddress ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="flex justify-center pt-10">
              <div className="w-7 h-7 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-center text-sm text-red-500 pt-10">{error}</p>
          ) : !chat || chat.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-16 text-gray-400">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-sm font-medium">No messages yet</p>
              {isActive && (
                <p className="text-xs mt-1 text-center">Messages will appear here as the driver and client chat.</p>
              )}
            </div>
          ) : (
            chat.messages.map((msg, i) => {
              const isDriver = msg.fromRole === 'driver';
              return (
                <div key={i} className={`flex flex-col gap-1 ${isDriver ? 'items-start' : 'items-end'}`}>
                  <span className="text-xs text-gray-400 px-1">
                    {isDriver ? '🚗 Driver' : '👤 Client'} · {fmtTime(msg.ts)}
                  </span>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isDriver
                      ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                      : 'bg-indigo-600 text-white rounded-tr-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-white shrink-0">
          {isActive ? (
            <p className="text-xs text-center text-gray-400">
              Read-only view · Refreshes every {CHAT_POLL_MS / 1000}s · {chat?.messages.length ?? 0} message(s)
            </p>
          ) : (
            <p className="text-xs text-center text-gray-400">
              Ride ended · Chat history stored for 24 h · {chat?.messages.length ?? 0} message(s)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RidesPage() {
  const { user } = useAuthStore();
  const isAdmin  = user?.role === 'super_admin';

  const [status,  setStatus]  = useState<RideStatus>('all');
  const [rides,   setRides]   = useState<Ride[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  // Chat panel state — company only
  const [chatRide, setChatRide] = useState<Ride | null>(null);

  const fetchRides = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/admin/rides' : '/company/rides';
      const { data } = await apiClient.get<{ rides: Ride[]; total: number }>(endpoint, {
        params: { status, page: p, limit: LIMIT },
      });
      setRides(data.rides);
      setTotal(data.total);
    } catch {
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [status, isAdmin]);

  useEffect(() => { setPage(1); fetchRides(1); }, [status, fetchRides]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Rides</h2>
        <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-medium ${
              status === opt.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-3xl mb-2">📍</p>
            <p className="text-sm">No rides found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Pickup</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Dropoff</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Fare</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Payment</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Rating</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Cancel Reason</th>
                {!isAdmin && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Chat</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rides.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString()}<br />
                    <span className="text-gray-400">
                      {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={r.status.replace(/_/g, ' ')}
                      variant={rideStatusVariant(r.status)}
                    />
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-gray-800 truncate" title={r.pickupAddress ?? ''}>
                      {r.pickupAddress ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <p className="text-gray-800 truncate" title={r.dropoffAddress ?? ''}>{r.dropoffAddress ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {r.totalFare != null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-gray-900">${Number(r.totalFare).toFixed(2)}</span>
                        {r.promoCode && r.discountAmount != null && (
                          <span className="text-xs text-green-600 font-medium">
                            🏷️ {r.promoCode} −${Number(r.discountAmount).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={r.paymentStatus}
                      variant={r.paymentStatus === 'paid' ? 'green' : 'gray'}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.driverRating != null ? `⭐ ${r.driverRating}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px]">
                    <p className="truncate italic" title={r.cancelReason ?? ''}>{r.cancelReason ?? '—'}</p>
                  </td>
                  {!isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setChatRide(r)}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                          ACTIVE_STATUSES.has(r.status)
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                            : 'border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                        }`}
                        title={ACTIVE_STATUSES.has(r.status) ? 'View live chat' : 'View chat history'}
                      >
                        💬
                        {ACTIVE_STATUSES.has(r.status) && (
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} limit={LIMIT} onChange={p => { setPage(p); fetchRides(p); }} />

      {/* Chat panel — company only, slide in from right */}
      {chatRide && !isAdmin && (
        <ChatPanel ride={chatRide} onClose={() => setChatRide(null)} />
      )}
    </div>
  );
}
