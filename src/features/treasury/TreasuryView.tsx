import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Plus, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../shared/api/client';
import { StatusText, formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import type { UserSession } from '../dashboard/DashboardView';

interface AccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountNameTa: string;
  accountType: string;
  currencyCode: string;
  debitTotal: string;
  creditTotal: string;
  balance: string;
}

interface TransactionRow {
  id: string;
  transactionNumber: string;
  transactionType: string;
  transactionDate: string;
  description: string;
  status: string;
  entries: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    side: 'debit' | 'credit';
    accountCurrencyCode: string;
    transactionAmount: string;
    functionalAmountInr: string;
    exchangeRateToInr: string;
  }>;
}

interface SettlementData {
  month: string;
  totalAedCollected: string;
  confirmedAedPayments: Array<{
    id: string;
    memberNumber: string;
    memberNameEn: string;
    paymentDate: string;
    amount: string;
    transactionReference: string;
  }>;
  settlements: Array<{
    id: string;
    settlementMonth: string;
    totalAedCollected: string;
    exchangeRateInrPerAed: string;
    grossInrAmount: string;
    totalChargesInr: string;
    netInrAmount: string;
    bankReference: string;
    status: string;
  }>;
}

export const TreasuryView: React.FC<{ user: UserSession; lang: Language }> = ({ user, lang }) => {
  const t = translations[lang];
  const canTransact = user.roles.some((r) => r === 'treasurer' || r === 'admin');
  const [subTab, setSubTab] = useState<'ledger' | 'settlement'>('ledger');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual Inflow / Expense Form
  const [showManualForm, setShowManualForm] = useState(false);
  const [txnType, setTxnType] = useState<'inflow' | 'expense'>('expense');
  const [txnCurrency, setTxnCurrency] = useState<'INR' | 'AED'>('INR');
  const [txnAccount, setTxnAccount] = useState('1010');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txnDesc, setTxnDesc] = useState('');
  const [txnBusy, setTxnBusy] = useState(false);

  // Reversal Modal
  const [reverseTarget, setReverseTarget] = useState<TransactionRow | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseBusy, setReverseBusy] = useState(false);

  // UAE Settlement
  const [settleMonth, setSettleMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [settleData, setSettleData] = useState<SettlementData | null>(null);
  const [rateInput, setRateInput] = useState('22.50');
  const [txCharge, setTxCharge] = useState('0');
  const [txChargeCur, setTxChargeCur] = useState<'INR' | 'AED'>('AED');
  const [taxAmt, setTaxAmt] = useState('0');
  const [taxCur, setTaxCur] = useState<'INR' | 'AED'>('AED');
  const [otherAmt, setOtherAmt] = useState('0');
  const [otherCur, setOtherCur] = useState<'INR' | 'AED'>('INR');
  const [bankRef, setBankRef] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, stl] = await Promise.all([
        apiFetch<{ accounts: AccountRow[]; transactions: TransactionRow[] }>(
          '/api/treasury/overview'
        ),
        apiFetch<SettlementData>(
          `/api/treasury/settlements?month=${encodeURIComponent(settleMonth)}`
        ),
      ]);
      setAccounts(ov.accounts);
      setTransactions(ov.transactions);
      setSettleData(stl);
    } catch (err: any) {
      setError(err.message || 'Failed to load treasury.');
    } finally {
      setLoading(false);
    }
  }, [settleMonth]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const settlePreview = useMemo(() => {
    const totalAed = Number(settleData?.totalAedCollected || 0);
    const rate = Number(rateInput || 0);
    if (!Number.isFinite(totalAed) || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    const grossInr = totalAed * rate;
    const toInr = (amt: string, cur: 'INR' | 'AED') => {
      const n = Number(amt || 0);
      if (!Number.isFinite(n) || n < 0) return 0;
      return cur === 'INR' ? n : n * rate;
    };
    const c1 = toInr(txCharge, txChargeCur);
    const c2 = toInr(taxAmt, taxCur);
    const c3 = toInr(otherAmt, otherCur);
    const totalChargesInr = c1 + c2 + c3;
    const netInr = grossInr - totalChargesInr;
    return {
      totalAed,
      rate,
      grossInr,
      txChargeInr: c1,
      taxInr: c2,
      otherInr: c3,
      totalChargesInr,
      netInr,
    };
  }, [settleData, rateInput, txCharge, txChargeCur, taxAmt, taxCur, otherAmt, otherCur]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxnBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ transactionNumber: string }>('/api/treasury/transactions', {
        method: 'POST',
        body: JSON.stringify({
          transactionType: txnType,
          currencyCode: txnCurrency,
          assetAccountCode: txnAccount,
          amount: Number(txnAmount),
          transactionDate: txnDate,
          description: txnDesc,
        }),
      });
      setShowManualForm(false);
      setTxnAmount('');
      setTxnDesc('');
      setNotice(`Posted ${txnType} journal (${res.transactionNumber}).`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to post transaction.');
    } finally {
      setTxnBusy(false);
    }
  };

  const handleReverseConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setReverseBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ transactionNumber: string }>(
        `/api/treasury/transactions/${reverseTarget.id}/reverse`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reverseReason }),
        }
      );
      setReverseTarget(null);
      setReverseReason('');
      setNotice(`Reversal journal posted (${res.transactionNumber}). Original entry preserved.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Reversal failed.');
    } finally {
      setReverseBusy(false);
    }
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ transactionNumber: string }>(
        '/api/treasury/settlements/confirm',
        {
          method: 'POST',
          body: JSON.stringify({
            month: settleMonth,
            exchangeRateInrPerAed: Number(rateInput),
            transactionCharge: Number(txCharge || 0),
            transactionChargeCurrency: txChargeCur,
            taxAmount: Number(taxAmt || 0),
            taxCurrency: taxCur,
            otherCharges: Number(otherAmt || 0),
            otherChargesCurrency: otherCur,
            bankReference: bankRef,
          }),
        }
      );
      setBankRef('');
      setNotice(
        `UAE settlement for ${settleMonth} confirmed and posted (${res.transactionNumber}).`
      );
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Settlement failed.');
    } finally {
      setSettleBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.treasury}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setSubTab('ledger')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                subTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Ledger &amp; Accounts
            </button>
            <button
              type="button"
              onClick={() => setSubTab('settlement')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition ${
                subTab === 'settlement'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              UAE Settlement
            </button>
          </div>

          {canTransact && subTab === 'ledger' && (
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-900 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record Inflow / Expense</span>
            </button>
          )}
        </div>
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

      {subTab === 'ledger' ? (
        <>
          {showManualForm && canTransact && (
            <form
              onSubmit={handleManualSubmit}
              className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Post Authorized Treasury Inflow / Expense
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Entry Type
                  </label>
                  <select
                    value={txnType}
                    onChange={(e) => setTxnType(e.target.value as 'inflow' | 'expense')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="expense">Operational Expense</option>
                    <option value="inflow">Other Inflow / Grant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Currency &amp; Account
                  </label>
                  <select
                    value={txnAccount}
                    onChange={(e) => {
                      const code = e.target.value;
                      setTxnAccount(code);
                      setTxnCurrency(code === '1030' ? 'AED' : 'INR');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="1010">1010 · India Bank (INR)</option>
                    <option value="1020">1020 · India Cash (INR)</option>
                    {txnType === 'inflow' && <option value="1030">1030 · UAE Collection (AED)</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount ({txnCurrency}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={txnAmount}
                    onChange={(e) => setTxnAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Description &amp; Reference *
                  </label>
                  <input
                    type="text"
                    required
                    value={txnDesc}
                    onChange={(e) => setTxnDesc(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={txnBusy}
                  className="rounded-lg bg-emerald-800 px-5 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
                >
                  {txnBusy ? t.loading : 'Post Balanced Entry'}
                </button>
              </div>
            </form>
          )}

          {/* Chart of Accounts */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Chart of Accounts Reconciliation
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Debits</th>
                    <th className="px-4 py-3 text-right font-medium">Credits</th>
                    <th className="px-4 py-3 text-right font-medium">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accounts.map((a) => (
                    <tr key={a.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{a.accountCode}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                        {lang === 'ta' ? a.accountNameTa : a.accountName}
                      </td>
                      <td className="px-4 py-2.5 capitalize text-slate-500">{a.accountType}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(a.debitTotal, a.currencyCode)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(a.creditTotal, a.currencyCode)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatMoney(a.balance, a.currencyCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Posted Journals */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Posted Fund Transactions &amp; Ledger Lines
            </h2>
            {loading ? (
              <p className="py-8 text-center text-xs text-slate-500">{t.loading}</p>
            ) : transactions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                {t.noData}
              </div>
            ) : (
              transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {txn.transactionNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-500">{txn.transactionDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize text-slate-600 dark:text-slate-300">
                        {txn.transactionType.replace('_', ' ')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <StatusText status={txn.status} lang={lang} />
                    </div>
                    {canTransact &&
                      txn.status === 'posted' &&
                      txn.transactionType !== 'reversal' && (
                        <button
                          type="button"
                          onClick={() => {
                            setReverseTarget(txn);
                            setReverseReason('');
                          }}
                          title={t.reverse}
                          aria-label={t.reverse}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                  </div>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    {txn.description}
                  </p>
                  <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-2 dark:border-slate-800">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="py-1 font-medium">Account</th>
                          <th className="py-1 font-medium">Side</th>
                          <th className="py-1 text-right font-medium">Original Amount</th>
                          <th className="py-1 text-right font-medium">INR Functional</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txn.entries.map((e) => (
                          <tr key={e.id}>
                            <td className="py-1 text-slate-700 dark:text-slate-300">
                              <span className="font-mono text-slate-400">{e.accountCode}</span>{' '}
                              {e.accountName}
                            </td>
                            <td className="py-1 uppercase text-slate-500">{e.side}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                              {formatMoney(e.transactionAmount, e.accountCurrencyCode)}
                            </td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-500">
                              {formatMoney(e.functionalAmountInr, 'INR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* UAE Monthly Settlement Tab */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Monthly UAE AED → INR Settlement
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sums verified AED contributions for the selected month and posts FX conversion
                  without duplicating contribution income.
                </p>
              </div>
              <input
                type="month"
                value={settleMonth}
                onChange={(e) => setSettleMonth(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Confirmed AED Collections ({settleMonth})
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(settleData?.totalAedCollected || '0', 'AED')}
                </span>
              </div>
              {settleData && settleData.confirmedAedPayments.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-500">
                  Includes {settleData.confirmedAedPayments.length} verified AED payment(s).
                </div>
              )}
            </div>

            {canTransact && (
              <form onSubmit={handleConfirmSettlement} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Actual Exchange Rate (INR per 1 AED) *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="1"
                      required
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Bank / Remittance Reference *
                    </label>
                    <input
                      type="text"
                      required
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder="Exchange House / Wire Ref"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                </div>

                {/* Charges with Explicit Per-Charge Currency */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Transaction Charge
                    </label>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={txCharge}
                        onChange={(e) => setTxCharge(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <select
                        value={txChargeCur}
                        onChange={(e) => setTxChargeCur(e.target.value as 'INR' | 'AED')}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="AED">AED</option>
                        <option value="INR">INR</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      VAT / Tax
                    </label>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={taxAmt}
                        onChange={(e) => setTaxAmt(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <select
                        value={taxCur}
                        onChange={(e) => setTaxCur(e.target.value as 'INR' | 'AED')}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="AED">AED</option>
                        <option value="INR">INR</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Other Charges
                    </label>
                    <div className="mt-1 flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherAmt}
                        onChange={(e) => setOtherAmt(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <select
                        value={otherCur}
                        onChange={(e) => setOtherCur(e.target.value as 'INR' | 'AED')}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="INR">INR</option>
                        <option value="AED">AED</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Calculation Breakdown Preview (UX-REQ) */}
                {settlePreview && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Settlement Calculation Preview
                    </div>
                    <div className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between">
                        <span>
                          Gross INR ({formatMoney(settlePreview.totalAed, 'AED')} ×{' '}
                          {settlePreview.rate})
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatMoney(settlePreview.grossInr, 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-red-700 dark:text-red-400">
                        <span>Total Charges (INR equivalent)</span>
                        <span className="font-mono tabular-nums">
                          - {formatMoney(settlePreview.totalChargesInr, 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-emerald-900 dark:border-slate-800 dark:text-emerald-400">
                        <span>Net INR Credited to India Bank</span>
                        <span className="font-mono tabular-nums">
                          {formatMoney(settlePreview.netInr, 'INR')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={settleBusy || !settlePreview || settlePreview.totalAed <= 0}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  <span>{settleBusy ? t.loading : t.confirmSettlement}</span>
                </button>
              </form>
            )}
          </div>

          {/* Historical Settlements */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Settlement History
            </h2>
            {!settleData || settleData.settlements.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">{t.noData}</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {settleData.settlements.map((s) => (
                  <div key={s.id} className="py-3.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {s.settlementMonth.slice(0, 7)}
                      </span>
                      <StatusText status={s.status} lang={lang} />
                    </div>
                    <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                      <span className="font-mono">
                        {formatMoney(s.totalAedCollected, 'AED')} @{' '}
                        {Number(s.exchangeRateInrPerAed).toFixed(2)}
                      </span>
                      <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                        Net {formatMoney(s.netInrAmount, 'INR')}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                      Ref: {s.bankReference} · Charges {formatMoney(s.totalChargesInr, 'INR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reversal Modal */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleReverseConfirm}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Reverse Posted Transaction
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {reverseTarget.transactionNumber} · {reverseTarget.description}
            </p>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              Original ledger rows remain immutable. A balanced opposite reversal journal will be
              posted.
            </p>
            <textarea
              rows={3}
              required
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Mandatory reason for reversal..."
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReverseTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={reverseBusy}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
              >
                {reverseBusy ? t.loading : 'Post Reversal Journal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
