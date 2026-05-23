import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';

type FilterTab = 'all' | 'pending' | 'approved';

interface Company {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  isApproved: boolean;
  approvedAt: string | null;
  createdAt: string;
}

const LIMIT = 20;

export default function CompaniesPage() {
  const [filter, setFilter]     = useState<FilterTab>('all');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchCompanies = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ companies: Company[]; total: number }>('/admin/companies', {
        params: { filter, page: p, limit: LIMIT },
      });
      setCompanies(data.companies);
      setTotal(data.total);
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { setPage(1); fetchCompanies(1); }, [filter, fetchCompanies]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      await apiClient.patch(`/admin/companies/${id}/approve`);
      fetchCompanies(page);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Reject this company and deactivate their account?')) return;
    setActionId(id);
    try {
      await apiClient.patch(`/admin/companies/${id}/reject`);
      fetchCompanies(page);
    } finally {
      setActionId(null);
    }
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Companies</h2>
        <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-3xl mb-2">🏢</p>
            <p className="text-sm">No companies found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Location</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Applied</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Approved</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <p className="font-medium text-gray-900">{c.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {[c.city, c.address].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={c.isApproved ? 'Approved' : 'Pending'}
                      variant={c.isApproved ? 'green' : 'yellow'}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {!c.isApproved && (
                        <button
                          disabled={actionId === c.id}
                          onClick={() => handleApprove(c.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {actionId === c.id ? '…' : 'Approve'}
                        </button>
                      )}
                      <button
                        disabled={actionId === c.id}
                        onClick={() => handleReject(c.id)}
                        className="px-3 py-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        {actionId === c.id ? '…' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} total={total} limit={LIMIT} onChange={p => { setPage(p); fetchCompanies(p); }} />
    </div>
  );
}
