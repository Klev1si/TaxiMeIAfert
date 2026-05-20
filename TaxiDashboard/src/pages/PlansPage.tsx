import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  maxDrivers: number;
  features: string[];
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  priceMonthly: string;
  maxDrivers: string;
  features: string; // newline-separated
  stripePriceId: string;
}

const EMPTY_FORM: FormState = {
  name: '', priceMonthly: '', maxDrivers: '', features: '', stripePriceId: '',
};

function planToForm(p: Plan): FormState {
  return {
    name:          p.name,
    priceMonthly:  String(p.priceMonthly),
    maxDrivers:    String(p.maxDrivers),
    features:      p.features.join('\n'),
    stripePriceId: p.stripePriceId ?? '',
  };
}

export default function PlansPage() {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan,  setEditPlan]  = useState<Plan | null>(null);
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get<Plan[]>('/admin/plans');
      setPlans(data);
    } catch {
      setError('Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditPlan(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditPlan(p);
    setForm(planToForm(p));
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditPlan(null); };

  const handleSave = async () => {
    setFormError('');
    const payload = {
      name:          form.name.trim(),
      priceMonthly:  parseFloat(form.priceMonthly),
      maxDrivers:    parseInt(form.maxDrivers, 10),
      features:      form.features.split('\n').map(f => f.trim()).filter(Boolean),
      stripePriceId: form.stripePriceId.trim() || null,
    };
    if (!payload.name)                    return setFormError('Name is required.');
    if (isNaN(payload.priceMonthly) || payload.priceMonthly < 0)
                                          return setFormError('Enter a valid price.');
    if (isNaN(payload.maxDrivers)   || payload.maxDrivers < 1)
                                          return setFormError('Enter a valid driver limit.');

    setSaving(true);
    try {
      if (editPlan) {
        await apiClient.patch(`/admin/plans/${editPlan.id}`, payload);
      } else {
        await apiClient.post('/admin/plans', payload);
      }
      closeModal();
      load();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (p: Plan) => {
    if (!confirm(`Deactivate "${p.name}"? Companies on this plan won't be affected immediately.`)) return;
    try {
      await apiClient.delete(`/admin/plans/${p.id}`);
      load();
    } catch {
      alert('Could not deactivate plan.');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subscription Plans</h2>
          <p className="text-sm text-gray-500 mt-1">Manage the plans companies can subscribe to.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          + New Plan
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-600 font-medium">No plans yet</p>
          <p className="text-gray-400 text-sm mt-1">Click "New Plan" to create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map(p => (
            <div
              key={p.id}
              className={`bg-white rounded-xl border p-5 flex flex-col gap-4 ${
                p.isActive ? 'border-gray-200' : 'border-gray-200 opacity-50'
              }`}
            >
              {/* Status badge */}
              {!p.isActive && (
                <span className="self-start bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">
                  Inactive
                </span>
              )}

              {/* Name + price */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                  <p className="text-sm text-gray-500">Up to {p.maxDrivers} drivers</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-2xl font-extrabold text-gray-900">
                    ${Number(p.priceMonthly).toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-400">/mo</span>
                </div>
              </div>

              {/* Features */}
              {p.features.length > 0 && (
                <ul className="space-y-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="text-green-500 font-bold">✓</span> {f}
                    </li>
                  ))}
                </ul>
              )}

              {/* Stripe ID */}
              {p.stripePriceId && (
                <p className="text-xs text-gray-400 font-mono truncate">
                  Stripe: {p.stripePriceId}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-3 border-t border-gray-100">
                <button
                  onClick={() => openEdit(p)}
                  className="flex-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg py-1.5 transition-colors"
                >
                  Edit
                </button>
                {p.isActive && (
                  <button
                    onClick={() => handleDeactivate(p)}
                    className="flex-1 text-sm font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg py-1.5 transition-colors"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editPlan ? 'Edit Plan' : 'New Plan'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Plan Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Professional"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Price / Month ($)</label>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="29.99"
                    value={form.priceMonthly}
                    onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Max Drivers</label>
                  <input
                    type="number" min="1" step="1"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="25"
                    value={form.maxDrivers}
                    onChange={e => setForm(f => ({ ...f, maxDrivers: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Features <span className="font-normal text-gray-400">(one per line)</span>
                </label>
                <textarea
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  placeholder={"Priority support\nAdvanced analytics\nCustom tariffs"}
                  value={form.features}
                  onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Stripe Price ID <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="price_1Abc..."
                  value={form.stripePriceId}
                  onChange={e => setForm(f => ({ ...f, stripePriceId: e.target.value }))}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg py-2.5 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
              >
                {saving ? 'Saving…' : editPlan ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
