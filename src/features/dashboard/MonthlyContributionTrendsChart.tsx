import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';

export interface MonthlyTrendPoint {
  month: string;
  inrTotal: number;
  aedTotal: number;
  inrCount: number;
  aedCount: number;
}

type CurrencyView = 'both' | 'INR' | 'AED';

function formatMonthLabel(monthKey: string, lang: Language): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(lang === 'ta' ? 'ta-IN' : 'en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function formatCompactAxis(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: MonthlyTrendPoint & { label: string };
  }>;
  currencyView: CurrencyView;
  lang: Language;
}

const TrendsTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  currencyView,
  lang,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const t = translations[lang];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="font-mono font-semibold text-slate-900 dark:text-white">
        {point.label} ({point.month})
      </div>
      <div className="mt-2 space-y-1.5">
        {(currencyView === 'both' || currencyView === 'INR') && (
          <div className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-xs bg-emerald-600" />
              INR
            </span>
            <span className="font-mono font-semibold tabular-nums text-emerald-800 dark:text-emerald-400">
              {formatMoney(point.inrTotal, 'INR')}{' '}
              <span className="font-sans font-normal text-slate-400">
                ({point.inrCount} {t.verifiedPayments})
              </span>
            </span>
          </div>
        )}
        {(currencyView === 'both' || currencyView === 'AED') && (
          <div className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-xs bg-sky-600" />
              AED
            </span>
            <span className="font-mono font-semibold tabular-nums text-sky-800 dark:text-sky-400">
              {formatMoney(point.aedTotal, 'AED')}{' '}
              <span className="font-sans font-normal text-slate-400">
                ({point.aedCount} {t.verifiedPayments})
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const MonthlyContributionTrendsChart: React.FC<{
  trends: MonthlyTrendPoint[];
  lang: Language;
  loading?: boolean;
}> = ({ trends, lang, loading = false }) => {
  const t = translations[lang];
  const [currencyView, setCurrencyView] = useState<CurrencyView>('both');

  const chartData = useMemo(
    () =>
      trends.map((item) => ({
        ...item,
        label: formatMonthLabel(item.month, lang),
      })),
    [trends, lang]
  );

  // Separate 6-month totals by currency (never summed across INR and AED)
  const sixMonthInr = useMemo(
    () => trends.reduce((sum, item) => sum + item.inrTotal, 0),
    [trends]
  );
  const sixMonthAed = useMemo(
    () => trends.reduce((sum, item) => sum + item.aedTotal, 0),
    [trends]
  );
  const hasAnyContribution = useMemo(
    () => trends.some((item) => item.inrTotal > 0 || item.aedTotal > 0),
    [trends]
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t.monthlyContributionTrends}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t.monthlyTrendsSubtitle}
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950"
          role="group"
          aria-label="Currency series view"
        >
          {(
            [
              { id: 'both', label: t.bothCurrencies },
              { id: 'INR', label: t.inrOnly },
              { id: 'AED', label: t.aedOnly },
            ] as const
          ).map((opt) => {
            const active = currencyView === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCurrencyView(opt.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Separated 6-month totals */}
      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-3 sm:grid-cols-2 dark:border-slate-800/80">
        <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/60">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
            {t.sixMonthInrTotal}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-400">
            {formatMoney(sixMonthInr, 'INR')}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/70 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/60">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" />
            {t.sixMonthAedTotal}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-sky-800 dark:text-sky-400">
            {formatMoney(sixMonthAed, 'AED')}
          </span>
        </div>
      </div>

      <div className="p-5">
        {loading && chartData.length === 0 ? (
          <div className="h-72 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
        ) : !hasAnyContribution ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {t.noTrendData}
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: currencyView === 'both' ? 12 : 8, left: 0, bottom: 4 }}
                barGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.22} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1', strokeOpacity: 0.4 }}
                  tickLine={false}
                />
                {(currencyView === 'both' || currencyView === 'INR') && (
                  <YAxis
                    yAxisId="inr"
                    orientation="left"
                    tickFormatter={(v: number) => `₹${formatCompactAxis(v)}`}
                    tick={{ fontSize: 11, fill: '#059669' }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                )}
                {(currencyView === 'both' || currencyView === 'AED') && (
                  <YAxis
                    yAxisId="aed"
                    orientation={currencyView === 'both' ? 'right' : 'left'}
                    tickFormatter={(v: number) => `د.إ ${formatCompactAxis(v)}`}
                    tick={{ fontSize: 11, fill: '#0284c7' }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                )}
                <Tooltip
                  cursor={{ fill: '#94a3b8', fillOpacity: 0.1 }}
                  content={<TrendsTooltip currencyView={currencyView} lang={lang} />}
                />
                {(currencyView === 'both' || currencyView === 'INR') && (
                  <Bar
                    yAxisId="inr"
                    dataKey="inrTotal"
                    name="INR"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                )}
                {(currencyView === 'both' || currencyView === 'AED') && (
                  <Bar
                    yAxisId="aed"
                    dataKey="aedTotal"
                    name="AED"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
};
