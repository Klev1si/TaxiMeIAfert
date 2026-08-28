import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';
import type { Variant } from '../components/StatusBadge';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  isPhoneVerified: boolean;
  isActive: boolean;
  photoUrl: string | null;
  rating: number;
  totalRides: number;
  createdAt: string;
}

interface RecentRide {
  id: string;
  status: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  totalFare: number | null;
  paymentStatus: string;
  createdAt: string;
}

interface ClientDetail extends Client {
  userId: string;
  authProvider: 'google' | 'apple' | 'phone';
  accountCreatedAt: string | null;
  recentRides: RecentRide[];
}

const LIMIT = 20;

const PROVIDER_LABEL: Record<ClientDetail['authProvider'], string> = {
  google: 'Google',
  apple:  'Apple',
  phone:  'Phone / Email',
};

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

// ── Passenger detail drawer ─────────────────────────────────────────────────────

function PassengerDetailPanel({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [detail,  setDetail]  = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    // The panel is keyed on clientId (see parent), so it remounts per
    // selection and `loading` starts true — no synchronous setState needed here.
    let cancelled = false;
    apiClient.get<ClientDetail>(`/admin/clients/${clientId}`)
      .then(({ data }) => { if (!cancelled) { setDetail(data); setError(''); } })
      .catch(() => { if (!cancelled) setError('Could not load passenger details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 shrink-0">
          <h3 className="font-bold text-gray-900">Passenger details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
        </div>

        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="w-7 h-7 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error || !detail ? (
          <p className="text-center text-sm text-red-500 pt-16">{error || 'Not found.'}</p>
        ) : (
          <div className="px-5 py-4 space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              {detail.photoUrl ? (
                <img src={detail.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl shrink-0">
                  {detail.firstName[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-lg truncate">
                  {detail.firstName} {detail.lastName}
                </p>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  detail.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {detail.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Account fields */}
            <div className="space-y-3">
              <DetailRow label="Phone">
                {detail.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    {detail.phone}
                    {detail.isPhoneVerified
                      ? <span title="Verified" className="text-green-600">✓ verified</span>
                      : <span title="Not verified" className="text-amber-600 text-xs">unverified</span>}
                  </span>
                ) : '—'}
              </DetailRow>
              <DetailRow label="Email">{detail.email ?? '—'}</DetailRow>
              <DetailRow label="Registered with">{PROVIDER_LABEL[detail.authProvider]}</DetailRow>
              <DetailRow label="Rating">{detail.rating > 0 ? `⭐ ${detail.rating.toFixed(1)}` : '—'}</DetailRow>
              <DetailRow label="Total rides">{detail.totalRides}</DetailRow>
              <DetailRow label="Joined">{new Date(detail.createdAt).toLocaleDateString()}</DetailRow>
              {detail.accountCreatedAt && (
                <DetailRow label="Account created">
                  {new Date(detail.accountCreatedAt).toLocaleDateString()}
                </DetailRow>
              )}
              <DetailRow label="Passenger ID">
                <span className="font-mono text-xs text-gray-400">{detail.id}</span>
              </DetailRow>
            </div>

            {/* Recent rides */}
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-2">
                Recent rides {detail.recentRides.length > 0 && `(${detail.recentRides.length})`}
              </h4>
              {detail.recentRides.length === 0 ? (
                <p className="text-sm text-gray-400">No rides yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.recentRides.map(r => (
                    <li key={r.id} className="border border-gray-100 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge label={r.status.replace(/_/g, ' ')} variant={rideStatusVariant(r.status)} />
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs mt-1.5 truncate" title={`${r.pickupAddress ?? '—'} → ${r.dropoffAddress ?? '—'}`}>
                        {r.pickupAddress ?? '—'} → {r.dropoffAddress ?? '—'}
                      </p>
                      {r.totalFare != null && (
                        <p className="text-xs text-gray-900 font-semibold mt-0.5">
                          ${r.totalFare.toFixed(2)}
                          <span className="ml-1 font-normal text-gray-400">· {r.paymentStatus}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right break-words min-w-0">{children}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PassengersPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchClients = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: LIMIT };
      if (search) params.search = search;
      const { data } = await apiClient.get<{ clients: Client[]; total: number }>('/admin/clients', { params });
      setClients(data.clients);
      setTotal(data.total);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { setPage(1); fetchClients(1); }, [search, fetchClients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Passengers</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-3xl mb-2">👤</p>
            <p className="text-sm">No passengers found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[840px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Rating</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Total Rides</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  title="View passenger details"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {c.firstName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1.5">
                        {c.phone}
                        {c.isPhoneVerified && <span title="Phone verified" className="text-green-600">✓</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.rating > 0 ? `⭐ ${c.rating.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.totalRides}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} limit={LIMIT} onChange={p => { setPage(p); fetchClients(p); }} />

      {/* Detail drawer — keyed so each selection mounts a fresh panel */}
      {selectedId && (
        <PassengerDetailPanel key={selectedId} clientId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
