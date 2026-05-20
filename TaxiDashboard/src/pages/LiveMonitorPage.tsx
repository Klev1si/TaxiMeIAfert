import { useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface LiveDriver {
  driverId:     string;
  lat:          number;
  lng:          number;
  lastSeenMs:   number;
  firstName:    string;
  lastName:     string;
  vehiclePlate: string;
  vehicleMake:  string;
  vehicleModel: string;
  vehicleColor: string | null;
}

const POLL_INTERVAL_MS = 10_000;

function secondsAgo(ms: number): string {
  if (ms === 0) return 'No GPS yet';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function colorDot(color: string | null): string {
  const map: Record<string, string> = {
    white: '#ffffff', black: '#111827', silver: '#94a3b8', gray: '#6b7280',
    red: '#dc2626', blue: '#2563eb', yellow: '#ca8a04', green: '#16a34a',
    orange: '#ea580c', brown: '#92400e',
  };
  return map[(color ?? '').toLowerCase()] ?? '#94a3b8';
}

export default function LiveMonitorPage() {
  const { user }  = useAuthStore();
  const isAdmin   = user?.role === 'super_admin';

  const [drivers, setDrivers]     = useState<LiveDriver[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDrivers = async () => {
    try {
      const endpoint = isAdmin ? '/admin/live-drivers' : '/company/live-drivers';
      const { data } = await apiClient.get<LiveDriver[]>(endpoint);
      setDrivers(data);
      setLastRefresh(new Date());
      setCountdown(POLL_INTERVAL_MS / 1000);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();

    timerRef.current = setInterval(fetchDrivers, POLL_INTERVAL_MS);
    countRef.current = setInterval(
      () => setCountdown(c => Math.max(0, c - 1)),
      1000,
    );

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Live Drivers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {drivers.length} online · refreshes every {POLL_INTERVAL_MS / 1000}s
            {lastRefresh && (
              <span className="ml-2 text-gray-400">
                Last update: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Countdown ring */}
          <div className="relative w-9 h-9">
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke="#4f46e5" strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 15}`}
                strokeDashoffset={`${2 * Math.PI * 15 * (1 - countdown / (POLL_INTERVAL_MS / 1000))}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
              {countdown}
            </span>
          </div>
          <button
            onClick={() => { fetchDrivers(); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48 text-gray-400">
          <p className="text-4xl mb-3">🚗</p>
          <p className="text-sm font-medium">No drivers online right now</p>
          <p className="text-xs mt-1">Drivers appear here when they go online in the app</p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Online',       value: drivers.length,                    color: 'text-green-700',  bg: 'bg-green-50' },
              { label: 'Last min',     value: drivers.filter(d => d.lastSeenMs > 0 && Date.now() - d.lastSeenMs < 60_000).length,   color: 'text-blue-700',   bg: 'bg-blue-50' },
              { label: 'Last 5 min',   value: drivers.filter(d => d.lastSeenMs > 0 && Date.now() - d.lastSeenMs < 300_000).length,  color: 'text-indigo-700', bg: 'bg-indigo-50' },
              { label: 'No GPS yet',   value: drivers.filter(d => d.lastSeenMs === 0).length,                                        color: 'text-amber-700',  bg: 'bg-amber-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Driver cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {drivers
              .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
              .map(d => {
                const hasGps   = d.lastSeenMs > 0;
                const ageMs    = hasGps ? Date.now() - d.lastSeenMs : 0;
                const isRecent = hasGps && ageMs < 60_000;
                const isStale  = hasGps && ageMs >= 300_000;

                return (
                  <div
                    key={d.driverId}
                    className={`bg-white border rounded-xl p-4 ${
                      isStale ? 'border-amber-200' : isRecent ? 'border-green-200' : 'border-gray-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {/* Vehicle color dot */}
                        <div
                          className="w-4 h-4 rounded-full border border-gray-200 shrink-0"
                          style={{ backgroundColor: colorDot(d.vehicleColor) }}
                          title={d.vehicleColor ?? 'unknown color'}
                        />
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {d.firstName} {d.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {d.vehicleMake} {d.vehicleModel}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isStale
                            ? 'bg-amber-100 text-amber-700'
                            : isRecent
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {secondsAgo(d.lastSeenMs)}
                      </span>
                    </div>

                    {/* Plate */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-gray-800 text-sm bg-gray-100 px-2 py-0.5 rounded">
                        {d.vehiclePlate}
                      </span>
                    </div>

                    {/* GPS */}
                    {d.lat === 0 && d.lng === 0 ? (
                      <div className="text-xs text-amber-500 font-medium">
                        📍 Waiting for GPS fix…
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-gray-400 font-mono">
                          {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
                        </div>
                        <a
                          href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 underline block"
                        >
                          Open in Maps →
                        </a>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
