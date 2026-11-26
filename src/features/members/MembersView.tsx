import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../../shared/api/client';
import { formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import type { UserSession } from '../dashboard/DashboardView';

interface MemberRow {
  id: string;
  memberNumber: string;
  fullNameEn: string;
  fullNameTa: string | null;
  phoneNumber: string | null;
  email: string | null;
  streetEn: string | null;
  locationEn: string | null;
  contributionFrequency: 'monthly' | 'yearly';
  expectedContributionAmount: string;
  expectedContributionCurrency: 'INR' | 'AED';
  status: 'active' | 'inactive';
  roles: string[];
  userAccount: {
    id: string;
    username: string;
    recoveryEmail: string | null;
    status: 'active' | 'disabled';
    hasPassword: boolean;
    hasGoogleLink: boolean;
  } | null;
}

const ALL_ROLE_CODES = ['admin', 'committee_member', 'treasurer', 'member', 'auditor'] as const;

const MemberStatusBadge: React.FC<{ status: 'active' | 'inactive'; lang: Language }> = ({
  status,
  lang,
}) => {
  const t = translations[lang];
  const isActive = status === 'active';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
        isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300'
      }`}
    >
      {isActive ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
      )}
      <span>{isActive ? t.statusActive : t.statusInactive}</span>
    </span>
  );
};

export const MembersView: React.FC<{ user: UserSession; lang: Language }> = ({ user, lang }) => {
  const t = translations[lang];
  const isAdmin = user.roles.includes('admin');
  const canEditMembers = isAdmin || user.roles.includes('committee_member');

  const [membersList, setMembersList] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create / Edit member modal
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [mNum, setMNum] = useState('');
  const [mNameEn, setMNameEn] = useState('');
  const [mNameTa, setMNameTa] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mStreet, setMStreet] = useState('');
  const [mLoc, setMLoc] = useState('');
  const [mFreq, setMFreq] = useState<'monthly' | 'yearly'>('monthly');
  const [mAmt, setMAmt] = useState('500');
  const [mCur, setMCur] = useState<'INR' | 'AED'>('INR');
  const [savingMember, setSavingMember] = useState(false);

  // Login & Roles modal (Admin only)
  const [accessTarget, setAccessTarget] = useState<MemberRow | null>(null);
  const [accUsername, setAccUsername] = useState('');
  const [accRecoveryEmail, setAccRecoveryEmail] = useState('');
  const [accPassword, setAccPassword] = useState('');
  const [accStatus, setAccStatus] = useState<'active' | 'disabled'>('active');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ members: MemberRow[] }>('/api/members');
      setMembersList(res.members);
    } catch (err: any) {
      setError(err.message || 'Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return membersList.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.memberNumber.toLowerCase().includes(q) ||
        m.fullNameEn.toLowerCase().includes(q) ||
        (m.fullNameTa || '').toLowerCase().includes(q) ||
        (m.locationEn || '').toLowerCase().includes(q) ||
        (m.userAccount?.username || '').toLowerCase().includes(q)
      );
    });
  }, [membersList, search, statusFilter]);

  const statusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const m of membersList) {
      if (m.status === 'active') active++;
      else inactive++;
    }
    return { all: membersList.length, active, inactive };
  }, [membersList]);

  const openCreateModal = () => {
    setEditingMember(null);
    setMNum(`M-${String(membersList.length + 1).padStart(4, '0')}`);
    setMNameEn('');
    setMNameTa('');
    setMPhone('');
    setMEmail('');
    setMStreet('');
    setMLoc('');
    setMFreq('monthly');
    setMAmt('500');
    setMCur('INR');
    setShowMemberModal(true);
  };

  const openEditModal = (m: MemberRow) => {
    setEditingMember(m);
    setMNum(m.memberNumber);
    setMNameEn(m.fullNameEn);
    setMNameTa(m.fullNameTa || '');
    setMPhone(m.phoneNumber || '');
    setMEmail(m.email || '');
    setMStreet(m.streetEn || '');
    setMLoc(m.locationEn || '');
    setMFreq(m.contributionFrequency);
    setMAmt(m.expectedContributionAmount);
    setMCur(m.expectedContributionCurrency);
    setShowMemberModal(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMember(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        memberNumber: mNum,
        fullNameEn: mNameEn,
        fullNameTa: mNameTa,
        phoneNumber: mPhone,
        email: mEmail,
        streetEn: mStreet,
        locationEn: mLoc,
        contributionFrequency: mFreq,
        expectedContributionAmount: Number(mAmt),
        expectedContributionCurrency: mCur,
      };
      if (editingMember) {
        await apiFetch(`/api/members/${editingMember.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice(`Member ${editingMember.memberNumber} updated.`);
      } else {
        await apiFetch('/api/members', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setNotice(`Member ${mNum} created.`);
      }
      setShowMemberModal(false);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save member.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleToggleStatus = async (m: MemberRow) => {
    setError(null);
    setNotice(null);
    try {
      const next = m.status === 'active' ? 'inactive' : 'active';
      await apiFetch(`/api/members/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      setNotice(`Member ${m.memberNumber} marked ${next}. Financial history retained.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Status update failed.');
    }
  };

  const openAccessModal = (m: MemberRow) => {
    setAccessTarget(m);
    setAccUsername(
      m.userAccount?.username || m.fullNameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16)
    );
    setAccRecoveryEmail(m.userAccount?.recoveryEmail || m.email || '');
    setAccPassword('');
    setAccStatus(m.userAccount?.status || 'active');
    setSelectedRoles(m.roles.length > 0 ? m.roles : ['member']);
  };

  const handleSaveAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessTarget) return;
    setSavingAccess(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/members/${accessTarget.id}/account`, {
        method: 'POST',
        body: JSON.stringify({
          username: accUsername,
          recoveryEmail: accRecoveryEmail || null,
          password: accPassword || undefined,
          status: accStatus,
        }),
      });
      await apiFetch(`/api/members/${accessTarget.id}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roles: selectedRoles }),
      });
      setNotice(`Login and roles updated for ${accessTarget.fullNameEn}.`);
      setAccessTarget(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save access settings.');
    } finally {
      setSavingAccess(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.members}
          </h1>
        </div>

        {canEditMembers && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, number, location, username..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          {(['all', 'active', 'inactive'] as const).map((st) => {
            const label =
              st === 'all'
                ? lang === 'ta'
                  ? 'அனைத்தும்'
                  : 'All'
                : st === 'active'
                  ? t.statusActive
                  : t.statusInactive;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <span>{label}</span>
                <span className="font-mono text-[11px] tabular-nums opacity-70">
                  {statusCounts[st]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="py-10 text-center text-xs text-slate-500">{t.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Contact &amp; Location</th>
                  <th className="px-4 py-3 text-right font-medium">Expected Due</th>
                  <th className="px-4 py-3 font-medium">Login &amp; Roles</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {m.fullNameEn}
                      </div>
                      {m.fullNameTa && (
                        <div className="text-[11px] text-slate-500">{m.fullNameTa}</div>
                      )}
                      <div className="font-mono text-[11px] text-slate-400">{m.memberNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      <div>{m.phoneNumber || m.email || '—'}</div>
                      <div className="text-[11px] text-slate-400">
                        {[m.streetEn, m.locationEn].filter(Boolean).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(m.expectedContributionAmount, m.expectedContributionCurrency)}
                      </div>
                      <div className="text-[11px] capitalize text-slate-400">
                        {m.contributionFrequency}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        {m.userAccount ? `@${m.userAccount.username}` : 'No login account'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {m.roles
                          .map((r) => t.roles[r as keyof typeof t.roles] || r)
                          .join(' · ') || 'None'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <MemberStatusBadge status={m.status} lang={lang} />
                        {m.userAccount?.status === 'disabled' && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 whitespace-nowrap dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                            {lang === 'ta' ? 'உள்நுழைவு முடக்கப்பட்டது' : 'Login Disabled'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {canEditMembers && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(m)}
                              title={t.edit}
                              aria-label={t.edit}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(m)}
                              title={m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              aria-label={m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              {m.status === 'active' ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => openAccessModal(m)}
                            title="Login & Roles"
                            aria-label="Login & Roles"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-800 dark:hover:bg-emerald-700"
                          >
                            <Shield className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveMember}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {editingMember ? `Edit Member ${editingMember.memberNumber}` : 'Create New Member'}
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Member Number *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingMember)}
                  value={mNum}
                  onChange={(e) => setMNum(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name (English) *
                </label>
                <input
                  type="text"
                  required
                  value={mNameEn}
                  onChange={(e) => setMNameEn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Full Name (Tamil)
                </label>
                <input
                  type="text"
                  value={mNameTa}
                  onChange={(e) => setMNameTa(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={mPhone}
                  onChange={(e) => setMPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Email (for Google Sign-In &amp; Recovery)
                </label>
                <input
                  type="email"
                  value={mEmail}
                  onChange={(e) => setMEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Street
                </label>
                <input
                  type="text"
                  value={mStreet}
                  onChange={(e) => setMStreet(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Location (Village / UAE City)
                </label>
                <input
                  type="text"
                  value={mLoc}
                  onChange={(e) => setMLoc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Contribution Frequency
                </label>
                <select
                  value={mFreq}
                  onChange={(e) => setMFreq(e.target.value as 'monthly' | 'yearly')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Expected Contribution Amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={mAmt}
                  onChange={(e) => setMAmt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Expected Currency
                </label>
                <select
                  value={mCur}
                  onChange={(e) => setMCur(e.target.value as 'INR' | 'AED')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMemberModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingMember}
                className="rounded-lg bg-emerald-800 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {savingMember ? t.loading : t.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Login & Multi-Role Modal (Admin Only) */}
      {accessTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveAccess}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-800 dark:text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Login &amp; Roles · {accessTarget.fullNameEn}
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Assigned Username *
                </label>
                <input
                  type="text"
                  required
                  value={accUsername}
                  onChange={(e) => setAccUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Google / Recovery Email
                </label>
                <input
                  type="email"
                  value={accRecoveryEmail}
                  onChange={(e) => setAccRecoveryEmail(e.target.value)}
                  placeholder="Optional for Google Sign-In auto-link"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {accessTarget.userAccount?.hasPassword
                    ? 'Reset Password (leave blank to keep current)'
                    : 'Assign Password (min 8 chars)'}
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={accPassword}
                  onChange={(e) => setAccPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Account Status
                </label>
                <select
                  value={accStatus}
                  onChange={(e) => setAccStatus(e.target.value as 'active' | 'disabled')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Assigned Roles (Multiple Allowed)
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ALL_ROLE_CODES.map((roleCode) => {
                    const checked = selectedRoles.includes(roleCode);
                    return (
                      <label
                        key={roleCode}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRoles([...selectedRoles, roleCode]);
                            } else {
                              setSelectedRoles(selectedRoles.filter((r) => r !== roleCode));
                            }
                          }}
                          className="h-3.5 w-3.5 accent-emerald-800"
                        />
                        <span>{t.roles[roleCode]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccessTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={savingAccess}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {savingAccess ? t.loading : t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
