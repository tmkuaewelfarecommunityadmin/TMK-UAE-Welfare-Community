import { relations } from 'drizzle-orm';
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// 1. Members
export const members = pgTable('members', {
  id: uuid('id').defaultRandom().primaryKey(),
  memberNumber: text('member_number').notNull().unique(),
  fullNameEn: text('full_name_en').notNull(),
  fullNameTa: text('full_name_ta'),
  phoneNumber: text('phone_number'),
  email: text('email'),
  streetEn: text('street_en'),
  streetTa: text('street_ta'),
  locationEn: text('location_en'),
  locationTa: text('location_ta'),
  contributionFrequency: text('contribution_frequency').notNull().default('monthly'), // 'monthly' | 'yearly'
  expectedContributionAmount: numeric('expected_contribution_amount', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  expectedContributionCurrency: char('expected_contribution_currency', { length: 3 })
    .notNull()
    .default('INR'), // 'INR' | 'AED'
  status: text('status').notNull().default('active'), // 'active' | 'inactive'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

// 2. Roles
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(), // 'admin' | 'committee_member' | 'treasurer' | 'member' | 'auditor'
  displayNameEn: text('display_name_en').notNull(),
  displayNameTa: text('display_name_ta').notNull(),
});

// 3. User Accounts (linked 1:0..1 to members; no plaintext passwords)
export const userAccounts = pgTable('user_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  memberId: uuid('member_id')
    .references(() => members.id, { onDelete: 'set null' })
    .unique(),
  authUserId: text('auth_user_id').unique(), // Firebase Auth UID when linked via Google Sign-In
  username: text('username').notNull().unique(),
  recoveryEmail: text('recovery_email'),
  passwordHash: text('password_hash'), // scrypt salt:hash for assigned username/password login
  avatarDataUrl: text('avatar_data_url'),
  preferredLanguage: text('preferred_language').notNull().default('en'), // 'en' | 'ta'
  resetTokenHash: text('reset_token_hash'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('active'), // 'active' | 'disabled'
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

// 4. Member Roles (many-to-many)
export const memberRoles = pgTable(
  'member_roles',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid('assigned_by'),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.roleId] })]
);

// 5. Contribution Dues
export const contributionDues = pgTable(
  'contribution_dues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    periodStart: text('period_start').notNull(), // YYYY-MM-DD
    periodEnd: text('period_end').notNull(), // YYYY-MM-DD
    dueAmount: numeric('due_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 }).notNull(), // 'INR' | 'AED'
    dueDate: text('due_date').notNull(), // YYYY-MM-DD
    status: text('status').notNull().default('unpaid'), // 'unpaid' | 'partially_paid' | 'paid' | 'waived'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('dues_member_period_idx').on(table.memberId, table.periodStart, table.periodEnd),
  ]
);

// 6. Payment Submissions
export const paymentSubmissions = pgTable(
  'payment_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    contributionDueId: uuid('contribution_due_id').references(() => contributionDues.id, {
      onDelete: 'set null',
    }),
    submittedByUserId: uuid('submitted_by_user_id').references(() => userAccounts.id, {
      onDelete: 'set null',
    }),
    paymentDate: text('payment_date').notNull(), // YYYY-MM-DD
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 }).notNull(), // 'INR' | 'AED'
    paymentMethod: text('payment_method').notNull(), // 'bank_transfer' | 'upi' | 'cash' | 'exchange_house'
    transactionReference: text('transaction_reference').notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'cancelled'
    approvedByUserId: uuid('approved_by_user_id').references(() => userAccounts.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    fundTransactionId: uuid('fund_transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    index('payment_member_status_idx').on(table.memberId, table.status),
    index('payment_ref_currency_idx').on(table.transactionReference, table.currencyCode),
  ]
);

// 7. Private Attachments
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityType: text('entity_type').notNull(), // 'payment_submission' | 'assistance_request' | 'settlement' | 'payout'
    entityId: uuid('entity_id').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    fileDataBase64: text('file_data_base64').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('attachments_entity_idx').on(table.entityType, table.entityId)]
);

