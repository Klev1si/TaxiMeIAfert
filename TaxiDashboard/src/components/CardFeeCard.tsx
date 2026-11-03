import { useEffect, useState } from 'react';
import apiClient from '../api/client';

/**
 * Super-admin: the card fee — the % the platform keeps from every card-paid
 * ride, for every contract (subscription or commission, solo or company).
 * Company drivers keep their agreed %; the fee comes out of the company's
 * share. Each ride keeps the fee in force when it was paid.
 */
export default function CardFeeCard() {
  const [saved, setSaved]   = useState<number | null>(null);
  const [value, setValue]   = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiClient.get<{ cardFeePct: number }>('/admin/platform-fees')
      .then(({ data }) => { setSaved(data.cardFeePct); setValue(String(data.cardFeePct)); })
      .catch(() => setMsg({ ok: false, text: 'Could not load the card fee.' }));
  }, []);

  const num   = Number(value);
  const valid = value.trim() !== '' && num >= 0 && num <= 50;
  const dirty = saved != null && num !== saved;

  const save = async () => {
    if (!valid || !dirty) return;
    if (!confirm(`Change the card fee from ${saved}% to ${num}%? It applies to card payments from now on.`)) return;
    setSaving(true); setMsg(null);
    try {
      const { data } = await apiClient.put<{ cardFeePct: number }>('/admin/platform-fees', { cardFeePct: num });
      setSaved(data.cardFeePct); setValue(String(data.cardFeePct));
      setMsg({ ok: true, text: 'Saved. New card payments use this fee within a minute.' });
    } catch {
      setMsg({ ok: false, text: 'Saving failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="flex-1">
        <h3 className="text-base font-bold text-gray-900">💳 Card fee</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Kept by the platform from every card-paid ride, for all drivers and contracts. Company drivers still get
          their agreed % — the fee comes out of the company’s share. Past rides keep the fee they were paid with.
        </p>
        {msg && <p className={`text-sm mt-1 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0} max={50} step={0.5}
          value={value} onChange={(e) => setValue(e.target.value)}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          aria-label="Card fee percent"
        />
        <span className="text-gray-500 font-bold text-sm">%</span>
        <button
          onClick={() => void save()}
          disabled={!valid || !dirty || saving}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
