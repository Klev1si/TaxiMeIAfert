import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import type { BillingModel, CommissionStatement } from '../types/contract';

const eur = (n: number) => `€${n.toFixed(2)}`;

interface Props {
  /** 'company' (default) or a solo 'driver'. */
  subject?:    'company' | 'driver';
  /** Company id, or driver id when subject = 'driver'. */
  companyId:   string;
  companyName: string;
  onClose:     () => void;
  /** Called after the contract changed so the list can refresh. */
  onSaved:     () => void;
}

/**
 * Super-admin dialog: choose a company's contract (subscription or a
 * percentage of ride revenue) and, for commission contracts, follow what the
 * company owes and record its payments.
 */
export default function CompanyContractModal({ subject = 'company', companyId, companyName, onClose, onSaved }: Props) {
  const base = subject === 'driver' ? `/admin/drivers/${companyId}` : `/admin/companies/${companyId}`;
  const who  = subject === 'driver' ? 'driver' : 'company';
  const [st, setSt]           = useState<CommissionStatement | null>(null);
  const [model, setModel]     = useState<BillingModel>('unassigned');
  const [pct, setPct]         = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote]     = useState('');
  const [paying, setPaying]       = useState(false);

  const apply = (s: CommissionStatement) => {
    setSt(s);
    setModel(s.billingModel);
    setPct(s.commissionPct != null ? String(s.commissionPct) : '');
  };

  useEffect(() => {
    apiClient.get<CommissionStatement>(`${base}/billing`, { params: { period: 'month' } })
      .then(({ data }) => apply(data))
      .catch(() => setError('Could not load the contract.'));
  }, [base]);

  const pctNum   = Number(pct);
  const pctValid = model !== 'commission' || (pct.trim() !== '' && pctNum > 0 && pctNum <= 50);
  const dirty    = !!st && (model !== st.billingModel || (model === 'commission' && pctNum !== st.commissionPct));

  const save = async () => {
    if (!pctValid) return;
    const msg = model === 'commission'
      ? `Set ${companyName} to a ${pctNum}% commission contract? ${subject === 'driver' ? 'They' : 'Their drivers'} can take rides without a subscription, and ${pctNum}% of every ride is owed to the platform from now on.`
      : model === 'subscription'
        ? `Set ${companyName} to a subscription contract? They will choose and pay a plan.`
        : `Remove ${companyName}'s contract? Their drivers will not be able to take rides until a contract is set.`;
    if (!confirm(msg)) return;
    setSaving(true); setError('');
    try {
      const { data } = await apiClient.put<CommissionStatement>(`${base}/billing`, {
        billingModel: model,
        ...(model === 'commission' ? { commissionPct: pctNum } : {}),
      });
      apply(data);
      onSaved();
    } catch {
      setError('Saving failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async () => {
    const amount = Number(payAmount);
    if (!(amount > 0)) return;
    if (!confirm(`Record a payment of ${eur(amount)} from ${companyName}?`)) return;
    setPaying(true); setError('');
    try {
      const { data } = await apiClient.post<CommissionStatement>(
        `${base}/commission-payments`,
        { amount, note: payNote.trim() || undefined },
      );
      apply(data);
      setPayAmount(''); setPayNote('');
      onSaved();
    } catch {
      setError('Recording the payment failed.');
    } finally {
      setPaying(false);
    }
  };

  const option = (value: BillingModel, title: string, hint: string) => (
    <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${model === value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
      <input type="radio" name="contract" className="mt-1 accent-indigo-600" checked={model === value} onChange={() => setModel(value)} />
      <span>
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );

  const showsMoney = st && (st.billingModel === 'commission' || st.allTime.commission > 0 || st.allTime.paid > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Contract — {companyName}</h3>
            {st?.setAt && <p className="text-xs text-gray-500">Last changed {new Date(st.setAt).toLocaleString()}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        {!st ? (
          <div className="p-8 text-center text-sm text-gray-500">{error || 'Loading…'}</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="space-y-2">
              {option('subscription', 'Subscription', `The ${who} pays a monthly, 3-month or yearly plan.`)}
              {option('commission', 'Commission (% of rides)', subject === 'driver'
                ? 'The platform takes a percentage of the full fare of every ride. Withheld automatically on card rides; cash rides are settled with the platform.'
                : 'The platform takes a percentage of the full fare of every ride by the company’s drivers, out of the company’s share — drivers keep their agreed %.')}
              {subject === 'company' && option('unassigned', 'No contract yet', 'Plans are hidden and the company’s drivers can’t take rides.')}
            </div>

            {model === 'commission' && (
              <label className="block text-sm text-gray-700">
                Platform commission (%)
                <input
                  type="number" min={0.01} max={50} step={0.5}
                  value={pct} onChange={(e) => setPct(e.target.value)}
                  placeholder="e.g. 5"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                {!pctValid && <span className="block text-xs text-red-600 mt-1">Enter a percentage above 0 and at most 50.</span>}
                <span className="block text-xs text-gray-500 mt-1">
                  Applies to rides completed from now on. Past rides keep the rate they were completed with.
                </span>
              </label>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => void save()}
                disabled={!dirty || !pctValid || saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save contract'}
              </button>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>

            {showsMoney && (
              <div className="border-t border-gray-200 pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">This month</p>
                    <p className="font-semibold text-gray-900">{st.period.rides} rides · {eur(st.period.grossFare)}</p>
                    <p className="text-xs text-gray-600">Commission {eur(st.period.commission)}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${st.allTime.balance > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <p className="text-xs text-gray-500">Balance (all time)</p>
                    <p className="font-semibold text-gray-900">{eur(st.allTime.balance)}</p>
                    <p className="text-xs text-gray-600">
                      Owed {eur(st.allTime.commission)}
                      {st.allTime.withheld > 0 && <> · Withheld from card {eur(st.allTime.withheld)}</>}
                      {' '}· Paid {eur(st.allTime.paid)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-900">Record a payment from the {who}</p>
                  <div className="flex gap-2">
                    <input
                      type="number" min={0.01} step={0.01} placeholder="Amount €"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text" maxLength={300} placeholder="Note (e.g. bank transfer, October)"
                      value={payNote} onChange={(e) => setPayNote(e.target.value)}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => void recordPayment()}
                      disabled={!(Number(payAmount) > 0) || paying}
                      className="px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {paying ? '…' : 'Record'}
                    </button>
                  </div>
                </div>

                {st.payments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recent payments</p>
                    <ul className="divide-y divide-gray-100 text-sm">
                      {st.payments.map((p) => (
                        <li key={p.id} className="py-1.5 flex justify-between gap-3">
                          <span className="text-gray-600 truncate">
                            {new Date(p.createdAt).toLocaleDateString()}{p.note ? ` — ${p.note}` : ''}
                          </span>
                          <span className="font-medium text-gray-900">{eur(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