// 8. Assistance Requests
export const assistanceRequests = pgTable('assistance_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestNumber: text('request_number').notNull().unique(),
  requestedByUserId: uuid('requested_by_user_id').references(() => userAccounts.id, {
    onDelete: 'set null',
  }),
  publicRequesterName: text('public_requester_name'),
  publicRequesterPhone: text('public_requester_phone'),
  beneficiaryNameEn: text('beneficiary_name_en').notNull(),
  beneficiaryNameTa: text('beneficiary_name_ta'),
  familyNameEn: text('family_name_en'),
  familyNameTa: text('family_name_ta'),
  streetEn: text('street_en'),
  streetTa: text('street_ta'),
  requestedAmount: numeric('requested_amount', { precision: 14, scale: 2 }).notNull(),
  currencyCode: char('currency_code', { length: 3 }).notNull().default('INR'),
  reasonId: uuid('reason_id').references(() => assistanceReasons.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  requestType: text('request_type').notNull().default('normal'), // 'normal' | 'emergency'
  status: text('status').notNull().default('pending_approval'), // 'submitted' | 'pending_approval' | 'approved' | 'rejected' | 'ready_for_payout' | 'paid' | 'cancelled'
  publicTrackingTokenHash: text('public_tracking_token_hash'),
  rejectionReason: text('rejection_reason'),
  payoutAmount: numeric('payout_amount', { precision: 14, scale: 2 }),
  payoutCurrencyCode: char('payout_currency_code', { length: 3 }),
  payoutAccountId: uuid('payout_account_id'),
  payoutReference: text('payout_reference'),
  payoutTransactionId: uuid('payout_transaction_id'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paidByUserId: uuid('paid_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

// 9. Approval Rounds
export const approvalRounds = pgTable('approval_rounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  assistanceRequestId: uuid('assistance_request_id')
    .notNull()
    .unique()
    .references(() => assistanceRequests.id, { onDelete: 'cascade' }),
  eligibleCommitteeCount: integer('eligible_committee_count').notNull(),
  requiredApprovals: integer('required_approvals').notNull(),
  approvalType: text('approval_type').notNull(), // 'normal' | 'emergency'
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

// 10. Frozen Eligible Committee Members per Approval Round
export const approvalEligibleMembers = pgTable(
  'approval_eligible_members',
  {
    approvalRoundId: uuid('approval_round_id')
      .notNull()
      .references(() => approvalRounds.id, { onDelete: 'cascade' }),
    committeeMemberId: uuid('committee_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
  },
  (table) => [primaryKey({ columns: [table.approvalRoundId, table.committeeMemberId] })]
);

// 11. Assistance Approvals (Votes)
export const assistanceApprovals = pgTable(
  'assistance_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvalRoundId: uuid('approval_round_id')
      .notNull()
      .references(() => approvalRounds.id, { onDelete: 'cascade' }),
    committeeMemberId: uuid('committee_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    decision: text('decision').notNull(), // 'approved' | 'rejected'
    comments: text('comments'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('assistance_vote_unique_idx').on(table.approvalRoundId, table.committeeMemberId),
  ]
);

// 12. Fund Accounts (Chart of Accounts)
export const fundAccounts = pgTable('fund_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountCode: text('account_code').notNull().unique(),
  accountName: text('account_name').notNull(),
  accountNameTa: text('account_name_ta').notNull(),
  accountType: text('account_type').notNull(), // 'asset' | 'income' | 'expense' | 'equity' | 'clearing'
  currencyCode: char('currency_code', { length: 3 }).notNull(), // 'INR' | 'AED'
  isActive: boolean('is_active').notNull().default(true),
});

// 13. Fund Transactions (Immutable Header)
export const fundTransactions = pgTable('fund_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionNumber: text('transaction_number').notNull().unique(),
  transactionType: text('transaction_type').notNull(), // 'contribution_receipt' | 'assistance_payout' | 'uae_settlement' | 'inflow' | 'outflow' | 'expense' | 'reversal'
  transactionDate: text('transaction_date').notNull(), // YYYY-MM-DD
  referenceType: text('reference_type').notNull(),
  referenceId: uuid('reference_id'),
  description: text('description').notNull(),
  status: text('status').notNull().default('posted'), // 'posted' | 'reversed'
  idempotencyKey: text('idempotency_key').notNull().unique(),
  postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
  postedByUserId: uuid('posted_by_user_id'),
  reversalOfTransactionId: uuid('reversal_of_transaction_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
});

// 14. Ledger Entries (Immutable Double-Entry Lines)
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fundTransactionId: uuid('fund_transaction_id')
      .notNull()
      .references(() => fundTransactions.id, { onDelete: 'restrict' }),
    fundAccountId: uuid('fund_account_id')
      .notNull()
      .references(() => fundAccounts.id, { onDelete: 'restrict' }),
    side: text('side').notNull(), // 'debit' | 'credit'
    accountCurrencyCode: char('account_currency_code', { length: 3 }).notNull(),
    transactionAmount: numeric('transaction_amount', { precision: 16, scale: 4 }).notNull(),
    functionalAmountInr: numeric('functional_amount_inr', { precision: 16, scale: 2 }).notNull(),
    exchangeRateToInr: numeric('exchange_rate_to_inr', { precision: 18, scale: 8 }).notNull(),
    description: text('description'),
  },
  (table) => [
    index('ledger_txn_idx').on(table.fundTransactionId),
    index('ledger_account_idx').on(table.fundAccountId),
  ]
);

// 15. Monthly UAE Settlements
export const monthlyUaeSettlements = pgTable('monthly_uae_settlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  settlementMonth: text('settlement_month').notNull().unique(), // YYYY-MM-01
  totalAedCollected: numeric('total_aed_collected', { precision: 16, scale: 2 }).notNull(),
  exchangeRateInrPerAed: numeric('exchange_rate_inr_per_aed', { precision: 18, scale: 8 }).notNull(),
  grossInrAmount: numeric('gross_inr_amount', { precision: 16, scale: 2 }).notNull(),
  transactionCharge: numeric('transaction_charge', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  transactionChargeCurrency: char('transaction_charge_currency', { length: 3 })
    .notNull()
    .default('INR'),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0.00'),
  taxCurrency: char('tax_currency', { length: 3 }).notNull().default('INR'),
  otherCharges: numeric('other_charges', { precision: 14, scale: 2 }).notNull().default('0.00'),
  otherChargesCurrency: char('other_charges_currency', { length: 3 }).notNull().default('INR'),
  totalChargesInr: numeric('total_charges_inr', { precision: 16, scale: 2 }).notNull(),
  netInrAmount: numeric('net_inr_amount', { precision: 16, scale: 2 }).notNull(),
  bankReference: text('bank_reference').notNull(),
  status: text('status').notNull().default('confirmed'), // 'draft' | 'confirmed' | 'reversed'
  fundTransactionId: uuid('fund_transaction_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

// 16. Append-Only Audit Logs
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id'),
    actorMemberId: uuid('actor_member_id'),
    actorUsername: text('actor_username'),
    actorRoleCodes: text('actor_role_codes').array().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    fundTransactionId: uuid('fund_transaction_id'),
    action: text('action').notNull(),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    reason: text('reason'),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
    correlationId: uuid('correlation_id').defaultRandom().notNull(),
  },
  (table) => [
    index('audit_user_time_idx').on(table.actorUserId, table.performedAt),
    index('audit_txn_idx').on(table.fundTransactionId),
    index('audit_action_time_idx').on(table.action, table.performedAt),
    index('audit_entity_idx').on(table.entityType, table.entityId),
  ]
);

// 17. Assistance Reasons (Admin-managed bilingual list with active/inactive status)
export const assistanceReasons = pgTable('assistance_reasons', {
  id: uuid('id').defaultRandom().primaryKey(),
  nameEn: text('name_en').notNull().unique(),
  nameTa: text('name_ta').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'inactive'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

export interface LandingHighlight {
  id: string;
  titleEn: string;
  titleTa: string;
  bodyEn: string;
  bodyTa: string;
}

export interface LandingSlidePhoto {
  id: string;
  imageDataUrl: string;
  captionEn: string;
  captionTa: string;
}

// 18. Site & Landing Page Configuration (Admin-managed singleton)
export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey(), // 'default'
  appTitleEn: text('app_title_en').notNull().default('Village Welfare Fund'),
  appTitleTa: text('app_title_ta').notNull().default('கிராம நல நிதி'),
  logoDataUrl: text('logo_data_url'),
  heroBadgeEn: text('hero_badge_en'),
  heroBadgeTa: text('hero_badge_ta'),
  heroSubtitleEn: text('hero_subtitle_en').notNull(),
  heroSubtitleTa: text('hero_subtitle_ta').notNull(),
  highlights: jsonb('highlights').$type<LandingHighlight[]>().notNull().default([]),
  sliderPhotos: jsonb('slider_photos').$type<LandingSlidePhoto[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by'),
});

// Relations
export const membersRelations = relations(members, ({ one, many }) => ({
  userAccount: one(userAccounts, {
    fields: [members.id],
    references: [userAccounts.memberId],
  }),
  memberRoles: many(memberRoles),
  contributionDues: many(contributionDues),
  paymentSubmissions: many(paymentSubmissions),
}));

export const userAccountsRelations = relations(userAccounts, ({ one }) => ({
  member: one(members, {
    fields: [userAccounts.memberId],
    references: [members.id],
  }),
}));

export const memberRolesRelations = relations(memberRoles, ({ one }) => ({
  member: one(members, {
    fields: [memberRoles.memberId],
    references: [members.id],
  }),
  role: one(roles, {
    fields: [memberRoles.roleId],
    references: [roles.id],
  }),
}));

export const fundTransactionsRelations = relations(fundTransactions, ({ many }) => ({
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(fundTransactions, {
    fields: [ledgerEntries.fundTransactionId],
    references: [fundTransactions.id],
  }),
  account: one(fundAccounts, {
    fields: [ledgerEntries.fundAccountId],
    references: [fundAccounts.id],
  }),
}));
