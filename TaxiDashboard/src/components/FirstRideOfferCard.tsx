import { useEffect, useState } from 'react';
import apiClient from '../api/client';

interface FirstRideOffer {
  enabled:     boolean;
  discountPct: number;
  maxKm:       number;
}

/**
 * Super-admin control for the automatic first-ride offer. Changes apply to
 * the next completed ride and to the passenger app's banner within ~30 s —
 * no app release needed.
 */
export default function FirstRideOfferCard() {
  const [saved,   setSaved]   = useState<FirstRideOffer | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [pct,     setPct]     = useState('100');
  const [maxKm,   setMaxKm]   = useState('10');
  const [saving,  setSaving]  = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (o: FirstRideOffer) => {
    setSaved(o);
    setEnabled(o.enabled);
    setPct(String(o.discountPct));
    setMaxKm(String(o.maxKm));
  };

  useEffect(() => {
    apiClient.get<FirstRideOffer>('/admin/first-ride-offer')
      .then(({ data }) => apply(data))
      .catch(() => setMessage({ ok: false, text: 'Could not load the first-ride offer.' }));
  }, []);

  const pctNum = Number(pct);
  const kmNum  = Number(maxKm);
  const valid  = Number.isInteger(pctNum) && pctNum >= 1 && pctNum <= 100 && kmNum >= 0.5 && kmNum <= 1000;
  const dirty  = !!saved && (saved.enabled !== enabled || saved.discountPct !== pctNum || saved.maxKm !== kmNum);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await apiClient.put<FirstRideOffer>('/admin/first-ride-offer', {
        enabled, discountPct: pctNum, maxKm: kmNum,
      });
      apply(data);
      setMessage({ ok: true, text: 'Saved. Passengers see the new offer within a minute.' });
    } catch {
      setMessage({ ok: false, text: 'Saving failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const preview = !enabled
    ? 'No first-ride offer is running.'
    : pctNum >= 100
      ? `New passengers ride FREE on their first trip up to ${maxKm || '?'} km.`
      : `New passengers get ${pct || '?'}% off their first trip up to ${maxKm || '?'} km.`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">🎁 First-ride offer</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Applied automatically. Each phone, email and Google/Apple account gets it only once,
            even after deleting the account. The platform covers the discount; drivers are paid in full.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-indigo-600"
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm text-gray-700">
          Discount (%) <span className="text-gray-400">— 100 = free ride</span>
          <input
            type="number" min={1} max={100} step={1}
            value={pct}
            disabled={!enabled}
            onChange={(e) => setPct(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </label>
        <label className="text-sm text-gray-700">
          Max distance (km) <span className="text-gray-400">— "inside the city"</span>
          <input
            type="number" min={0.5} max={1000} step={0.5}
            value={maxKm}
            disabled={!enabled}
            onChange={(e) => setMaxKm(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </label>
      </div>

      <p className="text-sm text-gray-600">{preview}</p>
      {!valid && (
        <p className="text-sm text-red-600">Discount must be a whole number 1–100 and distance 0.5–1000 km.</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={!dirty || !valid || saving}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save offer'}
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
