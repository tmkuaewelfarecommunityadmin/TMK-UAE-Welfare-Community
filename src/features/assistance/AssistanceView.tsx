import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, Eye, Plus, Upload, X } from 'lucide-react';
import { apiFetch, fileToBase64Attachment } from '../../shared/api/client';
import { AttachmentPreviewModal } from '../../shared/components/AttachmentPreviewModal';
import { StatusText, formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import type { UserSession } from '../dashboard/DashboardView';

interface AssistanceItem {
  id: string;
  requestNumber: string;
  publicRequesterName: string | null;
  beneficiaryNameEn: string;
  beneficiaryNameTa: string | null;
  familyNameEn: string | null;
  streetEn: string | null;
  requestedAmount: string;
  currencyCode: 'INR' | 'AED';
  reason: string;
  requestType: 'normal' | 'emergency';
  status: string;
  payoutAmount: string | null;
  payoutCurrencyCode: string | null;
  payoutReference: string | null;
  createdAt: string;
  round: {
    id: string;
    eligibleCommitteeCount: number;
    requiredApprovals: number;
    approvalsCount: number;
    rejectionsCount: number;
    isEligibleVoter: boolean;
    hasVoted: boolean;
    votes: Array<{
      id: string;
      memberNameEn: string;
      decision: string;
      comments: string | null;
    }>;
  } | null;
  attachments: Array<{ id: string; fileName: string }>;
}

export const AssistanceView: React.FC<{ user: UserSession; lang: Language }> = ({ user, lang }) => {
  const t = translations[lang];
  const canExecutePayout = user.roles.some((r) => r === 'treasurer' || r === 'admin');
  const [requests, setRequests] = useState<AssistanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [benNameEn, setBenNameEn] = useState('');
  const [benNameTa, setBenNameTa] = useState('');
  const [familyNameEn, setFamilyNameEn] = useState('');
  const [streetEn, setStreetEn] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'INR' | 'AED'>('INR');
  const [requestType, setRequestType] = useState<'normal' | 'emergency'>('normal');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<{
    fileName: string;
    mimeType: string;
    fileDataBase64: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);

  // Payout confirmation modal
  const [payoutTarget, setPayoutTarget] = useState<AssistanceItem | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutCurrency, setPayoutCurrency] = useState<'INR' | 'AED'>('INR');
  const [payoutAccountCode, setPayoutAccountCode] = useState('1010');
  const [payoutRef, setPayoutRef] = useState('');
  const [payoutOverrideReason, setPayoutOverrideReason] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);

  // Vote comment modal
  const [voteTarget, setVoteTarget] = useState<{
    item: AssistanceItem;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [voteComment, setVoteComment] = useState('');
  const [voteBusy, setVoteBusy] = useState(false);

  const [previewAtt, setPreviewAtt] = useState<{ id: string; fileName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ requests: AssistanceItem[] }>('/api/assistance');
      setRequests(res.requests);
    } catch (err: any) {
      setError(err.message || 'Failed to load assistance requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    try {
      const encoded = await fileToBase64Attachment(file);
      setAttachment(encoded);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      e.target.value = '';
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ request: { requestNumber: string } }>('/api/assistance', {
        method: 'POST',
        body: JSON.stringify({
          beneficiaryNameEn: benNameEn,
          beneficiaryNameTa: benNameTa,
          familyNameEn,
          streetEn,
          requestedAmount: Number(amount),
          currencyCode: currency,
          requestType,
          reason,
          attachment,
        }),
      });
      setShowCreate(false);
      setBenNameEn('');
      setBenNameTa('');
      setFamilyNameEn('');
      setStreetEn('');
      setAmount('');
      setReason('');
      setAttachment(null);
      setNotice(`Assistance request ${res.request.requestNumber} created.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to submit assistance request.');
    } finally {
      setCreating(false);
    }
  };

  const handleVoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voteTarget) return;
    setVoteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ status: string; approvedCount: number; requiredApprovals: number }>(
        `/api/assistance/${voteTarget.item.id}/vote`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision: voteTarget.decision,
            comments: voteComment,
          }),
        }
      );
      setNotice(
        `Vote recorded (${res.approvedCount}/${res.requiredApprovals} approvals). Current status: ${res.status}.`
      );
      setVoteTarget(null);
      setVoteComment('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Vote failed.');
    } finally {
      setVoteBusy(false);
    }
  };

  const handlePayoutConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutTarget) return;
    setPayoutBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ transactionNumber: string }>(
        `/api/assistance/${payoutTarget.id}/payout`,
        {
          method: 'POST',
          body: JSON.stringify({
            payoutAmount: Number(payoutAmount),
            currencyCode: payoutCurrency,
            accountCode: payoutAccountCode,
            payoutReference: payoutRef,
            overrideReason: payoutOverrideReason,
            idempotencyKey: `payout-${payoutTarget.id}`,
          }),
        }
      );
      setNotice(`Assistance payout executed and posted (${res.transactionNumber}).`);
      setPayoutTarget(null);
      setPayoutRef('');
      setPayoutOverrideReason('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Payout failed.');
    } finally {
      setPayoutBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.assistance}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Normal requests require 50% frozen committee approval; Emergency requires 1 approval.
            Treasurer executes payout separately.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-900 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>New Assistance Request</span>
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

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Submit Assistance Request
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.beneficiaryNameEn} *
              </label>
              <input
                type="text"
                required
                value={benNameEn}
                onChange={(e) => setBenNameEn(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.beneficiaryNameTa}
              </label>
              <input
                type="text"
                value={benNameTa}
                onChange={(e) => setBenNameTa(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Family / Street
              </label>
              <input
                type="text"
                value={familyNameEn}
                onChange={(e) => setFamilyNameEn(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.currency}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'INR' | 'AED')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="INR">INR</option>
                <option value="AED">AED</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.urgency}
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as 'normal' | 'emergency')}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="normal">{t.normalRequest}</option>
                <option value="emergency">{t.emergencyRequest}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.reason} *
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Attachment (Optional)
              </label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate">{attachment ? attachment.fileName : 'Attach proof...'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-800 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              {creating ? t.loading : t.submit}
            </button>
          </div>
        </form>
      )}

      {/* Assistance Requests List */}
      {loading ? (
        <p className="py-10 text-center text-xs text-slate-500">{t.loading}</p>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {t.noData}
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {item.requestNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">
                      {item.requestType === 'emergency' ? 'Emergency (1 approval)' : 'Normal (50%)'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    {item.publicRequesterName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Public req: {item.publicRequesterName}</span>
                      </>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white">
                    {lang === 'ta' && item.beneficiaryNameTa
                      ? item.beneficiaryNameTa
                      : item.beneficiaryNameEn}
                    {item.familyNameEn ? ` · ${item.familyNameEn}` : ''}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.reason}</p>
                </div>

                <div className="text-right">
                  <div className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatMoney(item.requestedAmount, item.currencyCode)}
                  </div>
                  <div className="mt-1">
                    <StatusText status={item.status} lang={lang} />
                  </div>
                </div>
              </div>

              {/* Approval Round Progress + Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
                  {item.round ? (
                    <span className="font-mono">
                      Votes: {item.round.approvalsCount}/{item.round.requiredApprovals} required (of{' '}
                      {item.round.eligibleCommitteeCount} frozen voters)
                    </span>
                  ) : (
                    <span>Awaiting committee assignment</span>
                  )}

                  {item.attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setPreviewAtt({ id: att.id, fileName: att.fileName })}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Eye className="h-3 w-3" />
                      <span>{att.fileName}</span>
                    </button>
                  ))}

                  {item.status === 'paid' && item.payoutReference && (
                    <span className="font-mono text-emerald-800 dark:text-emerald-400">
                      Paid {formatMoney(item.payoutAmount, item.payoutCurrencyCode || 'INR')} · Ref{' '}
                      {item.payoutReference}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {item.status === 'pending_approval' &&
                    item.round?.isEligibleVoter &&
                    !item.round.hasVoted && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setVoteTarget({ item, decision: 'approved' });
                            setVoteComment('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{t.approve}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVoteTarget({ item, decision: 'rejected' });
                            setVoteComment('');
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>{t.reject}</span>
                        </button>
                      </>
                    )}

                  {item.status === 'approved' && canExecutePayout && (
                    <button
                      type="button"
                      onClick={() => {
                        setPayoutTarget(item);
                        setPayoutAmount(item.requestedAmount);
                        setPayoutCurrency(item.currencyCode);
                        setPayoutAccountCode(item.currencyCode === 'AED' ? '1030' : '1010');
                        setPayoutRef('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-emerald-700"
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      <span>{t.payout}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vote Modal */}
      {voteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleVoteSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Confirm Committee Vote: {voteTarget.decision === 'approved' ? t.approve : t.reject}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {voteTarget.item.requestNumber} · {voteTarget.item.beneficiaryNameEn} (
              {formatMoney(voteTarget.item.requestedAmount, voteTarget.item.currencyCode)})
            </p>
            <textarea
              rows={3}
              required={voteTarget.decision === 'rejected'}
              value={voteComment}
              onChange={(e) => setVoteComment(e.target.value)}
              placeholder="Committee review comment (required if rejecting)..."
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={voteBusy}
                className={`rounded-lg px-4 py-2 text-xs font-medium text-white ${
                  voteTarget.decision === 'approved'
                    ? 'bg-emerald-800 hover:bg-emerald-900'
                    : 'bg-red-700 hover:bg-red-800'
                }`}
              >
                {voteBusy ? t.loading : 'Submit Vote'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payout Confirmation Modal (UX-REQ: Review amount & currency before final action) */}
      {payoutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handlePayoutConfirm}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Confirm Assistance Payout
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {payoutTarget.requestNumber} · {payoutTarget.beneficiaryNameEn}
            </p>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Payout Amount *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Currency
                  </label>
                  <select
                    value={payoutCurrency}
                    onChange={(e) => {
                      const c = e.target.value as 'INR' | 'AED';
                      setPayoutCurrency(c);
                      setPayoutAccountCode(c === 'AED' ? '1030' : '1010');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="INR">INR</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Source Fund Account
                </label>
                <select
                  value={payoutAccountCode}
                  onChange={(e) => setPayoutAccountCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {payoutCurrency === 'INR' ? (
                    <>
                      <option value="1010">1010 · India Bank Account (INR)</option>
                      <option value="1020">1020 · India Cash in Hand (INR)</option>
                    </>
                  ) : (
                    <option value="1030">1030 · UAE Collection Account (AED)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bank / Cash Voucher Reference *
                </label>
                <input
                  type="text"
                  required
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder="NEFT / UPI / Voucher Reference"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              {!user.roles.includes('treasurer') && user.roles.includes('admin') && (
                <div>
                  <label className="block text-xs font-medium text-amber-800 dark:text-amber-300">
                    Admin Override Reason *
                  </label>
                  <input
                    type="text"
                    required
                    value={payoutOverrideReason}
                    onChange={(e) => setPayoutOverrideReason(e.target.value)}
                    placeholder="Reason for executing payout as Admin"
                    className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-950"
                  />
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                Review: Posting irreversible ledger debit of{' '}
                <strong className="font-mono">
                  {formatMoney(payoutAmount || '0', payoutCurrency)}
                </strong>{' '}
                from account <strong className="font-mono">{payoutAccountCode}</strong>.
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayoutTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={payoutBusy}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {payoutBusy ? t.loading : 'Confirm & Post Payout'}
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
