import React, { useCallback, useEffect, useState } from 'react';
import { Check, Eye, Plus, Upload, X } from 'lucide-react';
import { apiFetch, fileToBase64Attachment } from '../../shared/api/client';
import { AttachmentPreviewModal } from '../../shared/components/AttachmentPreviewModal';
import { StatusText, formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import type { UserSession } from '../dashboard/DashboardView';

interface PaymentItem {
  id: string;
  memberId: string;
  memberNumber: string;
  memberNameEn: string;
  memberNameTa: string | null;
  contributionDueId: string | null;
  submittedByUserId: string | null;
  paymentDate: string;
  amount: string;
  currencyCode: string;
  paymentMethod: string;
  transactionReference: string;
  notes: string | null;
  status: string;
  rejectionReason: string | null;
  canApprove: boolean;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
}

interface DueItem {
  id: string;
  memberId: string;
  memberNumber: string;
  fullNameEn: string;
  periodStart: string;
  periodEnd: string;
  dueAmount: string;
  currencyCode: string;
  dueDate: string;
  status: string;
}

interface MemberOption {
  id: string;
  memberNumber: string;
  fullNameEn: string;
  expectedContributionAmount: string;
  expectedContributionCurrency: 'INR' | 'AED';
  status: string;
}

export const ContributionsView: React.FC<{ user: UserSession; lang: Language }> = ({
  user,
  lang,
}) => {
  const t = translations[lang];
  const isCommitteeOrAdmin = user.roles.some((r) => r === 'committee_member' || r === 'admin');
  const [subTab, setSubTab] = useState<'payments' | 'dues'>('payments');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [dues, setDues] = useState<DueItem[]>([]);
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Payment submission form
  const [showForm, setShowForm] = useState(false);
  const [formMemberId, setFormMemberId] = useState(user.memberId || '');
  const [formDueId, setFormDueId] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'INR' | 'AED'>('INR');
  const [formMethod, setFormMethod] = useState('bank_transfer');
  const [formRef, setFormRef] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAttachment, setFormAttachment] = useState<{
    fileName: string;
    mimeType: string;
    fileDataBase64: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dues generator
  const [genMonth, setGenMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [genBusy, setGenBusy] = useState(false);

  // Reject modal & Preview modal
  const [rejectTarget, setRejectTarget] = useState<PaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewAtt, setPreviewAtt] = useState<{ id: string; fileName: string } | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const [payRes, dueRes] = await Promise.all([
        apiFetch<{ payments: PaymentItem[] }>(`/api/contributions/payments${qs}`),
        apiFetch<{ dues: DueItem[] }>('/api/contributions/dues'),
      ]);
      setPayments(payRes.payments);
      setDues(dueRes.dues);

      if (isCommitteeOrAdmin) {
        const memRes = await apiFetch<{ members: MemberOption[] }>('/api/members');
        setMembersList(memRes.members.filter((m) => m.status === 'active'));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load contributions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, isCommitteeOrAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFormAttachment(null);
      return;
    }
    try {
      const encoded = await fileToBase64Attachment(file);
      setFormAttachment(encoded);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      e.target.value = '';
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/contributions/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId: isCommitteeOrAdmin && formMemberId ? formMemberId : undefined,
          contributionDueId: formDueId || undefined,
          paymentDate: formDate,
          amount: Number(formAmount),
          currencyCode: formCurrency,
          paymentMethod: formMethod,
          transactionReference: formRef,
          notes: formNotes,
          attachment: formAttachment,
        }),
      });
      setShowForm(false);
      setFormAmount('');
      setFormRef('');
      setFormNotes('');
      setFormAttachment(null);
      setNotice('Payment submitted as Pending Verification. Another committee member must approve it.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (item: PaymentItem) => {
    setActionBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const overrideReason =
        !user.roles.includes('committee_member') && user.roles.includes('admin')
          ? 'Admin verification override'
          : undefined;
      const res = await apiFetch<{ transactionNumber?: string }>(
        `/api/contributions/payments/${item.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: `approve-${item.id}`,
            overrideReason,
          }),
        }
      );
      setNotice(
        res.transactionNumber
          ? `Payment verified and posted atomically (${res.transactionNumber}).`
          : 'Payment verified and posted to ledger.'
      );
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Approval failed.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setActionBusyId(rejectTarget.id);
    setError(null);
    try {
      await apiFetch(`/api/contributions/payments/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectTarget(null);
      setRejectReason('');
      setNotice('Payment submission rejected. Ledger remains untouched.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Rejection failed.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleGenerateDues = async () => {
    setGenBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ createdCount: number }>('/api/contributions/dues/generate', {
        method: 'POST',
        body: JSON.stringify({ month: genMonth }),
      });
      setNotice(`Generated ${res.createdCount} dues records for ${genMonth}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to generate dues.');
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.contributions}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Separation of duties enforced: payment creators cannot self-approve submissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-900 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>{isCommitteeOrAdmin ? t.recordCollection : t.submitPayment}</span>
        </button>
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

      {showForm && (
        <form
          onSubmit={handleSubmitPayment}
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {isCommitteeOrAdmin ? t.recordCollection : t.submitPayment}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isCommitteeOrAdmin && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Member *
                </label>
                <select
                  required
                  value={formMemberId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setFormMemberId(id);
                    const found = membersList.find((m) => m.id === id);
                    if (found) {
                      setFormCurrency(found.expectedContributionCurrency);
                      setFormAmount(found.expectedContributionAmount);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select member...</option>
                  {membersList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.memberNumber} — {m.fullNameEn}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Link to Due Period (Optional)
              </label>
              <select
                value={formDueId}
                onChange={(e) => setFormDueId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">General / Unlinked</option>
                {dues
                  .filter(
                    (d) =>
                      d.status !== 'paid' &&
                      (!formMemberId || d.memberId === formMemberId)
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.periodStart} ({formatMoney(d.dueAmount, d.currencyCode)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.amount} *
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.currency}
              </label>
              <select
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value as 'INR' | 'AED')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Payment Method
              </label>
              <select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="exchange_house">UAE Exchange House</option>
                <option value="cash">Cash Collected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Transaction / Receipt Reference *
              </label>
              <input
                type="text"
                required
                value={formRef}
                onChange={(e) => setFormRef(e.target.value)}
                placeholder="UTR / Bank Ref / Cash Receipt #"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Proof Attachment (Optional)
              </label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {formAttachment ? formAttachment.fileName : 'Upload receipt...'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Notes
              </label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-800 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              {submitting ? t.loading : t.submit}
            </button>
          </div>
        </form>
      )}

      {/* Segmented View Toggle + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setSubTab('payments')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
              subTab === 'payments'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Payment Submissions
          </button>
          <button
            type="button"
            onClick={() => setSubTab('dues')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
              subTab === 'dues'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Expected Dues
          </button>
        </div>

        {subTab === 'payments' ? (
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
            {['all', 'pending', 'approved', 'rejected'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        ) : (
          isCommitteeOrAdmin && (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={genMonth}
                onChange={(e) => setGenMonth(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                disabled={genBusy}
                onClick={handleGenerateDues}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-emerald-800"
              >
                {genBusy ? t.loading : 'Generate Month Dues'}
              </button>
            </div>
          )
        )}
      </div>

      {/* Tables */}
      {subTab === 'payments' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="py-10 text-center text-xs text-slate-500">{t.loading}</p>
          ) : payments.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Date &amp; Method</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {lang === 'ta' && p.memberNameTa ? p.memberNameTa : p.memberNameEn}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{p.memberNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div className="font-mono">{p.paymentDate}</div>
                        <div className="text-[11px] text-slate-500">{p.paymentMethod}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-slate-800 dark:text-slate-200">
                          {p.transactionReference}
                        </div>
                        {p.rejectionReason && (
                          <div className="mt-0.5 text-[11px] text-red-600">
                            Reason: {p.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(p.amount, p.currencyCode)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={p.status} lang={lang} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {p.attachments.map((att) => (
                            <button
                              key={att.id}
                              type="button"
                              onClick={() => setPreviewAtt({ id: att.id, fileName: att.fileName })}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Proof</span>
                            </button>
                          ))}

                          {p.status === 'pending' && isCommitteeOrAdmin && (
                            <>
                              {p.canApprove ? (
                                <button
                                  type="button"
                                  disabled={actionBusyId === p.id}
                                  onClick={() => handleApprove(p)}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>{t.approve}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  Creator cannot self-approve
                                </span>
                              )}

                              <button
                                type="button"
                                disabled={actionBusyId === p.id}
                                onClick={() => setRejectTarget(p)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400"
                              >
                                <X className="h-3 w-3" />
                                <span>{t.reject}</span>
                              </button>
                            </>
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
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {dues.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">{t.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 font-medium">Due Date</th>
                    <th className="px-4 py-3 text-right font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dues.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{d.fullNameEn}</div>
                        <div className="font-mono text-[11px] text-slate-500">{d.memberNumber}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                        {d.periodStart} → {d.periodEnd}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{d.dueDate}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(d.dueAmount, d.currencyCode)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusText status={d.status} lang={lang} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleRejectConfirm}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Reject Payment Submission
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {rejectTarget.memberNameEn} ·{' '}
              {formatMoney(rejectTarget.amount, rejectTarget.currencyCode)}
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter clear rejection reason..."
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={actionBusyId === rejectTarget.id}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      <AttachmentPreviewModal
        attachmentId={previewAtt?.id || null}
        fileName={previewAtt?.fileName || ''}
        onClose={() => setPreviewAtt(null)}
      />
    </div>
  );
};
