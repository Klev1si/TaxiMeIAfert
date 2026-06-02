import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface CompanyProfile {
  id: string;
  phone: string;
  email: string | null;
  role: string;
  avatarUrl: string | null;
  companyName: string | null;
  address: string | null;
  city: string | null;
  logoUrl: string | null;
  isApproved: boolean;
  driverCommissionPct: number | null;
}

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Form state
  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [city,    setCity]    = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<CompanyProfile>('/auth/me');
      setProfile(res.data);
      setName(res.data.companyName ?? '');
      setAddress(res.data.address ?? '');
      setCity(res.data.city ?? '');
      setLogoUrl(res.data.logoUrl ?? '');
    } catch {
      setError('Could not load company info.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameChanged = !!profile && name.trim() !== (profile.companyName ?? '');

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Company name is required.');
      return;
    }
    if (nameChanged && profile?.isApproved) {
      const ok = window.confirm(
        'Changing the company name will revoke your approved status. An admin must re-approve you.\n\nContinue?'
      );
      if (!ok) return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await apiClient.patch('/auth/profile', {
        companyName: name.trim() || undefined,
        address:     address.trim() ? address.trim() : '',
        city:        city.trim()    ? city.trim()    : '',
        logoUrl:     logoUrl.trim() ? logoUrl.trim() : '',
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      load();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Failed to save.';
      setSaveError(Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'company' && user?.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
        <p className="text-sm text-gray-500 mt-1">
          Your company information. Some changes require admin re-approval.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={load} className="mt-3 text-sm text-indigo-600 hover:underline font-semibold">
            Retry
          </button>
        </div>
      ) : profile ? (
        <>
          {/* Account card (read-only) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Account
            </p>
            <div className="space-y-2 text-sm">
              <Row label="Phone" value={profile.phone} />
              <Row label="Email" value={profile.email ?? '—'} />
              <Row
                label="Status"
                value={profile.isApproved
                  ? <span className="text-green-700 font-bold">✓ Approved</span>
                  : <span className="text-yellow-700 font-bold">⏳ Pending re-approval</span>}
              />
            </div>
          </div>

          {/* Edit form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Edit company info
            </p>

            <Field
              label="Company name"
              hint={nameChanged && profile.isApproved
                ? <span className="text-amber-700 text-xs">⚠ Saving will revoke your approval.</span>
                : <span className="text-xs text-gray-400">Changing requires admin re-approval.</span>}
            >
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                maxLength={150}
              />
            </Field>

            <Field label="Address">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                maxLength={300}
                placeholder="Street, building, etc."
              />
            </Field>

            <Field label="City">
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                maxLength={100}
                placeholder="e.g. Pristina"
              />
            </Field>

            <Field
              label="Logo URL"
              hint={<span className="text-xs text-gray-400">Paste a public image URL. File upload coming soon.</span>}
            >
              <input
                type="url"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                maxLength={500}
                placeholder="https://…"
              />
            </Field>

            {logoUrl.trim() && (
              <div className="flex items-center gap-3 pt-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Preview
                </span>
                <img
                  src={logoUrl.trim()}
                  alt="Logo preview"
                  className="w-16 h-16 rounded-lg object-contain bg-gray-50 border border-gray-200"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
                ✓ Saved
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1">{hint}</div>}
    </div>
  );
}
