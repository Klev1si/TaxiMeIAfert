import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import Pagination from '../components/Pagination';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  rating: number;
  totalRides: number;
  createdAt: string;
}

const LIMIT = 20;

export default function PassengersPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Passengers</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name…"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Rating</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Total Rides</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {c.firstName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.rating > 0 ? `⭐ ${c.rating.toFixed(1)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.totalRides}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} total={total} limit={LIMIT} onChange={p => { setPage(p); fetchClients(p); }} />
    </div>
  );
}
