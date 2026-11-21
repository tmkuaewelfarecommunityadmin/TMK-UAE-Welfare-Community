import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import type { db as DbType } from '../db/index.ts';
import { fundAccounts, fundTransactions, ledgerEntries } from '../db/schema.ts';

type DbExecutor = typeof DbType | Parameters<Parameters<typeof DbType.transaction>[0]>[0];

export function toMinorUnits(amount: number | string): number {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(num)) {
    throw new Error('Invalid monetary amount.');
  }
  return Math.round(num * 100);
}

export function fromMinorUnits(minor: number): string {
  return (minor / 100).toFixed(2);
}

export interface JournalLineInput {
  accountCode: string;
  side: 'debit' | 'credit';
  transactionAmountMinor: number;
  functionalAmountInrMinor: number;
  exchangeRateToInr: number;
  description?: string;
}

export interface PostTransactionInput {
  transactionType:
    | 'contribution_receipt'
    | 'assistance_payout'
    | 'uae_settlement'
    | 'inflow'
    | 'outflow'
    | 'expense'
    | 'reversal';
  transactionDate: string;
  referenceType: string;
  referenceId?: string | null;
  description: string;
  idempotencyKey: string;
  postedByUserId?: string | null;
  reversalOfTransactionId?: string | null;
  lines: JournalLineInput[];
}

export async function postBalancedTransaction(
  tx: DbExecutor,
  input: PostTransactionInput
): Promise<{ transactionId: string; transactionNumber: string; idempotentHit: boolean }> {
  // Check idempotency key first
  const existing = await tx
    .select()
    .from(fundTransactions)
    .where(eq(fundTransactions.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    return {
      transactionId: existing[0].id,
      transactionNumber: existing[0].transactionNumber,
      idempotentHit: true,
    };
  }

  if (input.lines.length < 2) {
    throw new Error('A financial journal requires at least two balanced entries.');
  }

  let totalDebitInr = 0;
  let totalCreditInr = 0;
  for (const line of input.lines) {
    if (line.functionalAmountInrMinor <= 0 || line.transactionAmountMinor <= 0) {
      throw new Error('Ledger line amounts must be strictly positive.');
    }
    if (line.side === 'debit') {
      totalDebitInr += line.functionalAmountInrMinor;
    } else {
      totalCreditInr += line.functionalAmountInrMinor;
    }
  }

  if (totalDebitInr !== totalCreditInr) {
    throw new Error(
      `Unbalanced journal entry: debits (${fromMinorUnits(totalDebitInr)}) != credits (${fromMinorUnits(totalCreditInr)}).`
    );
  }

  const allAccounts = await tx.select().from(fundAccounts);
  const accountByCode = new Map(allAccounts.map((a) => [a.accountCode, a]));

  const dateTag = input.transactionDate.replace(/-/g, '').slice(0, 6);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const transactionNumber = `TXN-${dateTag}-${suffix}`;

  const [createdTxn] = await tx
    .insert(fundTransactions)
    .values({
      transactionNumber,
      transactionType: input.transactionType,
      transactionDate: input.transactionDate,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      description: input.description,
      status: 'posted',
      idempotencyKey: input.idempotencyKey,
      postedByUserId: input.postedByUserId ?? null,
      reversalOfTransactionId: input.reversalOfTransactionId ?? null,
      createdBy: input.postedByUserId ?? null,
    })
    .returning();

  for (const line of input.lines) {
    const account = accountByCode.get(line.accountCode);
    if (!account) {
      throw new Error(`Chart of account code ${line.accountCode} not found.`);
    }
    await tx.insert(ledgerEntries).values({
      fundTransactionId: createdTxn.id,
      fundAccountId: account.id,
      side: line.side,
      accountCurrencyCode: account.currencyCode,
      transactionAmount: (line.transactionAmountMinor / 100).toFixed(4),
      functionalAmountInr: fromMinorUnits(line.functionalAmountInrMinor),
      exchangeRateToInr: line.exchangeRateToInr.toFixed(8),
      description: line.description ?? input.description,
    });
  }

  return {
    transactionId: createdTxn.id,
    transactionNumber: createdTxn.transactionNumber,
    idempotentHit: false,
  };
}

export interface AccountBalanceRow {
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

export async function getAccountBalances(executor: DbExecutor): Promise<AccountBalanceRow[]> {
  const accounts = await executor.select().from(fundAccounts).orderBy(fundAccounts.accountCode);
  const sums = await executor
    .select({
      fundAccountId: ledgerEntries.fundAccountId,
      side: ledgerEntries.side,
      total: sql<string>`COALESCE(SUM(${ledgerEntries.transactionAmount}), 0)`,
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.fundAccountId, ledgerEntries.side);

  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();
  for (const row of sums) {
    const minor = Math.round(Number(row.total) * 100);
    if (row.side === 'debit') {
      debitMap.set(row.fundAccountId, minor);
    } else {
      creditMap.set(row.fundAccountId, minor);
    }
  }

  return accounts.map((acc) => {
    const debitMinor = debitMap.get(acc.id) ?? 0;
    const creditMinor = creditMap.get(acc.id) ?? 0;
    // Assets & Expenses have normal debit balance; Income, Equity, Clearing have normal credit balance
    const isDebitNormal = acc.accountType === 'asset' || acc.accountType === 'expense';
    const netMinor = isDebitNormal ? debitMinor - creditMinor : creditMinor - debitMinor;
    return {
      accountId: acc.id,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountNameTa: acc.accountNameTa,
      accountType: acc.accountType,
      currencyCode: acc.currencyCode,
      debitTotal: fromMinorUnits(debitMinor),
      creditTotal: fromMinorUnits(creditMinor),
      balance: fromMinorUnits(netMinor),
    };
  });
}
