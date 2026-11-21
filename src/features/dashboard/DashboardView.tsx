import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../../shared/api/client';
import { StatusText, formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import {
  MonthlyContributionTrendsChart,
  type MonthlyTrendPoint,
} from './MonthlyContributionTrendsChart';

export interface UserSession {
  userAccountId: string;
  memberId: string | null;
  username: string;
  email: string | null;
  fullNameEn: string;
  fullNameTa: string | null;
  roles: Array<'admin' | 'committee_member' | 'treasurer' | 'member' | 'auditor'>;
}

interface DashboardData {
  month: string;
  balances: {
    inrTotal: string;
    aedTotal: string;
    accounts: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      accountNameTa: string;
      accountType: string;
      currencyCode: string;
      balance: string;
    }>;
  };
  communitySummary: {
    activeMembers: number;
    pendingPayments?: number;
    pendingAssistance?: number;
    approvedAwaitingPayout?: number;
    monthlyCollections: Array<{ currencyCode: string; total: string; count: number }>;
    monthlyTrends: MonthlyTrendPoint[];
  };
  ownSummary: {
    member: {
      memberNumber: string;
      fullNameEn: string;
      fullNameTa: string | null;
      contributionFrequency: string;
      expectedContributionAmount: string;
      expectedContributionCurrency: string;
    } | null;
    latestFiveConfirmed: Array<{
      id: string;
      paymentDate: string;
      amount: string;
      currencyCode: string;
      paymentMethod: string;
      transactionReference: string;
    }>;
    recentDues: Array<{
      id: string;
      periodStart: string;
      periodEnd: string;
      dueAmount: string;
      currencyCode: string;
      dueDate: string;
      status: string;
    }>;
  };
}

export const DashboardView: React.FC<{
  user: UserSession;
  lang: Language;
  onNavigate: (tab: string) => void;
}> = ({ user, lang, onNavigate }) => {
  const t = translations[lang];
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>(`/api/dashboard?month=${encodeURIComponent(month)}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const inrCollection = data?.communitySummary.monthlyCollections.find((c) => c.currencyCode === 'INR');
  const aedCollection = data?.communitySummary.monthlyCollections.find((c) => c.currencyCode === 'AED');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.dashboard}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ta' && user.fullNameTa ? user.fullNameTa : user.fullNameEn} ·{' '}
            {user.roles.map((r) => t.roles[r]).join(' / ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={load}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t.retry}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : (
        data && (
          <>
            {/* Currency-Separated KPI Strip */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.inrBalance}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-900 dark:text-emerald-400">
                  {formatMoney(data.balances.inrTotal, 'INR')}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Month Verified: {formatMoney(inrCollection?.total || '0', 'INR')}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.aedBalance}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatMoney(data.balances.aedTotal, 'AED')}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Month Verified: {formatMoney(aedCollection?.total || '0', 'AED')}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.activeMembers}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {data.communitySummary.activeMembers}
                </div>
                {data.communitySummary.pendingPayments !== undefined && (
                  <button
                    type="button"
                    onClick={() => onNavigate('contributions')}
                    className="mt-2 text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                  >
                    {t.pendingPayments}: {data.communitySummary.pendingPayments} →
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {data.communitySummary.pendingAssistance !== undefined
                    ? t.pendingAssistance
                    : t.expectedContribution}
                </div>
                <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {data.communitySummary.pendingAssistance !== undefined
                    ? data.communitySummary.pendingAssistance
                    : data.ownSummary.member
                      ? formatMoney(
                          data.ownSummary.member.expectedContributionAmount,
                          data.ownSummary.member.expectedContributionCurrency
                        )
                      : '—'}
                </div>
                {data.communitySummary.approvedAwaitingPayout !== undefined && (
                  <button
                    type="button"
                    onClick={() => onNavigate('assistance')}
                    className="mt-2 text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                  >
                    {t.awaitingPayout}: {data.communitySummary.approvedAwaitingPayout} →
                  </button>
                )}
              </div>
            </div>

            {/* 6-Month Verified Contribution Trends */}
            <MonthlyContributionTrendsChart
              trends={data.communitySummary.monthlyTrends || []}
              lang={lang}
              loading={loading}
            />

            {/* Own Latest 5 Confirmed Contributions + Recent Dues */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t.latestFiveConfirmed}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('contributions')}
                    className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                  >
                    {t.submitPayment} →
                  </button>
                </div>
                {data.ownSummary.latestFiveConfirmed.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-slate-500">{t.noData}</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.ownSummary.latestFiveConfirmed.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                        <div>
                          <div className="font-mono text-xs font-medium text-slate-900 dark:text-white">
                            {p.transactionReference}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {p.paymentDate} · {p.paymentMethod}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-400">
                            {formatMoney(p.amount, p.currencyCode)}
                          </div>
                          <StatusText status="approved" lang={lang} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Your Expected Contribution &amp; Dues
                  </h2>
                  {data.ownSummary.member && (
                    <span className="font-mono text-xs text-slate-500">
                      {data.ownSummary.member.memberNumber} ·{' '}
                      {data.ownSummary.member.contributionFrequency}
                    </span>
                  )}
                </div>
                {data.ownSummary.recentDues.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-slate-500">{t.noData}</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.ownSummary.recentDues.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
                        <div>
                          <div className="font-mono text-xs font-medium text-slate-900 dark:text-white">
                            {d.periodStart} → {d.periodEnd}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Due by {d.dueDate}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(d.dueAmount, d.currencyCode)}
                          </div>
                          <StatusText status={d.status} lang={lang} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Privileged Account Balances Breakdown */}
            {data.balances.accounts.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Ledger Account Balances (INR &amp; AED Separated)
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('treasury')}
                    className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                  >
                    Open Treasury →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3 font-medium">Code</th>
                        <th className="px-5 py-3 font-medium">Account</th>
                        <th className="px-5 py-3 font-medium">Type</th>
                        <th className="px-5 py-3 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.balances.accounts.map((acc) => (
                        <tr key={acc.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-5 py-3 font-mono text-slate-600 dark:text-slate-400">
                            {acc.accountCode}
                          </td>
                          <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                            {lang === 'ta' ? acc.accountNameTa : acc.accountName}
                          </td>
                          <td className="px-5 py-3 text-slate-500 capitalize dark:text-slate-400">
                            {acc.accountType}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(acc.balance, acc.currencyCode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
};
