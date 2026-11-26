import React from 'react';
import { CheckCircle2, Clock, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

export const StatusText: React.FC<{ status: string; lang: Language }> = ({ status, lang }) => {
  const t = translations[lang];
  const map: Record<string, { label: string; colorClass: string; Icon: React.FC<{ className?: string }> }> = {
    pending: { label: t.statusPending, colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
    pending_approval: { label: t.statusPending, colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
    submitted: { label: t.statusSubmitted, colorClass: 'text-slate-700 dark:text-slate-300', Icon: ShieldAlert },
    approved: { label: t.statusApproved, colorClass: 'text-emerald-800 dark:text-emerald-400', Icon: CheckCircle2 },
    paid: { label: t.statusPaid, colorClass: 'text-emerald-800 dark:text-emerald-400', Icon: CheckCircle2 },
    posted: { label: t.statusApproved, colorClass: 'text-emerald-800 dark:text-emerald-400', Icon: CheckCircle2 },
    confirmed: { label: t.statusApproved, colorClass: 'text-emerald-800 dark:text-emerald-400', Icon: CheckCircle2 },
    rejected: { label: t.statusRejected, colorClass: 'text-red-700 dark:text-red-400', Icon: XCircle },
    cancelled: { label: t.statusCancelled, colorClass: 'text-slate-500 dark:text-slate-400', Icon: XCircle },
    reversed: { label: t.statusReversed, colorClass: 'text-red-700 dark:text-red-400', Icon: RotateCcw },
    active: { label: t.statusActive, colorClass: 'text-emerald-800 dark:text-emerald-400', Icon: CheckCircle2 },
    inactive: { label: t.statusInactive, colorClass: 'text-slate-500 dark:text-slate-400', Icon: XCircle },
    disabled: { label: t.statusInactive, colorClass: 'text-red-700 dark:text-red-400', Icon: XCircle },
    unpaid: { label: 'Unpaid', colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
    partially_paid: { label: 'Partial', colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  };

  const info = map[status] || {
    label: status,
    colorClass: 'text-slate-700 dark:text-slate-300',
    Icon: Clock,
  };
  const Icon = info.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${info.colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{info.label}</span>
    </span>
  );
};

export function formatMoney(amount: string | number | null | undefined, currency: string): string {
  const num = Number(amount ?? 0);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
  return currency === 'INR' ? `INR ${formatted}` : `AED ${formatted}`;
}
