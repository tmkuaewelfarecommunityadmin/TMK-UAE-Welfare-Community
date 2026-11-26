import React, { useCallback, useEffect, useState } from 'react';
import { Download, Eye, EyeOff, Filter } from 'lucide-react';
import { apiFetch, getActiveBearerToken } from '../../shared/api/client';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';

interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorRoleCodes: string[];
  entityType: string;
  entityId: string;
  fundTransactionId: string | null;
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  performedAt: string;
}

interface ActorOption {
  id: string;
  username: string;
  fullNameEn: string | null;
}

export const AuditView: React.FC<{ lang: Language }> = ({ lang }) => {
  const t = translations[lang];
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [userId, setUserId] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [mode, setMode] = useState<'activities' | 'distinct_transactions'>('activities');
  const [limit, setLimit] = useState(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (roleCode) params.set('roleCode', roleCode);
      if (entityType) params.set('entityType', entityType);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('mode', mode);
      params.set('limit', String(limit));

      const res = await apiFetch<{ logs: AuditRow[]; actors?: ActorOption[] }>(
        `/api/audit?${params.toString()}`
      );
      setLogs(res.logs);
      if (res.actors) setActors(res.actors);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [userId, roleCode, entityType, dateFrom, dateTo, mode, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCsv = async () => {
    try {
      const token = await getActiveBearerToken();
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (roleCode) params.set('roleCode', roleCode);
      const res = await fetch(`/api/audit/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'village-fund-audit-report.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to export CSV.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {t.audit}
          </h1>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          title="Export CSV"
          aria-label="Export CSV"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Filter className="h-3.5 w-3.5" />
          <span>Audit Query Filters</span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">All Users</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username} {a.fullNameEn ? `(${a.fullNameEn})` : ''}
              </option>
            ))}
          </select>

          <select
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">All Historical Roles</option>
            <option value="admin">Admin</option>
            <option value="committee_member">Committee Member</option>
            <option value="treasurer">Treasurer</option>
            <option value="member">Member</option>
            <option value="auditor">Auditor</option>
            <option value="public">Public</option>
          </select>

          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">All Entities</option>
            <option value="payment_submission">Payment Submissions</option>
            <option value="assistance_request">Assistance Requests</option>
            <option value="fund_transaction">Fund Transactions</option>
            <option value="uae_settlement">UAE Settlements</option>
            <option value="member">Members</option>
            <option value="member_roles">Role Assignments</option>
            <option value="user_account">User Accounts</option>
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Date From"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Date To"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setMode('activities')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === 'activities'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Activities
            </button>
            <button
              type="button"
              onClick={() => setMode('distinct_transactions')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                mode === 'distinct_transactions'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Distinct Transactions
            </button>
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
            {[5, 25, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                className={`rounded-md px-3 py-1 font-mono text-xs font-medium transition ${
                  limit === n
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Last {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="py-10 text-center text-xs text-slate-500">{t.loading}</p>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor &amp; Role Snapshot</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {new Date(row.performedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium text-slate-900 dark:text-white">
                          @{row.actorUsername || 'public'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {row.actorRoleCodes.join(' · ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">
                        {row.action}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <div>{row.entityType}</div>
                        {row.fundTransactionId && (
                          <div className="font-mono text-[10px] text-emerald-800 dark:text-emerald-400">
                            TXN: {row.fundTransactionId.slice(0, 8)}...
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                          title={expandedId === row.id ? 'Hide Payload' : 'Inspect Diff'}
                          aria-label={expandedId === row.id ? 'Hide Payload' : 'Inspect Diff'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-emerald-800 hover:bg-slate-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-slate-800"
                        >
                          {expandedId === row.id ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className="bg-slate-50 dark:bg-slate-950">
                        <td colSpan={5} className="px-4 py-3">
                          {row.reason && (
                            <div className="mb-2 text-xs text-slate-700 dark:text-slate-300">
                              <strong>Reason:</strong> {row.reason}
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Old Values
                              </div>
                              <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                {JSON.stringify(row.oldValues || {}, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                New Values
                              </div>
                              <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                {JSON.stringify(row.newValues || {}, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
