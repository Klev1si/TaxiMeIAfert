import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface Tariff {
  id: string;
  name: string;
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  isNightTariff: boolean;
  nightStartHour: number | null;
  nightEndHour: number | null;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  baseFare: string;
  perKmRate: string;
  perMinuteRate: string;
  minimumFare: string;
  surgeMultiplier: string;
  isNightTariff: boolean;
  nightStartHour: string;
  nightEndHour: string;
}

const EMPTY_FORM: FormState = {
  name: '', baseFare: '', perKmRate: '',
  perMinuteRate: '', minimumFare: '',
  surgeMultiplier: '1.0',
  isNightTariff: false, nightStartHour: '', nightEndHour: '',
};

function tariffToForm(t: Tariff): FormState {
  return {
    name:            t.name,
    baseFare:        String(t.baseFare),
    perKmRate:       String(t.perKmRate),
    perMinuteRate:   String(t.perMinuteRate),
    minimumFare:     String(t.minimumFare),
    surgeMultiplier: String(t.surgeMultiplier ?? 1),
    isNightTariff:   t.isNightTariff,
    nightStartHour:  t.nightStartHour != null ? String(t.nightStartHour) : '',
    nightEndHour:    t.nightEndHour   != null ? String(t.nightEndHour)   : '',
  };
}

// Quick-set surge presets shown on each card
const SURGE_PRESETS = [
  { label: 'Normal',  value: 1.0 },
  { label: '×1.5',    value: 1.5 },
  { label: '×2.0',    value: 2.0 },
  { label: '×2.5',    value: 2.5 },
];

