/**
 * MessagesPage — company-only.
 *
 * Two-pane layout: drivers list on the left, chat thread on the right.
 * Polls every 5 s for new messages/unread counts (good enough until we wire
 * the socket on the dashboard).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

type FromRole = 'company' | 'driver';

interface Message {
  id: string;
  companyId: string;
  driverId: string;
  fromRole: FromRole;
  text: string;
  readAt: string | null;
  createdAt: string;
}

interface Thread {
  driverId:     string;
  firstName:    string | null;
  lastName:     string | null;
  vehiclePlate: string | null;
  unreadCount:  number;
  lastMessage:  Message | null;
}

function formatPreviewTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessagesPage() {
  const user    = useAuthStore(s => s.user);
  const isCompany = user?.role === 'company';

  const [threads,    setThreads]    = useState<Thread[]>([]);
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [threadLoad, setThreadLoad] = useState(false);
  const [draft,      setDraft]      = useState('');
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load thread list on mount + every 5s
  useEffect(() => {
    if (!isCompany) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await apiClient.get<Thread[]>('/company/messages/threads');
        if (!cancelled) {
          setThreads(data);
          // Auto-select first driver on first load
          setActiveId(prev => prev ?? data[0]?.driverId ?? null);
          setError('');
        }
      } catch {
        if (!cancelled) setError('Failed to load drivers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isCompany]);

  // Load thread when activeId changes, also poll every 5 s while active.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    setThreadLoad(true);

    const load = async () => {
      try {
        const { data } = await apiClient.get<Message[]>(`/company/messages/with/${activeId}`);
        if (!cancelled) setMessages(data);
      } catch { /* silent */ }
      finally { if (!cancelled) setThreadLoad(false); }
    };

    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const activeDriver = useMemo(
    () => threads.find(t => t.driverId === activeId) ?? null,
    [activeId, threads],
  );

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if ((b.unreadCount > 0 ? 1 : 0) !== (a.unreadCount > 0 ? 1 : 0)) {
        return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
      }
      const aTs = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTs = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (bTs !== aTs) return bTs - aTs;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [threads]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    setDraft('');
    try {
      const { data } = await apiClient.post<Message>(
        `/company/messages/to/${activeId}`,
        { text },
      );
      setMessages(prev => [...prev, data]);
    } catch (err: any) {
      setDraft(text);
      const msg = err?.response?.data?.message ?? err?.message ?? 'Could not send.';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSending(false);
    }
  };

  if (!isCompany) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold mb-2">Messages</h1>
        <p className="text-slate-500">
          Direct messaging is for company accounts. Super-admins manage the platform separately.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-bold">Messages</h1>
        <p className="text-sm text-slate-500">Chat with each of your drivers.</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-500">Loading drivers…</div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: drivers list */}
          <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto">
            {error && (
              <div className="m-3 p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
                {error}
              </div>
            )}
            {sortedThreads.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No drivers yet. Add drivers to your company to start chatting.
              </div>
            ) : (
              <ul>
                {sortedThreads.map(t => {
                  const isActive = t.driverId === activeId;
                  const last = t.lastMessage;
                  const previewPrefix = last?.fromRole === 'company' ? 'You: ' : '';
                  const preview = last ? `${previewPrefix}${last.text}` : 'No messages yet';
                  return (
                    <li key={t.driverId}>
                      <button
                        onClick={() => setActiveId(t.driverId)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                          isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center flex-shrink-0">
                            {(t.firstName?.[0] ?? '?').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 truncate">
                                {t.firstName ?? ''} {t.lastName ?? ''}
                              </span>
                              {last && (
                                <span className="text-xs text-slate-400 flex-shrink-0">
                                  {formatPreviewTime(last.createdAt)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span
                                className={`text-xs truncate ${
                                  t.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'
                                }`}
                              >
                                {preview}
                              </span>
                              {t.unreadCount > 0 && (
                                <span className="bg-indigo-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center flex-shrink-0">
                                  {t.unreadCount > 99 ? '99+' : t.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right: thread */}
          <div className="flex-1 flex flex-col bg-slate-50">
            {!activeDriver ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                Select a driver to start chatting.
              </div>
            ) : (
              <>
                <div className="px-6 py-3 border-b border-slate-200 bg-white">
                  <div className="font-semibold text-slate-900">
                    {activeDriver.firstName ?? ''} {activeDriver.lastName ?? ''}
                  </div>
                  {activeDriver.vehiclePlate && (
                    <div className="text-xs text-slate-500">🚖 {activeDriver.vehiclePlate}</div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {threadLoad && messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-400">Loading…</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-400 pt-12">
                      💬 No messages yet — send the first message below.
                    </div>
                  ) : messages.map(m => {
                    const fromMe = m.fromRole === 'company';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] px-3 py-2 rounded-2xl ${
                            fromMe
                              ? 'bg-indigo-600 text-white rounded-br-sm'
                              : 'bg-white text-slate-900 border border-slate-200 rounded-bl-sm'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words text-sm">{m.text}</div>
                          <div
                            className={`text-[10px] mt-1 text-right ${
                              fromMe ? 'text-indigo-100' : 'text-slate-400'
                            }`}
                          >
                            {formatBubbleTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-slate-200 p-3 bg-white flex gap-2">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    rows={1}
                    maxLength={2000}
                    className="flex-1 resize-none px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
