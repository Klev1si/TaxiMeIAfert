import { useEffect, useState, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';
import Pagination from '../components/Pagination';
import StatusBadge from '../components/StatusBadge';

type FilterTab = 'all' | 'pending' | 'approved';

interface Driver {
  id: string;
  userId: string;
  companyId: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string | null;
  isApproved: boolean;
  isOnline: boolean;
  rating: number;
  totalRides: number;
  totalAccepted: number;
  totalDeclined: number;
  acceptanceRate: number | null;
  createdAt: string;
}

const LIMIT = 20;

interface AddDriverForm {
  phone: string; password: string;
  firstName: string; lastName: string;
  licenseNumber: string;
  vehicleMake: string; vehicleModel: string;
  vehicleYear: string; vehiclePlate: string; vehicleColor: string;
}
const EMPTY_ADD: AddDriverForm = {
  phone: '', password: '', firstName: '', lastName: '',
  licenseNumber: '', vehicleMake: '', vehicleModel: '',
  vehicleYear: '', vehiclePlate: '', vehicleColor: '',
};

export default function DriversPage() {
  const { user }  = useAuthStore();
  const isAdmin   = user?.role === 'super_admin';

  const [filter,       setFilter]       = useState<FilterTab>('all');
  const [search,       setSearch]       = useState('');
  const [searchInput,  setSearchInput]  = useState('');
  const [drivers,      setDrivers]      = useState<Driver[]>([]);
  const [total,        setTotal]        = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [actionId,     setActionId]     = useState<string | null>(null);

  // Detail panel
  const [detail, setDetail] = useState<Driver | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<Driver | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  // Add Driver modal (company only)
  const [addOpen,   setAddOpen]   = useState(false);
  const [addForm,   setAddForm]   = useState<AddDriverForm>(EMPTY_ADD);
  const [addSaving, setAddSaving] = useState(false);
  const [addError,  setAddError]  = useState('');

  const fetchDrivers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/admin/drivers' : '/company/drivers';
      const params: Record<string, string | number> = { filter, page: p, limit: LIMIT };
      if (search) params.search = search;
      const { data } = await apiClient.get<{ drivers: Driver[]; total: number }>(endpoint, { params });
      setDrivers(data.drivers);
      setTotal(data.total);
    } catch {
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search, isAdmin]);

  // Separate lightweight fetch for the pending badge count (admin only)
  const fetchPendingCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await apiClient.get<{ drivers: Driver[]; total: number }>(
        '/admin/drivers', { params: { filter: 'pending', page: 1, limit: 1 } },
      );
      setPendingCount(data.total);
    } catch { /* ignore */ }
  }, [isAdmin]);

  useEffect(() => { setPage(1); fetchDrivers(1); }, [filter, search, fetchDrivers]);
  useEffect(() => { fetchPendingCount(); }, [fetchPendingCount]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleApprove = async (driver: Driver) => {
    setActionId(driver.id);
    try {
      await apiClient.patch(`/admin/drivers/${driver.id}/approve`);
      // Update the detail panel if it's open for this driver
      setDetail(prev => prev?.id === driver.id ? { ...prev, isApproved: true } : prev);
      fetchDrivers(page);
      fetchPendingCount();
    } finally {
      setActionId(null);
    }
  };

  const openReject = (driver: Driver) => {
    setRejectTarget(driver);
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setRejectSaving(true);
    try {
      await apiClient.patch(`/admin/drivers/${rejectTarget.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      setRejectTarget(null);
      // Close detail panel if it was showing the rejected driver
      setDetail(prev => prev?.id === rejectTarget.id ? null : prev);
      fetchDrivers(page);
      fetchPendingCount();
    } finally {
      setRejectSaving(false);
    }
  };

  const handleAddDriver = async () => {
    setAddError('');
    const year = parseInt(addForm.vehicleYear, 10);
    if (!addForm.phone.trim())         { setAddError('Phone is required.'); return; }
    if (!addForm.password.trim())      { setAddError('Password is required (min 6 chars).'); return; }
    if (addForm.password.length < 6)   { setAddError('Password must be at least 6 characters.'); return; }
    if (!addForm.firstName.trim())     { setAddError('First name is required.'); return; }
    if (!addForm.lastName.trim())      { setAddError('Last name is required.'); return; }
    if (!addForm.licenseNumber.trim()) { setAddError('License number is required.'); return; }
    if (!addForm.vehicleMake.trim())   { setAddError('Vehicle make is required.'); return; }
    if (!addForm.vehicleModel.trim())  { setAddError('Vehicle model is required.'); return; }
    if (isNaN(year) || year < 1990)    { setAddError('Enter a valid vehicle year (1990+).'); return; }
    if (!addForm.vehiclePlate.trim())  { setAddError('License plate is required.'); return; }
    setAddSaving(true);
    try {
      await apiClient.post('/company/drivers', {
        phone:         addForm.phone.trim(),
        password:      addForm.password,
        firstName:     addForm.firstName.trim(),
        lastName:      addForm.lastName.trim(),
        licenseNumber: addForm.licenseNumber.trim(),
        vehicleMake:   addForm.vehicleMake.trim(),
        vehicleModel:  addForm.vehicleModel.trim(),
        vehicleYear:   year,
        vehiclePlate:  addForm.vehiclePlate.trim(),
        vehicleColor:  addForm.vehicleColor.trim() || undefined,
      });
      setAddOpen(false);
      setAddForm(EMPTY_ADD);
      fetchDrivers(1);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setAddError(Array.isArray(msg) ? msg.join(' · ') : (msg ?? 'Failed to add driver.'));
    } finally {
      setAddSaving(false);
    }
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
  ];

  return (
    <div className="flex gap-5 h-full">

      {/* ── Left: list + table ─────────────────────────────────────────────── */}
      <div className={`flex flex-col gap-5 min-w-0 transition-all duration-200 ${detail ? 'flex-1' : 'w-full'}`}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isAdmin ? 'Drivers' : 'My Drivers'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {!isAdmin && (
              <button
                onClick={() => { setAddOpen(true); setAddForm(EMPTY_ADD); setAddError(''); }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                + Add Driver
              </button>
            )}
            <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search name or plate…"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
                Search
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                  Clear
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {/* Pending count badge */}
              {tab.key === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-3xl mb-2">🚗</p>
              <p className="text-sm">No drivers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Driver</th>
                  {!detail && <th className="text-left px-4 py-3 font-semibold text-gray-600">Vehicle</th>}
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Plate</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Rating</th>
                  {!detail && <th className="text-left px-4 py-3 font-semibold text-gray-600">Rides</th>}
                  {isAdmin && <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drivers.map(d => (
                  <tr
                    key={d.id}
                    onClick={() => setDetail(prev => prev?.id === d.id ? null : d)}
                    className={`cursor-pointer transition-colors ${
                      detail?.id === d.id
                        ? 'bg-indigo-50 hover:bg-indigo-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{d.firstName} {d.lastName}</div>
                      <div className="text-gray-400 text-xs">{d.licenseNumber}</div>
                    </td>
                    {!detail && (
                      <td className="px-4 py-3 text-gray-700">
                        {d.vehicleMake} {d.vehicleModel} ({d.vehicleYear})
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-gray-800">{d.vehiclePlate}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusBadge label={d.isApproved ? 'Approved' : 'Pending'} variant={d.isApproved ? 'green' : 'yellow'} />
                        {d.isOnline && <div><StatusBadge label="Online" variant="blue" /></div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">⭐ {d.rating.toFixed(1)}</td>
                    {!detail && <td className="px-4 py-3 text-gray-700">{d.totalRides}</td>}
                    {isAdmin && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          {!d.isApproved && (
                            <button
                              disabled={actionId === d.id}
                              onClick={() => handleApprove(d)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              {actionId === d.id ? '…' : 'Approve'}
                            </button>
                          )}
                          <button
                            disabled={actionId === d.id}
                            onClick={() => openReject(d)}
                            className="px-3 py-1 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <Pagination page={page} total={total} limit={LIMIT} onChange={p => { setPage(p); fetchDrivers(p); }} />
      </div>

      {/* ── Right: Driver Detail Panel — side panel on desktop, modal on mobile ── */}
      {detail && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setDetail(null)} />
        </>
      )}
      {detail && (
        <div className="
          fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl
          lg:static lg:w-80 lg:max-h-none lg:rounded-xl lg:z-auto lg:inset-auto
          shrink-0 bg-white border border-gray-200 flex flex-col overflow-hidden
          lg:self-start lg:sticky lg:top-0
        ">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Driver Details</h3>
            <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          {/* Avatar + name */}
          <div className="flex flex-col items-center pt-6 pb-4 px-5 border-b border-gray-100">
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
              {detail.firstName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="font-bold text-gray-900 text-lg">{detail.firstName} {detail.lastName}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge label={detail.isApproved ? 'Approved' : 'Pending'} variant={detail.isApproved ? 'green' : 'yellow'} />
              {detail.isOnline && <StatusBadge label="Online" variant="blue" />}
            </div>
          </div>

          {/* Details */}
          <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">

            <DetailSection title="Account">
              <DetailRow label="Phone"   value={detail.phone ?? '—'} />
              <DetailRow label="License" value={detail.licenseNumber} />
              <DetailRow label="Joined"  value={new Date(detail.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} />
            </DetailSection>

            <DetailSection title="Performance">
              <DetailRow label="Rating"          value={`⭐ ${detail.rating.toFixed(1)}`} />
              <DetailRow label="Total Rides"     value={String(detail.totalRides)} />
              <DetailRow label="Accepted"        value={String(detail.totalAccepted ?? 0)} />
              <DetailRow label="Declined"        value={String(detail.totalDeclined ?? 0)} />
              <DetailRow
                label="Acceptance Rate"
                value={detail.acceptanceRate != null ? `${detail.acceptanceRate.toFixed(1)}%` : '—'}
              />
            </DetailSection>

            <DetailSection title="Vehicle">
              <DetailRow label="Make / Model" value={`${detail.vehicleMake} ${detail.vehicleModel}`} />
              <DetailRow label="Year"         value={String(detail.vehicleYear)} />
              <DetailRow label="Plate"        value={detail.vehiclePlate} mono />
              {detail.vehicleColor && (
                <DetailRow label="Color" value={detail.vehicleColor} />
              )}
            </DetailSection>

          </div>

          {/* Actions (admin only) */}
          {isAdmin && (
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              {!detail.isApproved && (
                <button
                  disabled={actionId === detail.id}
                  onClick={() => handleApprove(detail)}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {actionId === detail.id ? '…' : '✅ Approve'}
                </button>
              )}
              <button
                disabled={actionId === detail.id}
                onClick={() => openReject(detail)}
                className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-lg transition-colors"
              >
                ❌ Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Reject with reason modal ─────────────────────────────────────── */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Reject Driver</h3>
              <button onClick={() => setRejectTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                You are about to reject <span className="font-semibold text-gray-900">{rejectTarget.firstName} {rejectTarget.lastName}</span>'s driver account. Their account will be deactivated and they will be notified.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
                  Rejection Reason <span className="text-gray-400 font-normal normal-case">(optional — sent to driver)</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Invalid license number, vehicle does not meet requirements…"
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
                <p className="text-xs text-gray-400 text-right mt-1">{rejectReason.length}/500</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={rejectSaving}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {rejectSaving ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Driver Modal (company only) ──────────────────────────────── */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Add Driver</h3>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Account</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone (E.164)</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+37491123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Temporary Password</label>
                  <input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 6 characters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-1">Personal Info</p>
              <div className="grid grid-cols-2 gap-3">
                {([['firstName','First Name'],['lastName','Last Name'],['licenseNumber','License Number','col-span-2']] as [keyof AddDriverForm, string, string?][]).map(([k, lbl, span]) => (
                  <div key={k} className={span ?? ''}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{lbl}</label>
                    <input value={addForm[k]} onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                ))}
              </div>

              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-1">Vehicle</p>
              <div className="grid grid-cols-2 gap-3">
                {([['vehicleMake','Make'],['vehicleModel','Model'],['vehicleYear','Year'],['vehiclePlate','Plate'],['vehicleColor','Color (optional)','col-span-2']] as [keyof AddDriverForm, string, string?][]).map(([k, lbl, span]) => (
                  <div key={k} className={span ?? ''}>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">{lbl}</label>
                    <input value={addForm[k]} onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))}
                      type={k === 'vehicleYear' ? 'number' : 'text'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                ))}
              </div>

              {addError && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button onClick={() => setAddOpen(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddDriver} disabled={addSaving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {addSaving ? 'Adding…' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail panel sub-components ───────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{title}</p>
      <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center px-3 py-2">
      <span className="text-xs text-gray-500 shrink-0 mr-3">{label}</span>
      <span className={`text-xs font-semibold text-gray-900 text-right truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
