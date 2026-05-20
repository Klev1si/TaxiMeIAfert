import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import apiClient from '../api/client';

interface DayData   { date: string; total: number; completed: number; cancelled: number }
interface StatusRow { status: string; count: number }
interface TopDriver { name: string; plate: string; rides: number; rating: number }

interface Analytics {
  ridesPerDay:     DayData[];
  statusBreakdown: StatusRow[];
  topDrivers:      TopDriver[];
}

const STATUS_COLORS: Record<string, string> = {
  completed:         '#16a34a',
  cancelled:         '#dc2626',
  in_progress:       '#4f46e5',
  driving_to_pickup: '#2563eb',
  accepted:          '#0891b2',
  requested:         '#d97706',
};

const DAYS_OPTIONS = [7, 14, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays]         = useState(30);
  const [data, setData]         = useState<Analytics | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    apiClient.get<Analytics>('/admin/analytics', { params: { days } })
      .then(r => setData(r.data))
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 font-medium">{error || 'No data.'}</p>
      </div>
    );
  }

  const totalRides     = data.statusBreakdown.reduce((s, r) => s + r.count, 0);
  const completedRides = data.statusBreakdown.find(r => r.status === 'completed')?.count ?? 0;
  const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header + period picker */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analytics</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedRides.toLocaleString()} completed rides · {completionRate}% completion rate
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Rides per day — line chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Rides per Day</h3>
        {data.ridesPerDay.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">No rides in this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.ridesPerDay} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={d => d.slice(5)} // show MM-DD
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: number, name: string) => [v, name.charAt(0).toUpperCase() + name.slice(1)]}
                labelFormatter={l => `Date: ${l}`}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total"     stroke="#4f46e5" strokeWidth={2} dot={false} name="Total" />
              <Line type="monotone" dataKey="completed" stroke="#16a34a" strokeWidth={2} dot={false} name="Completed" />
              <Line type="monotone" dataKey="cancelled" stroke="#dc2626" strokeWidth={2} dot={false} name="Cancelled" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status breakdown — pie chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown (all time)</h3>
          {data.statusBreakdown.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No data</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={data.statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%" cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data.statusBreakdown.map(entry => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Rides']} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex-1 space-y-2">
                {data.statusBreakdown.map(r => (
                  <li key={r.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[r.status] ?? '#94a3b8' }}
                      />
                      <span className="text-xs text-gray-600 capitalize">{r.status.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-800">{r.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Top drivers — bar chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Drivers (completed rides)</h3>
          {data.topDrivers.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data.topDrivers}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip
                  formatter={(v: number) => [v, 'Completed rides']}
                  labelFormatter={l => `Driver: ${l}`}
                />
                <Bar dataKey="rides" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Ratings below */}
          {data.topDrivers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {data.topDrivers.map(d => (
                <div key={d.plate} className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{d.name}</span>
                  {' '}⭐ {Number(d.rating).toFixed(1)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