export default function TariffsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin';
  const BASE = isAdmin ? '/admin/tariffs' : '/company/tariffs';

  const [tariffs,     setTariffs]     = useState<Tariff[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [surgeSaving, setSurgeSaving] = useState<string | null>(null); // tariff id

  // Modal state
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editTarget,   setEditTarget]   = useState<Tariff | null>(null);
  const [form,         setForm]         = useState<FormState>(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const fetchTariffs = useCallback(async () => {
    try {
      const { data } = await apiClient.get<Tariff[]>(BASE);
      setTariffs(data);
    } catch {
      setTariffs([]);
    } finally {
      setLoading(false);
    }
  }, [BASE]);

  useEffect(() => { fetchTariffs(); }, [fetchTariffs]);

  // ── Quick-set surge directly from card ────────────────────────────────────

  const handleQuickSurge = async (tariff: Tariff, multiplier: number) => {
    setSurgeSaving(tariff.id);
    try {
      await apiClient.patch(`${BASE}/${tariff.id}`, { surgeMultiplier: multiplier });
      await fetchTariffs();
    } catch {
      alert('Could not update surge. Please try again.');
    } finally {
      setSurgeSaving(null);
    }
  };

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (t: Tariff) => {
    setEditTarget(t);
    setForm(tariffToForm(t));
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const handleField = (key: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setFormError('');
    const surge = parseFloat(form.surgeMultiplier);
    const payload = {
      name:            form.name.trim(),
      baseFare:        parseFloat(form.baseFare),
      perKmRate:       parseFloat(form.perKmRate),
      perMinuteRate:   parseFloat(form.perMinuteRate),
      minimumFare:     parseFloat(form.minimumFare),
      surgeMultiplier: isNaN(surge) ? 1 : surge,
      isNightTariff:   form.isNightTariff,
      nightStartHour:  form.isNightTariff && form.nightStartHour !== '' ? parseInt(form.nightStartHour) : undefined,
      nightEndHour:    form.isNightTariff && form.nightEndHour   !== '' ? parseInt(form.nightEndHour)   : undefined,
    };

    if (!payload.name)                         { setFormError('Name is required.'); return; }
    if (isNaN(payload.baseFare)      || payload.baseFare      < 0) { setFormError('Base fare must be ≥ 0.'); return; }
    if (isNaN(payload.perKmRate)     || payload.perKmRate     < 0) { setFormError('Per-km rate must be ≥ 0.'); return; }
    if (isNaN(payload.perMinuteRate) || payload.perMinuteRate < 0) { setFormError('Per-minute rate must be ≥ 0.'); return; }
    if (isNaN(payload.minimumFare)   || payload.minimumFare   < 0) { setFormError('Minimum fare must be ≥ 0.'); return; }
    if (payload.surgeMultiplier < 1 || payload.surgeMultiplier > 10) { setFormError('Surge must be between 1.0 and 10.0.'); return; }

    setSaving(true);
    try {
      if (editTarget) {
        await apiClient.patch(`${BASE}/${editTarget.id}`, payload);
      } else {
        await apiClient.post(BASE, payload);
      }
      await fetchTariffs();
      closeModal();
    } catch {
      setFormError('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (t: Tariff) => {
    if (!confirm(`Deactivate tariff "${t.name}"? It will no longer be assignable to rides.`)) return;
    setDeactivating(t.id);
    try {
      await apiClient.delete(`${BASE}/${t.id}`);
      await fetchTariffs();
    } finally {
      setDeactivating(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeTariffs   = tariffs.filter(t =>  t.isActive);
  const inactiveTariffs = tariffs.filter(t => !t.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {isAdmin ? 'Platform Tariffs' : 'Tariffs'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'Applied to rides by individual drivers without a company'
              : "Applied to rides by your company's drivers"}
            {' · '}{activeTariffs.length} active · {inactiveTariffs.length} inactive
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + New Tariff
        </button>
      </div>

      {/* Surge explanation banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-xl mt-0.5">⚡</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Surge Pricing</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Use the surge buttons on each tariff card to instantly multiply fares during peak hours.
            Clients see a live ⚡ badge on their fare estimate. Set back to <strong>Normal</strong> when demand drops.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tariffs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center h-48 text-gray-400">
          <p className="text-4xl mb-3">💰</p>
          <p className="text-sm font-medium">No tariffs yet</p>
          <p className="text-xs mt-1">Create your first tariff to start pricing rides.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active tariffs */}
          {activeTariffs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeTariffs.map(t => (
                <TariffCard
                  key={t.id}
                  tariff={t}
                  onEdit={() => openEdit(t)}
                  onDeactivate={() => handleDeactivate(t)}
                  onQuickSurge={(v) => handleQuickSurge(t, v)}
                  deactivating={deactivating === t.id}
                  surgeSaving={surgeSaving === t.id}
                />
              ))}
            </div>
          )}

          {/* Inactive tariffs */}
          {inactiveTariffs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Inactive
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                {inactiveTariffs.map(t => (
                  <TariffCard
                    key={t.id}
                    tariff={t}
                    onEdit={() => openEdit(t)}
                    onDeactivate={() => {}}
                    onQuickSurge={() => {}}
                    deactivating={false}
                    surgeSaving={false}
                    inactive
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">
                {editTarget ? 'Edit Tariff' : 'New Tariff'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Tariff Name</label>
                <input
                  value={form.name}
                  onChange={e => handleField('name', e.target.value)}
                  placeholder="e.g. Standard, Night Rate…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Fare fields */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'baseFare',      label: 'Base Fare',       placeholder: '2.00' },
                  { key: 'minimumFare',   label: 'Minimum Fare',    placeholder: '3.00' },
                  { key: 'perKmRate',     label: 'Per Km Rate',     placeholder: '0.50' },
                  { key: 'perMinuteRate', label: 'Per Minute Rate', placeholder: '0.20' },
                ] as const).map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label} ($)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form[f.key]}
                      onChange={e => handleField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>

              {/* Surge multiplier */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  ⚡ Surge Multiplier
                  <span className="font-normal text-gray-400 ml-1">(1.0 = normal, 2.0 = double fare)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min="1" max="10" step="0.1"
                    value={form.surgeMultiplier}
                    onChange={e => handleField('surgeMultiplier', e.target.value)}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {/* Preset buttons */}
                  <div className="flex gap-1.5 flex-wrap">
                    {SURGE_PRESETS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => handleField('surgeMultiplier', String(p.value))}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                          parseFloat(form.surgeMultiplier) === p.value
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-600'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Night tariff toggle */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isNightTariff}
                    onChange={e => handleField('isNightTariff', e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Night tariff (applies during specific hours)</span>
                </label>
              </div>

              {form.isNightTariff && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Night Start Hour (0–23)</label>
                    <input
                      type="number" min="0" max="23"
                      value={form.nightStartHour}
                      onChange={e => handleField('nightStartHour', e.target.value)}
                      placeholder="22"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Night End Hour (0–23)</label>
                    <input
                      type="number" min="0" max="23"
                      value={form.nightEndHour}
                      onChange={e => handleField('nightEndHour', e.target.value)}
                      placeholder="6"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {formError && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : (editTarget ? 'Save Changes' : 'Create Tariff')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tariff card ───────────────────────────────────────────────────────────────

interface TariffCardProps {
  tariff: Tariff;
  onEdit: () => void;
  onDeactivate: () => void;
  onQuickSurge: (value: number) => void;
  deactivating: boolean;
  surgeSaving: boolean;
  inactive?: boolean;
}

function TariffCard({ tariff: t, onEdit, onDeactivate, onQuickSurge, deactivating, surgeSaving, inactive }: TariffCardProps) {
  const surge = Number(t.surgeMultiplier ?? 1);
  const hasSurge = surge > 1;

  return (
    <div className={`bg-white border rounded-xl p-5 flex flex-col gap-4 ${
      hasSurge ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-gray-900">{t.name}</p>
          {t.isNightTariff && t.nightStartHour != null && t.nightEndHour != null && (
            <p className="text-xs text-indigo-600 mt-0.5">
              🌙 {t.nightStartHour}:00 – {t.nightEndHour}:00
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {!inactive && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
          )}
          {hasSurge && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              ⚡ ×{surge.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Rates grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {([
          { label: 'Base fare',    value: t.baseFare },
          { label: 'Minimum fare', value: t.minimumFare },
          { label: 'Per km',       value: t.perKmRate },
          { label: 'Per minute',   value: t.perMinuteRate },
        ]).map(r => (
          <div key={r.label}>
            <p className="text-xs text-gray-400">{r.label}</p>
            <p className="text-sm font-semibold text-gray-800">${Number(r.value).toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Effective fare example */}
      {hasSurge && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-700">
            <span className="font-bold">Surge active:</span> base ${Number(t.baseFare).toFixed(2)} → effective ${(Number(t.baseFare) * surge).toFixed(2)}
          </p>
        </div>
      )}

      {/* Quick surge buttons */}
      {!inactive && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-1.5">⚡ Quick Surge</p>
          <div className="flex gap-1.5 flex-wrap">
            {SURGE_PRESETS.map(p => {
              const isActive = Math.abs(surge - p.value) < 0.01;
              return (
                <button
                  key={p.value}
                  onClick={() => onQuickSurge(p.value)}
                  disabled={surgeSaving || isActive}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors disabled:cursor-not-allowed ${
                    isActive
                      ? p.value === 1
                        ? 'bg-gray-100 border-gray-300 text-gray-500'
                        : 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-600'
                  }`}
                >
                  {surgeSaving && !isActive ? '…' : p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      {!inactive && (
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={onEdit}
            className="flex-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDeactivate}
            disabled={deactivating}
            className="flex-1 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-100 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {deactivating ? '…' : 'Deactivate'}
          </button>
        </div>
      )}
    </div>
  );
}
