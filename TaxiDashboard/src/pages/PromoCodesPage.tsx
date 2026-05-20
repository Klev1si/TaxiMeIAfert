import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import StatusBadge from '../components/StatusBadge';

type DiscountType = 'percent' | 'fixed';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  minimumFare: number | null;
  maxUses: number | null;
  usedCount: number;
  usesRemaining: number | null;
  expiresAt: string | null;
  isActive: boolean;
  isValid: boolean;
  createdAt: string;
}

interface FormState {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount: string;
  minimumFare: string;
  maxUses: string;
  expiresAt: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  code:              '',
  description:       '',
  discountType:      'percent',
  discountValue:     '',
  maxDiscountAmount: '',
  minimumFare:       '',
  maxUses:           '',
  expiresAt:         '',
  isActive:          true,
};

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PromoCodesPage() {
  const [promos,  setPromos]  = useState<PromoCode[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Modal state
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState<PromoCode | null>(null);
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  const LIMIT = 20;

  const fetchPromos = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<{ codes: PromoCode[]; total: number }>(
        '/admin/promo-codes',
        { params: { page: p, limit: LIMIT } },
      );
      setPromos(data.codes);
      setTotal(data.total);
      setError('');
    } catch {
      setError('Failed to load promo codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(1); }, [fetchPromos]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(p: PromoCode) {
    setEditing(p);
    setForm({
      code:              p.code,
      description:       p.description ?? '',
      discountType:      p.discountType,
      discountValue:     String(p.discountValue),
      maxDiscountAmount: p.maxDiscountAmount != null ? String(p.maxDiscountAmount) : '',
      minimumFare:       p.minimumFare != null ? String(p.minimumFare) : '',
      maxUses:           p.maxUses != null ? String(p.maxUses) : '',
      expiresAt:         p.expiresAt ? p.expiresAt.slice(0, 10) : '',
      isActive:          p.isActive,
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim()) { setFormError('Code is required'); return; }
    if (!form.discountValue || isNaN(Number(form.discountValue))) {
      setFormError('Discount value must be a valid number');
      return;
    }
    if (form.discountType === 'percent' && Number(form.discountValue) > 100) {
      setFormError('Percent discount cannot exceed 100%');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        code:         form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
      };
      if (form.description)       payload.description       = form.description;
      if (form.maxDiscountAmount) payload.maxDiscountAmount = Number(form.maxDiscountAmount);
      if (form.minimumFare)       payload.minimumFare       = Number(form.minimumFare);
      if (form.maxUses)           payload.maxUses           = parseInt(form.maxUses, 10);
      if (form.expiresAt)         payload.expiresAt         = new Date(form.expiresAt).toISOString();
      if (editing)                payload.isActive          = form.isActive;

      if (editing) {
        await apiClient.patch(`/admin/promo-codes/${editing.id}`, payload);
      } else {
        await apiClient.post('/admin/promo-codes', payload);
      }
      setShowModal(false);
      fetchPromos(page);
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to save promo code.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(promo: PromoCode) {
    if (!confirm(`Delete promo code "${promo.code}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/admin/promo-codes/${promo.id}`);
      fetchPromos(page);
    } catch {
      alert('Failed to delete promo code.');
    }
  }

  async function toggleActive(promo: PromoCode) {
    try {
      await apiClient.patch(`/admin/promo-codes/${promo.id}`, { isActive: !promo.isActive });
      fetchPromos(page);
    } catch {
      alert('Failed to update promo code.');
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Promo Codes</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} code{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <span className="text-base leading-none">＋</span> New Code
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700 flex items-start gap-2">
        <span className="text-lg leading-tight">🏷️</span>
        <div>
          <span className="font-semibold">How promo codes work:</span>{' '}
          Clients enter a code when booking a ride. The discount is applied to the final fare at completion.
          Percent codes reduce by a percentage (optionally capped), fixed codes deduct a flat amount.
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 text-red-500">
            <p>{error}</p>
          </div>
        ) : promos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <p className="text-3xl mb-2">🏷️</p>
            <p className="text-sm">No promo codes yet</p>
            <button onClick={openCreate} className="mt-2 text-sm text-indigo-600 hover:underline font-medium">
              Create your first code
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Discount</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Min Fare</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Uses</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Expires</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {promos.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-gray-900 tracking-wider">{p.code}</span>
                        {p.description && (
                          <span className="text-xs text-gray-400 truncate max-w-[180px]" title={p.description}>
                            {p.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {p.discountType === 'percent'
                        ? <span className="text-green-700">{p.discountValue}% off{p.maxDiscountAmount != null ? ` (max $${p.maxDiscountAmount})` : ''}</span>
                        : <span className="text-green-700">${p.discountValue} off</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.minimumFare != null ? `$${p.minimumFare}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-gray-800 font-medium">{p.usedCount} used</span>
                        <span className="text-xs text-gray-400">
                          {p.maxUses != null ? `${p.usesRemaining} left of ${p.maxUses}` : 'Unlimited'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {p.expiresAt ? (
                        <span className={new Date(p.expiresAt) < new Date() ? 'text-red-500 font-medium' : ''}>
                          {formatExpiry(p.expiresAt)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.isValid
                        ? <StatusBadge label="Active" variant="green" />
                        : p.isActive && p.expiresAt && new Date(p.expiresAt) < new Date()
                          ? <StatusBadge label="Expired" variant="red" />
                          : p.isActive && p.maxUses != null && p.usedCount >= p.maxUses
                            ? <StatusBadge label="Exhausted" variant="yellow" />
                            : <StatusBadge label="Inactive" variant="gray" />
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(p)}
                          className={`text-xs px-2.5 py-1.5 border rounded-lg font-medium transition-colors ${
                            p.isActive
                              ? 'border-yellow-200 text-yellow-700 hover:bg-yellow-50'
                              : 'border-green-200 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="text-xs px-2.5 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 font-medium transition-colors"
                        >
                          Delete
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchPromos(p); }}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchPromos(p); }}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editing ? 'Edit Promo Code' : 'Create Promo Code'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. SAVE20"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional — shown to admin only"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Discount type + value */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.discountType}
                    onChange={e => setForm(f => ({ ...f, discountType: e.target.value as DiscountType }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed amount ($)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max={form.discountType === 'percent' ? 100 : undefined}
                      step="0.01"
                      value={form.discountValue}
                      onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                      placeholder={form.discountType === 'percent' ? '20' : '5.00'}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {form.discountType === 'percent' ? '%' : '$'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Max discount (for percent codes) */}
              {form.discountType === 'percent' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max discount cap ($)
                    <span className="text-gray-400 font-normal ml-1">— optional</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maxDiscountAmount}
                    onChange={e => setForm(f => ({ ...f, maxDiscountAmount: e.target.value }))}
                    placeholder="e.g. 10.00 — leave blank for no cap"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Minimum fare */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum fare ($)
                  <span className="text-gray-400 font-normal ml-1">— optional</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumFare}
                  onChange={e => setForm(f => ({ ...f, minimumFare: e.target.value }))}
                  placeholder="e.g. 8.00 — leave blank for no minimum"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Max uses + expiry */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max uses
                    <span className="text-gray-400 font-normal ml-1">— optional</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.maxUses}
                    onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                    placeholder="Leave blank for unlimited"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires on
                    <span className="text-gray-400 font-normal ml-1">— optional</span>
                  </label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* isActive toggle (edit only) */}
              {editing && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    className={`relative w-10 h-6 rounded-full transition-colors ${form.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {form.isActive ? 'Active — clients can use this code' : 'Inactive — code is disabled'}
                  </span>
                </label>
              )}

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  {formError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {editing ? 'Save Changes' : 'Create Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
