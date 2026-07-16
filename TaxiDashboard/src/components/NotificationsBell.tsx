import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string | null> | null;
  isRead: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ROLE_BADGES: Record<string, { label: string; classes: string }> = {
  client:  { label: 'Passenger', classes: 'bg-blue-100 text-blue-700' },
  driver:  { label: 'Driver',    classes: 'bg-amber-100 text-amber-700' },
  company: { label: 'Company',   classes: 'bg-purple-100 text-purple-700' },
};

/**
 * Admin-only header bell: shows a badge with the unread notification count
 * (polled every 30 s) and a dropdown with the latest notifications —
 * currently "new user registered" events with name, contact and role.
 */
export default function NotificationsBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/admin/notifications/unread-count');
      setUnread(data.count ?? 0);
    } catch {
      /* polling failure is non-fatal — badge just goes stale */
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const t = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchUnreadCount]);

  // Close the dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/admin/notifications', {
          params: { limit: 20 },
        });
        setItems(data.items ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const markRead = async (id: string) => {
    try {
      await apiClient.patch(`/admin/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/admin/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative ml-auto" ref={containerRef}>
      <button
        onClick={toggleOpen}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">
                No notifications yet
              </p>
            ) : (
              items.map((n) => {
                const badge = n.data?.role ? ROLE_BADGES[n.data.role] : undefined;
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.isRead && markRead(n.id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      n.isRead ? 'bg-white' : 'bg-indigo-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {!n.isRead && (
                        <span className="mt-1 w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5 break-words">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {badge && (
                        <span
                          className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
