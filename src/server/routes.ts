import crypto from 'crypto';
import express from 'express';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  approvalEligibleMembers,
  approvalRounds,
  assistanceApprovals,
  assistanceRequests,
  attachments,
  auditLogs,
  contributionDues,
  fundAccounts,
  fundTransactions,
  ledgerEntries,
  memberRoles,
  members,
  monthlyUaeSettlements,
  paymentSubmissions,
  roles,
  userAccounts,
} from '../db/schema.ts';
import { recordAudit } from './audit.ts';
import { requireAuth, requireRole, type AuthedRequest, type RoleCode } from './auth.ts';
import {
  checkRateLimit,
  generateRandomToken,
  hashPassword,
  sha256Hex,
  signSessionToken,
  verifyPassword,
} from './crypto.ts';
import {
  fromMinorUnits,
  getAccountBalances,
  postBalancedTransaction,
  toMinorUnits,
} from './ledger.ts';
import { ensureReferenceData } from './seed.ts';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_AED_TO_INR_REPORTING_RATE = 22.5;

function getClientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown').trim();
}

function isValidCurrency(c: unknown): c is 'INR' | 'AED' {
  return c === 'INR' || c === 'AED';
}

function sanitizeCsvCell(val: unknown): string {
  const s = val == null ? '' : String(val);
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function validateAttachmentPayload(att: unknown): {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileDataBase64: string;
} | null {
  if (!att || typeof att !== 'object') return null;
  const obj = att as Record<string, unknown>;
  const fileName = String(obj.fileName || 'proof').slice(0, 140);
  const mimeType = String(obj.mimeType || '');
  const rawBase64 = String(obj.fileDataBase64 || '');
  const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported attachment type. Allowed: PNG, JPG, WEBP, PDF.');
  }
  const buf = Buffer.from(cleanBase64, 'base64');
  if (buf.length === 0 || buf.length > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment must be non-empty and under 2 MB.');
  }
  return {
    fileName,
    mimeType,
    sizeBytes: buf.length,
    fileDataBase64: cleanBase64,
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ============================================================================
  // 1. AUTHENTICATION & PASSWORD LIFECYCLE
  // ============================================================================
  router.post('/auth/login', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkRateLimit(`login:${ip}`, 15, 60_000)) {
        return res.status(429).json({ error: 'Too many login attempts. Please wait a minute.' });
      }
      await ensureReferenceData();

      const username = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      const [account] = await db
        .select()
        .from(userAccounts)
        .where(sql`LOWER(${userAccounts.username}) = ${username}`)
        .limit(1);

      if (!account || !account.passwordHash || !verifyPassword(password, account.passwordHash)) {
        // Generic error to prevent username enumeration (TC-AUTH-002 / TC-AUTH-003)
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      if (account.status !== 'active') {
        return res.status(403).json({ error: 'Account is disabled. Contact your administrator.' });
      }

      await db
        .update(userAccounts)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(userAccounts.id, account.id));

      const token = signSessionToken(account.id, account.username);
      const roleRows = account.memberId
        ? await db
            .select({ code: roles.code })
            .from(memberRoles)
            .innerJoin(roles, eq(memberRoles.roleId, roles.id))
            .where(eq(memberRoles.memberId, account.memberId))
        : [];
      const member = account.memberId
        ? (await db.select().from(members).where(eq(members.id, account.memberId)).limit(1))[0]
        : undefined;

      await recordAudit(db, {
        actorUserId: account.id,
        actorMemberId: account.memberId,
        actorUsername: account.username,
        actorRoleCodes: roleRows.map((r) => r.code),
        entityType: 'user_account',
        entityId: account.id,
        action: 'user_login',
        newValues: { method: 'password' },
      });

      return res.json({
        token,
        user: {
          userAccountId: account.id,
          memberId: account.memberId,
          username: account.username,
          email: account.recoveryEmail || member?.email || null,
          fullNameEn: member?.fullNameEn || account.username,
          fullNameTa: member?.fullNameTa || null,
          roles: roleRows.map((r) => r.code),
        },
      });
    } catch (error) {
      console.error('Login failed:', error);
      return res.status(500).json({ error: 'Authentication failed. Please try again.' });
    }
  });

  router.post('/auth/forgot-password', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkRateLimit(`forgot:${ip}`, 10, 15 * 60_000)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      const identifier = String(req.body?.identifier || '').trim().toLowerCase();
      if (!identifier) {
        return res.status(400).json({ error: 'Username or recovery email is required.' });
      }

      // Always return non-enumerating message (TC-AUTH-006)
      const genericMsg =
        'If an active account matches that username or recovery email, a recovery request has been logged. Please contact your Village Fund Administrator if you do not have a verified recovery email.';

      const [account] = await db
        .select()
        .from(userAccounts)
        .where(
          sql`LOWER(${userAccounts.username}) = ${identifier} OR LOWER(${userAccounts.recoveryEmail}) = ${identifier}`
        )
        .limit(1);

      if (account && account.status === 'active') {
        const rawReset = generateRandomToken('RST');
        await db
          .update(userAccounts)
          .set({
            resetTokenHash: sha256Hex(rawReset),
            resetTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(userAccounts.id, account.id));

        await recordAudit(db, {
          actorUserId: account.id,
          actorMemberId: account.memberId,
          actorUsername: account.username,
          actorRoleCodes: ['self'],
          entityType: 'user_account',
          entityId: account.id,
          action: 'password_reset_requested',
          newValues: { hasRecoveryEmail: Boolean(account.recoveryEmail) },
        });
      }

      return res.json({ message: genericMsg });
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(500).json({ error: 'Unable to process recovery request.' });
    }
  });

  router.post('/auth/reset-password', async (req, res) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const resetToken = String(req.body?.resetToken || '').trim();
      const newPassword = String(req.body?.newPassword || '');
      if (!username || !resetToken || newPassword.length < 8) {
        return res
          .status(400)
          .json({ error: 'Valid username, reset token, and password (min 8 chars) are required.' });
      }

      const [account] = await db
        .select()
        .from(userAccounts)
        .where(sql`LOWER(${userAccounts.username}) = ${username}`)
        .limit(1);

      if (
        !account ||
        !account.resetTokenHash ||
        !account.resetTokenExpiresAt ||
        account.resetTokenExpiresAt.getTime() < Date.now() ||
        account.resetTokenHash !== sha256Hex(resetToken)
      ) {
        return res.status(400).json({ error: 'Invalid or expired reset token.' });
      }

      await db
        .update(userAccounts)
        .set({
          passwordHash: hashPassword(newPassword),
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(userAccounts.id, account.id));

      await recordAudit(db, {
        actorUserId: account.id,
        actorMemberId: account.memberId,
        actorUsername: account.username,
        actorRoleCodes: ['self'],
        entityType: 'user_account',
        entityId: account.id,
        action: 'password_reset_completed',
      });

      return res.json({ message: 'Password updated successfully. You may now sign in.' });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  router.get('/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const member = auth.memberId
        ? (await db.select().from(members).where(eq(members.id, auth.memberId)).limit(1))[0]
        : null;
      return res.json({ user: auth, member });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      return res.status(500).json({ error: 'Failed to load profile.' });
    }
  });

  router.post('/auth/change-password', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
      }
      await db
        .update(userAccounts)
        .set({
          passwordHash: hashPassword(newPassword),
          updatedAt: new Date(),
          updatedBy: auth.userAccountId,
        })
        .where(eq(userAccounts.id, auth.userAccountId));

      await recordAudit(db, {
        actorUserId: auth.userAccountId,
        actorMemberId: auth.memberId,
        actorUsername: auth.username,
        actorRoleCodes: auth.roles,
        entityType: 'user_account',
        entityId: auth.userAccountId,
        action: 'password_changed',
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ error: 'Failed to change password.' });
    }
  });

  // ============================================================================
  // 2. PUBLIC ASSISTANCE REQUEST & TRACKER (UNAUTHENTICATED, ZERO DATA LEAK)
  // ============================================================================
  router.post('/public/assistance', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkRateLimit(`public-asst:${ip}`, 5, 15 * 60_000)) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
      }
      await ensureReferenceData();

      const body = req.body || {};
      const captchaA = Number(body.captchaA);
      const captchaB = Number(body.captchaB);
      const captchaAnswer = Number(body.captchaAnswer);
      if (
        !Number.isFinite(captchaA) ||
        !Number.isFinite(captchaB) ||
        captchaA < 1 ||
        captchaB < 1 ||
        captchaA + captchaB !== captchaAnswer
      ) {
        return res.status(400).json({ error: 'Verification math answer is incorrect.' });
      }

      const publicRequesterName = String(body.publicRequesterName || '').trim();
      const publicRequesterPhone = String(body.publicRequesterPhone || '').trim();
      const beneficiaryNameEn = String(body.beneficiaryNameEn || '').trim();
      const beneficiaryNameTa = String(body.beneficiaryNameTa || '').trim() || null;
      const familyNameEn = String(body.familyNameEn || '').trim() || null;
      const familyNameTa = String(body.familyNameTa || '').trim() || null;
      const streetEn = String(body.streetEn || '').trim() || null;
      const streetTa = String(body.streetTa || '').trim() || null;
      const reason = String(body.reason || '').trim();
      const requestType = body.requestType === 'emergency' ? 'emergency' : 'normal';
      const currencyCode = isValidCurrency(body.currencyCode) ? body.currencyCode : 'INR';
      const amountNum = Number(body.requestedAmount);

      if (!publicRequesterName || !beneficiaryNameEn || !reason || !Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          error: 'Requester name, beneficiary name, positive amount, and reason are required.',
        });
      }

      let attachmentData: ReturnType<typeof validateAttachmentPayload> = null;
      if (body.attachment) {
        attachmentData = validateAttachmentPayload(body.attachment);
      }

      const trackingToken = generateRandomToken('TRK');
      const requestNumber = `REQ-${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

      const result = await db.transaction(async (tx) => {
        // Find active committee members to freeze eligible voter set
        const committeeRole = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, 'committee_member'))
          .limit(1);

        const eligibleRows = committeeRole.length
          ? await tx
              .select({ memberId: memberRoles.memberId })
              .from(memberRoles)
              .innerJoin(members, eq(memberRoles.memberId, members.id))
              .where(and(eq(memberRoles.roleId, committeeRole[0].id), eq(members.status, 'active')))
          : [];

        const initialStatus = eligibleRows.length > 0 ? 'pending_approval' : 'submitted';

        const [created] = await tx
          .insert(assistanceRequests)
          .values({
            requestNumber,
            publicRequesterName,
            publicRequesterPhone: publicRequesterPhone || null,
            beneficiaryNameEn,
            beneficiaryNameTa,
            familyNameEn,
            familyNameTa,
            streetEn,
            streetTa,
            requestedAmount: amountNum.toFixed(2),
            currencyCode,
            reason,
            requestType,
            status: initialStatus,
            publicTrackingTokenHash: sha256Hex(trackingToken),
          })
          .returning();

        if (eligibleRows.length > 0) {
          const requiredApprovals =
            requestType === 'emergency' ? 1 : Math.ceil(eligibleRows.length * 0.5);
          const [round] = await tx
            .insert(approvalRounds)
            .values({
              assistanceRequestId: created.id,
              eligibleCommitteeCount: eligibleRows.length,
              requiredApprovals,
              approvalType: requestType,
            })
            .returning();

          for (const row of eligibleRows) {
            await tx.insert(approvalEligibleMembers).values({
              approvalRoundId: round.id,
              committeeMemberId: row.memberId,
            });
          }
        }

        if (attachmentData) {
          await tx.insert(attachments).values({
            entityType: 'assistance_request',
            entityId: created.id,
            ...attachmentData,
          });
        }

        await recordAudit(tx, {
          actorRoleCodes: ['public'],
          entityType: 'assistance_request',
          entityId: created.id,
          action: 'public_assistance_submitted',
          newValues: {
            requestNumber,
            requestType,
            currencyCode,
            requestedAmount: amountNum.toFixed(2),
            status: initialStatus,
          },
        });

        return created;
      });

      return res.status(201).json({
        requestNumber: result.requestNumber,
        trackingToken,
        status: result.status,
      });
    } catch (error: any) {
      console.error('Public assistance submission error:', error);
      return res.status(400).json({ error: error.message || 'Failed to submit assistance request.' });
    }
  });

  router.post('/public/assistance/track', async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!checkRateLimit(`public-track:${ip}`, 20, 15 * 60_000)) {
        return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
      }
      const requestNumber = String(req.body?.requestNumber || '').trim().toUpperCase();
      const trackingToken = String(req.body?.trackingToken || '').trim().toUpperCase();
      if (!requestNumber || !trackingToken) {
        return res.status(400).json({ error: 'Request number and tracking token are required.' });
      }

      const [found] = await db
        .select({
          requestNumber: assistanceRequests.requestNumber,
          status: assistanceRequests.status,
          requestType: assistanceRequests.requestType,
          currencyCode: assistanceRequests.currencyCode,
          requestedAmount: assistanceRequests.requestedAmount,
          createdAt: assistanceRequests.createdAt,
          paidAt: assistanceRequests.paidAt,
          publicTrackingTokenHash: assistanceRequests.publicTrackingTokenHash,
        })
        .from(assistanceRequests)
        .where(eq(assistanceRequests.requestNumber, requestNumber))
        .limit(1);

      if (!found || !found.publicTrackingTokenHash || found.publicTrackingTokenHash !== sha256Hex(trackingToken)) {
        return res.status(404).json({ error: 'No matching assistance request found.' });
      }

      return res.json({
        requestNumber: found.requestNumber,
        status: found.status,
        requestType: found.requestType,
        currencyCode: found.currencyCode,
        requestedAmount: found.requestedAmount,
        createdAt: found.createdAt,
        paidAt: found.paidAt,
      });
    } catch (error) {
      console.error('Public tracking error:', error);
      return res.status(500).json({ error: 'Failed to retrieve status.' });
    }
  });

  // ============================================================================
  // 3. ROLE-SCOPED DASHBOARD
  // ============================================================================
  router.get('/dashboard', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const rawMonth = String(req.query.month || '');
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)
        ? rawMonth
        : new Date().toISOString().slice(0, 7);

      const [yearStr, monthStr] = month.split('-');
      const baseYear = Number(yearStr);
      const baseMonthIdx = Number(monthStr) - 1;
      const trendMonths: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(baseYear, baseMonthIdx - i, 1));
        trendMonths.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const firstMonthStart = `${trendMonths[0]}-01`;
      const selectedMonthLastDay = new Date(Date.UTC(baseYear, baseMonthIdx + 1, 0)).getUTCDate();
      const selectedMonthStart = `${month}-01`;
      const selectedMonthEnd = `${month}-${String(selectedMonthLastDay).padStart(2, '0')}`;

      const accountBalances = await getAccountBalances(db);
      const inrAssetAccounts = accountBalances.filter(
        (a) => a.accountType === 'asset' && a.currencyCode === 'INR'
      );
      const aedAssetAccounts = accountBalances.filter(
        (a) => a.accountType === 'asset' && a.currencyCode === 'AED'
      );

      const totalInrMinor = inrAssetAccounts.reduce((acc, a) => acc + toMinorUnits(a.balance), 0);
      const totalAedMinor = aedAssetAccounts.reduce((acc, a) => acc + toMinorUnits(a.balance), 0);

      const [activeMembersCountRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(members)
        .where(eq(members.status, 'active'));

      const [pendingPaymentsCountRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(paymentSubmissions)
        .where(eq(paymentSubmissions.status, 'pending'));

      const [pendingAssistanceCountRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(assistanceRequests)
        .where(inArray(assistanceRequests.status, ['submitted', 'pending_approval']));

      const [approvedUnpaidAssistanceRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(assistanceRequests)
        .where(eq(assistanceRequests.status, 'approved'));

      // Own latest 5 confirmed contributions (FR-CON-009)
      const ownLatestFive = auth.memberId
        ? await db
            .select({
              id: paymentSubmissions.id,
              paymentDate: paymentSubmissions.paymentDate,
              amount: paymentSubmissions.amount,
              currencyCode: paymentSubmissions.currencyCode,
              paymentMethod: paymentSubmissions.paymentMethod,
              transactionReference: paymentSubmissions.transactionReference,
              approvedAt: paymentSubmissions.approvedAt,
              fundTransactionId: paymentSubmissions.fundTransactionId,
            })
            .from(paymentSubmissions)
            .where(
              and(
                eq(paymentSubmissions.memberId, auth.memberId),
                eq(paymentSubmissions.status, 'approved')
              )
            )
            .orderBy(desc(paymentSubmissions.paymentDate), desc(paymentSubmissions.approvedAt))
            .limit(5)
        : [];

      const ownDues = auth.memberId
        ? await db
            .select()
            .from(contributionDues)
            .where(eq(contributionDues.memberId, auth.memberId))
            .orderBy(desc(contributionDues.periodStart))
            .limit(6)
        : [];

      const [ownMember] = auth.memberId
        ? await db.select().from(members).where(eq(members.id, auth.memberId)).limit(1)
        : [];

      // Monthly collections summary (confirmed payments in selected month)
      const monthCollections = await db
        .select({
          currencyCode: paymentSubmissions.currencyCode,
          total: sql<string>`COALESCE(SUM(${paymentSubmissions.amount}), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(paymentSubmissions)
        .where(
          and(
            eq(paymentSubmissions.status, 'approved'),
            gte(paymentSubmissions.paymentDate, selectedMonthStart),
            lte(paymentSubmissions.paymentDate, selectedMonthEnd)
          )
        )
        .groupBy(paymentSubmissions.currencyCode);

      // 6-month verified contribution trends ending at selected month (INR & AED separated)
      const trendRows = await db
        .select({
          monthKey: sql<string>`SUBSTR(${paymentSubmissions.paymentDate}, 1, 7)`,
          currencyCode: paymentSubmissions.currencyCode,
          total: sql<string>`COALESCE(SUM(${paymentSubmissions.amount}), 0)`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(paymentSubmissions)
        .where(
          and(
            eq(paymentSubmissions.status, 'approved'),
            gte(paymentSubmissions.paymentDate, firstMonthStart),
            lte(paymentSubmissions.paymentDate, selectedMonthEnd)
          )
        )
        .groupBy(sql`SUBSTR(${paymentSubmissions.paymentDate}, 1, 7)`, paymentSubmissions.currencyCode);

      const monthlyTrends = trendMonths.map((m) => {
        const inrRow = trendRows.find((r) => r.monthKey === m && r.currencyCode === 'INR');
        const aedRow = trendRows.find((r) => r.monthKey === m && r.currencyCode === 'AED');
        return {
          month: m,
          inrTotal: Number(Number(inrRow?.total ?? 0).toFixed(2)),
          aedTotal: Number(Number(aedRow?.total ?? 0).toFixed(2)),
          inrCount: inrRow?.count ?? 0,
          aedCount: aedRow?.count ?? 0,
        };
      });

      const isPrivileged = auth.roles.some((r) =>
        ['admin', 'committee_member', 'treasurer', 'auditor'].includes(r)
      );

      return res.json({
        month,
        balances: {
          inrTotal: fromMinorUnits(totalInrMinor),
          aedTotal: fromMinorUnits(totalAedMinor),
          accounts: isPrivileged ? accountBalances : [],
        },
        communitySummary: {
          activeMembers: activeMembersCountRow?.count ?? 0,
          pendingPayments: isPrivileged ? (pendingPaymentsCountRow?.count ?? 0) : undefined,
          pendingAssistance: isPrivileged ? (pendingAssistanceCountRow?.count ?? 0) : undefined,
          approvedAwaitingPayout: isPrivileged
            ? (approvedUnpaidAssistanceRow?.count ?? 0)
            : undefined,
          monthlyCollections: monthCollections,
          monthlyTrends,
        },
        ownSummary: {
          member: ownMember || null,
          latestFiveConfirmed: ownLatestFive,
          recentDues: ownDues,
        },
      });
    } catch (error) {
      console.error('Dashboard fetch failed:', error);
      return res.status(500).json({ error: 'Failed to load dashboard summary.' });
    }
  });

  // ============================================================================
  // 4. MEMBERS & ROLES MANAGEMENT
  // ============================================================================
  router.get(
    '/members',
    requireAuth,
    requireRole('admin', 'committee_member', 'treasurer', 'auditor'),
    async (_req: AuthedRequest, res) => {
      try {
        const allMembers = await db.select().from(members).orderBy(members.memberNumber);
        const allAccounts = await db
          .select({
            id: userAccounts.id,
            memberId: userAccounts.memberId,
            username: userAccounts.username,
            recoveryEmail: userAccounts.recoveryEmail,
            status: userAccounts.status,
            hasPassword: sql<boolean>`${userAccounts.passwordHash} IS NOT NULL`,
            hasGoogleLink: sql<boolean>`${userAccounts.authUserId} IS NOT NULL`,
            lastLoginAt: userAccounts.lastLoginAt,
          })
          .from(userAccounts);

        const allRoleAssignments = await db
          .select({
            memberId: memberRoles.memberId,
            roleCode: roles.code,
          })
          .from(memberRoles)
          .innerJoin(roles, eq(memberRoles.roleId, roles.id));

        const accountByMember = new Map(allAccounts.map((a) => [a.memberId, a]));
        const rolesByMember = new Map<string, string[]>();
        for (const r of allRoleAssignments) {
          const list = rolesByMember.get(r.memberId) || [];
          list.push(r.roleCode);
          rolesByMember.set(r.memberId, list);
        }

        const enriched = allMembers.map((m) => ({
          ...m,
          userAccount: accountByMember.get(m.id) || null,
          roles: rolesByMember.get(m.id) || [],
        }));

        return res.json({ members: enriched });
      } catch (error) {
        console.error('Fetch members failed:', error);
        return res.status(500).json({ error: 'Failed to fetch members.' });
      }
    }
  );

  router.post(
    '/members',
    requireAuth,
    requireRole('admin', 'committee_member'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const body = req.body || {};
        const memberNumber = String(body.memberNumber || '').trim().toUpperCase();
        const fullNameEn = String(body.fullNameEn || '').trim();
        const expectedAmt = Number(body.expectedContributionAmount ?? 0);
        const expectedCurrency = isValidCurrency(body.expectedContributionCurrency)
          ? body.expectedContributionCurrency
          : 'INR';
        const frequency = body.contributionFrequency === 'yearly' ? 'yearly' : 'monthly';

        if (!memberNumber || !fullNameEn || !Number.isFinite(expectedAmt) || expectedAmt < 0) {
          return res.status(400).json({
            error: 'Member number, English full name, and non-negative expected contribution are required.',
          });
        }

        const created = await db.transaction(async (tx) => {
          const [member] = await tx
            .insert(members)
            .values({
              memberNumber,
              fullNameEn,
              fullNameTa: String(body.fullNameTa || '').trim() || null,
              phoneNumber: String(body.phoneNumber || '').trim() || null,
              email: String(body.email || '').trim().toLowerCase() || null,
              streetEn: String(body.streetEn || '').trim() || null,
              streetTa: String(body.streetTa || '').trim() || null,
              locationEn: String(body.locationEn || '').trim() || null,
              locationTa: String(body.locationTa || '').trim() || null,
              contributionFrequency: frequency,
              expectedContributionAmount: expectedAmt.toFixed(2),
              expectedContributionCurrency: expectedCurrency,
              status: 'active',
              createdBy: auth.userAccountId,
              updatedBy: auth.userAccountId,
            })
            .returning();

          // Default 'member' role
          const [memberRole] = await tx
            .select()
            .from(roles)
            .where(eq(roles.code, 'member'))
            .limit(1);
          if (memberRole) {
            await tx.insert(memberRoles).values({
              memberId: member.id,
              roleId: memberRole.id,
              assignedBy: auth.userAccountId,
            });
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'member',
            entityId: member.id,
            action: 'member_created',
            newValues: {
              memberNumber: member.memberNumber,
              fullNameEn: member.fullNameEn,
              expectedContributionAmount: member.expectedContributionAmount,
              expectedContributionCurrency: member.expectedContributionCurrency,
            },
          });

          return member;
        });

        return res.status(201).json({ member: created });
      } catch (error: any) {
        if (String(error?.code) === '23505') {
          return res.status(409).json({ error: 'Member number already exists.' });
        }
        console.error('Create member failed:', error);
        return res.status(500).json({ error: 'Failed to create member.' });
      }
    }
  );

  router.patch(
    '/members/:id',
    requireAuth,
    requireRole('admin', 'committee_member'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const memberId = String(req.params.id);
        const body = req.body || {};

        const [existing] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
        if (!existing) {
          return res.status(404).json({ error: 'Member not found.' });
        }

        const expectedAmt =
          body.expectedContributionAmount !== undefined
            ? Number(body.expectedContributionAmount)
            : Number(existing.expectedContributionAmount);
        if (!Number.isFinite(expectedAmt) || expectedAmt < 0) {
          return res.status(400).json({ error: 'Expected contribution cannot be negative.' });
        }

        const updated = await db.transaction(async (tx) => {
          const nextStatus =
            body.status === 'active' || body.status === 'inactive' ? body.status : existing.status;

          const [row] = await tx
            .update(members)
            .set({
              fullNameEn:
                body.fullNameEn !== undefined ? String(body.fullNameEn).trim() : existing.fullNameEn,
              fullNameTa:
                body.fullNameTa !== undefined
                  ? String(body.fullNameTa).trim() || null
                  : existing.fullNameTa,
              phoneNumber:
                body.phoneNumber !== undefined
                  ? String(body.phoneNumber).trim() || null
                  : existing.phoneNumber,
              email:
                body.email !== undefined
                  ? String(body.email).trim().toLowerCase() || null
                  : existing.email,
              streetEn:
                body.streetEn !== undefined
                  ? String(body.streetEn).trim() || null
                  : existing.streetEn,
              streetTa:
                body.streetTa !== undefined
                  ? String(body.streetTa).trim() || null
                  : existing.streetTa,
              locationEn:
                body.locationEn !== undefined
                  ? String(body.locationEn).trim() || null
                  : existing.locationEn,
              locationTa:
                body.locationTa !== undefined
                  ? String(body.locationTa).trim() || null
                  : existing.locationTa,
              contributionFrequency:
                body.contributionFrequency === 'monthly' || body.contributionFrequency === 'yearly'
                  ? body.contributionFrequency
                  : existing.contributionFrequency,
              expectedContributionAmount: expectedAmt.toFixed(2),
              expectedContributionCurrency: isValidCurrency(body.expectedContributionCurrency)
                ? body.expectedContributionCurrency
                : existing.expectedContributionCurrency,
              status: nextStatus,
              updatedAt: new Date(),
              updatedBy: auth.userAccountId,
            })
            .where(eq(members.id, memberId))
            .returning();

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'member',
            entityId: memberId,
            action: nextStatus !== existing.status ? `member_status_${nextStatus}` : 'member_updated',
            oldValues: {
              fullNameEn: existing.fullNameEn,
              expectedContributionAmount: existing.expectedContributionAmount,
              expectedContributionCurrency: existing.expectedContributionCurrency,
              status: existing.status,
            },
            newValues: {
              fullNameEn: row.fullNameEn,
              expectedContributionAmount: row.expectedContributionAmount,
              expectedContributionCurrency: row.expectedContributionCurrency,
              status: row.status,
            },
          });

          return row;
        });

        return res.json({ member: updated });
      } catch (error) {
        console.error('Update member failed:', error);
        return res.status(500).json({ error: 'Failed to update member.' });
      }
    }
  );

  router.post(
    '/members/:id/account',
    requireAuth,
    requireRole('admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const memberId = String(req.params.id);
        const username = String(req.body?.username || '').trim().toLowerCase();
        const recoveryEmail = String(req.body?.recoveryEmail || '').trim().toLowerCase() || null;
        const password = String(req.body?.password || '');
        const status = req.body?.status === 'disabled' ? 'disabled' : 'active';

        if (!username || username.length < 3) {
          return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }
        if (password && password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters if provided.' });
        }

        const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
        if (!member) {
          return res.status(404).json({ error: 'Member not found.' });
        }

        const result = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(userAccounts)
            .where(eq(userAccounts.memberId, memberId))
            .limit(1);

          if (existing) {
            const [updated] = await tx
              .update(userAccounts)
              .set({
                username,
                recoveryEmail: recoveryEmail ?? existing.recoveryEmail,
                passwordHash: password ? hashPassword(password) : existing.passwordHash,
                status,
                updatedAt: new Date(),
                updatedBy: auth.userAccountId,
              })
              .where(eq(userAccounts.id, existing.id))
              .returning();

            await recordAudit(tx, {
              actorUserId: auth.userAccountId,
              actorMemberId: auth.memberId,
              actorUsername: auth.username,
              actorRoleCodes: auth.roles,
              entityType: 'user_account',
              entityId: updated.id,
              action: 'user_account_updated',
              oldValues: { username: existing.username, status: existing.status },
              newValues: { username: updated.username, status: updated.status },
            });
            return updated;
          }

          const [created] = await tx
            .insert(userAccounts)
            .values({
              memberId,
              username,
              recoveryEmail: recoveryEmail || member.email || null,
              passwordHash: password ? hashPassword(password) : null,
              status,
              createdBy: auth.userAccountId,
              updatedBy: auth.userAccountId,
            })
            .returning();

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'user_account',
            entityId: created.id,
            action: 'user_account_created',
            newValues: { memberId, username: created.username, status: created.status },
          });
          return created;
        });

        return res.json({
          account: {
            id: result.id,
            memberId: result.memberId,
            username: result.username,
            recoveryEmail: result.recoveryEmail,
            status: result.status,
          },
        });
      } catch (error: any) {
        if (String(error?.code) === '23505') {
          return res.status(409).json({ error: 'Username is already taken.' });
        }
        console.error('Account linking failed:', error);
        return res.status(500).json({ error: 'Failed to provision user account.' });
      }
    }
  );

  router.put(
    '/members/:id/roles',
    requireAuth,
    requireRole('admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const memberId = String(req.params.id);
        const requestedCodes = Array.isArray(req.body?.roles)
          ? (req.body.roles as string[]).filter((c) =>
              ['admin', 'committee_member', 'treasurer', 'member', 'auditor'].includes(c)
            )
          : [];

        const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
        if (!member) {
          return res.status(404).json({ error: 'Member not found.' });
        }

        await db.transaction(async (tx) => {
          const prevRoles = await tx
            .select({ code: roles.code })
            .from(memberRoles)
            .innerJoin(roles, eq(memberRoles.roleId, roles.id))
            .where(eq(memberRoles.memberId, memberId));

          await tx.delete(memberRoles).where(eq(memberRoles.memberId, memberId));

          if (requestedCodes.length > 0) {
            const roleRows = await tx
              .select()
              .from(roles)
              .where(inArray(roles.code, requestedCodes));
            for (const r of roleRows) {
              await tx.insert(memberRoles).values({
                memberId,
                roleId: r.id,
                assignedBy: auth.userAccountId,
              });
            }
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'member_roles',
            entityId: memberId,
            action: 'roles_updated',
            oldValues: { roles: prevRoles.map((r) => r.code) },
            newValues: { roles: requestedCodes },
          });
        });

        return res.json({ roles: requestedCodes });
      } catch (error) {
        console.error('Role update failed:', error);
        return res.status(500).json({ error: 'Failed to update roles.' });
      }
    }
  );

  // ============================================================================
  // 5. CONTRIBUTIONS, DUES & PAYMENT VERIFICATION
  // ============================================================================
  router.get('/contributions/dues', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const isPrivileged = auth.roles.some((r) =>
        ['admin', 'committee_member', 'treasurer', 'auditor'].includes(r)
      );
      const targetMemberId = req.query.memberId ? String(req.query.memberId) : null;

      if (!isPrivileged && targetMemberId && targetMemberId !== auth.memberId) {
        return res.status(403).json({ error: 'Cannot view other members dues.' });
      }

      const filterMemberId = isPrivileged ? targetMemberId : auth.memberId;
      if (!isPrivileged && !filterMemberId) {
        return res.json({ dues: [] });
      }

      const rows = await db
        .select({
          id: contributionDues.id,
          memberId: contributionDues.memberId,
          memberNumber: members.memberNumber,
          fullNameEn: members.fullNameEn,
          fullNameTa: members.fullNameTa,
          periodStart: contributionDues.periodStart,
          periodEnd: contributionDues.periodEnd,
          dueAmount: contributionDues.dueAmount,
          currencyCode: contributionDues.currencyCode,
          dueDate: contributionDues.dueDate,
          status: contributionDues.status,
        })
        .from(contributionDues)
        .innerJoin(members, eq(contributionDues.memberId, members.id))
        .where(filterMemberId ? eq(contributionDues.memberId, filterMemberId) : undefined)
        .orderBy(desc(contributionDues.periodStart), members.memberNumber)
        .limit(200);

      return res.json({ dues: rows });
    } catch (error) {
      console.error('Fetch dues failed:', error);
      return res.status(500).json({ error: 'Failed to load contribution dues.' });
    }
  });

  router.post(
    '/contributions/dues/generate',
    requireAuth,
    requireRole('admin', 'committee_member'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const month = String(req.body?.month || new Date().toISOString().slice(0, 7));
        if (!/^\d{4}-\d{2}$/.test(month)) {
          return res.status(400).json({ error: 'Month must be YYYY-MM.' });
        }
        const [yearStr, monthStr] = month.split('-');
        const yearNum = Number(yearStr);
        const monthNum = Number(monthStr);
        const lastDay = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
        const periodStart = `${month}-01`;
        const periodEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
        const dueDate = `${month}-10`;

        const activeMembers = await db
          .select()
          .from(members)
          .where(eq(members.status, 'active'));

        let createdCount = 0;
        await db.transaction(async (tx) => {
          for (const m of activeMembers) {
            if (Number(m.expectedContributionAmount) <= 0) continue;
            // For yearly contributors, generate only in January (or if explicitly forced)
            if (m.contributionFrequency === 'yearly' && monthNum !== 1 && !req.body?.includeYearly) {
              continue;
            }
            const yPeriodStart = m.contributionFrequency === 'yearly' ? `${yearStr}-01-01` : periodStart;
            const yPeriodEnd = m.contributionFrequency === 'yearly' ? `${yearStr}-12-31` : periodEnd;
            const inserted = await tx
              .insert(contributionDues)
              .values({
                memberId: m.id,
                periodStart: yPeriodStart,
                periodEnd: yPeriodEnd,
                dueAmount: m.expectedContributionAmount,
                currencyCode: m.expectedContributionCurrency,
                dueDate,
                status: 'unpaid',
              })
              .onConflictDoNothing()
              .returning({ id: contributionDues.id });
            if (inserted.length > 0) createdCount++;
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'contribution_dues',
            entityId: auth.userAccountId,
            action: 'dues_generated',
            newValues: { month, createdCount },
          });
        });

        return res.json({ createdCount, month });
      } catch (error) {
        console.error('Generate dues failed:', error);
        return res.status(500).json({ error: 'Failed to generate dues.' });
      }
    }
  );

  router.get('/contributions/payments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const isPrivileged = auth.roles.some((r) =>
        ['admin', 'committee_member', 'treasurer', 'auditor'].includes(r)
      );
      const statusFilter = req.query.status ? String(req.query.status) : null;
      const targetMemberId = req.query.memberId ? String(req.query.memberId) : null;

      if (!isPrivileged && targetMemberId && targetMemberId !== auth.memberId) {
        return res.status(403).json({ error: 'Cannot view other members payment history.' });
      }

      const conditions = [];
      if (!isPrivileged) {
        if (!auth.memberId) return res.json({ payments: [] });
        conditions.push(eq(paymentSubmissions.memberId, auth.memberId));
      } else if (targetMemberId) {
        conditions.push(eq(paymentSubmissions.memberId, targetMemberId));
      }
      if (statusFilter) {
        conditions.push(eq(paymentSubmissions.status, statusFilter));
      }

      const rows = await db
        .select({
          id: paymentSubmissions.id,
          memberId: paymentSubmissions.memberId,
          memberNumber: members.memberNumber,
          memberNameEn: members.fullNameEn,
          memberNameTa: members.fullNameTa,
          contributionDueId: paymentSubmissions.contributionDueId,
          submittedByUserId: paymentSubmissions.submittedByUserId,
          paymentDate: paymentSubmissions.paymentDate,
          amount: paymentSubmissions.amount,
          currencyCode: paymentSubmissions.currencyCode,
          paymentMethod: paymentSubmissions.paymentMethod,
          transactionReference: paymentSubmissions.transactionReference,
          notes: paymentSubmissions.notes,
          status: paymentSubmissions.status,
          approvedByUserId: paymentSubmissions.approvedByUserId,
          approvedAt: paymentSubmissions.approvedAt,
          rejectionReason: paymentSubmissions.rejectionReason,
          fundTransactionId: paymentSubmissions.fundTransactionId,
          createdAt: paymentSubmissions.createdAt,
        })
        .from(paymentSubmissions)
        .innerJoin(members, eq(paymentSubmissions.memberId, members.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(paymentSubmissions.createdAt))
        .limit(200);

      const ids = rows.map((r) => r.id);
      const attList =
        ids.length > 0
          ? await db
              .select({
                id: attachments.id,
                entityId: attachments.entityId,
                fileName: attachments.fileName,
                mimeType: attachments.mimeType,
                sizeBytes: attachments.sizeBytes,
              })
              .from(attachments)
              .where(
                and(
                  eq(attachments.entityType, 'payment_submission'),
                  inArray(attachments.entityId, ids)
                )
              )
          : [];

      const attMap = new Map<string, typeof attList>();
      for (const a of attList) {
        const list = attMap.get(a.entityId) || [];
        list.push(a);
        attMap.set(a.entityId, list);
      }

      return res.json({
        payments: rows.map((r) => ({
          ...r,
          attachments: attMap.get(r.id) || [],
          canApprove:
            auth.roles.some((role) => role === 'committee_member' || role === 'admin') &&
            r.status === 'pending' &&
            r.submittedByUserId !== auth.userAccountId,
        })),
      });
    } catch (error) {
      console.error('Fetch payments failed:', error);
      return res.status(500).json({ error: 'Failed to load payment submissions.' });
    }
  });

  router.post('/contributions/payments', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const body = req.body || {};
      const canRecordForOthers = auth.roles.some((r) =>
        ['admin', 'committee_member'].includes(r)
      );
      const targetMemberId =
        canRecordForOthers && body.memberId ? String(body.memberId) : auth.memberId;

      if (!targetMemberId) {
        return res.status(400).json({ error: 'No linked member record for this submission.' });
      }

      const amountNum = Number(body.amount);
      const currencyCode = isValidCurrency(body.currencyCode) ? body.currencyCode : 'INR';
      const paymentDate = String(body.paymentDate || new Date().toISOString().slice(0, 10));
      const paymentMethod = String(body.paymentMethod || 'bank_transfer');
      const transactionReference = String(body.transactionReference || '').trim();
      const notes = String(body.notes || '').trim() || null;
      const contributionDueId = body.contributionDueId ? String(body.contributionDueId) : null;

      if (!Number.isFinite(amountNum) || amountNum <= 0 || !transactionReference) {
        return res.status(400).json({
          error: 'Positive payment amount and transaction reference are required.',
        });
      }

      // Duplicate payment reference check (FR-CON-010 / TC-PAY-015)
      if (paymentMethod !== 'cash') {
        const dup = await db
          .select({ id: paymentSubmissions.id })
          .from(paymentSubmissions)
          .where(
            and(
              sql`LOWER(${paymentSubmissions.transactionReference}) = ${transactionReference.toLowerCase()}`,
              eq(paymentSubmissions.currencyCode, currencyCode),
              inArray(paymentSubmissions.status, ['pending', 'approved'])
            )
          )
          .limit(1);
        if (dup.length > 0) {
          return res.status(409).json({
            error: `Duplicate transaction reference "${transactionReference}" already exists for ${currencyCode}.`,
          });
        }
      }

      let attachmentData: ReturnType<typeof validateAttachmentPayload> = null;
      if (body.attachment) {
        attachmentData = validateAttachmentPayload(body.attachment);
      }

      const created = await db.transaction(async (tx) => {
        const [submission] = await tx
          .insert(paymentSubmissions)
          .values({
            memberId: targetMemberId,
            contributionDueId,
            submittedByUserId: auth.userAccountId,
            paymentDate,
            amount: amountNum.toFixed(2),
            currencyCode,
            paymentMethod,
            transactionReference,
            notes,
            status: 'pending',
            createdBy: auth.userAccountId,
            updatedBy: auth.userAccountId,
          })
          .returning();

        if (attachmentData) {
          await tx.insert(attachments).values({
            entityType: 'payment_submission',
            entityId: submission.id,
            ...attachmentData,
            uploadedByUserId: auth.userAccountId,
          });
        }

        await recordAudit(tx, {
          actorUserId: auth.userAccountId,
          actorMemberId: auth.memberId,
          actorUsername: auth.username,
          actorRoleCodes: auth.roles,
          entityType: 'payment_submission',
          entityId: submission.id,
          action: 'payment_submitted',
          newValues: {
            memberId: targetMemberId,
            amount: submission.amount,
            currencyCode,
            transactionReference,
            status: 'pending',
          },
        });

        return submission;
      });

      return res.status(201).json({ payment: created });
    } catch (error: any) {
      console.error('Payment submission failed:', error);
      return res.status(400).json({ error: error.message || 'Failed to submit payment.' });
    }
  });

  router.post(
    '/contributions/payments/:id/approve',
    requireAuth,
    requireRole('committee_member', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const submissionId = String(req.params.id);
        const idempotencyKey = String(req.body?.idempotencyKey || `pay-approve-${submissionId}`);
        const overrideReason = String(req.body?.overrideReason || '').trim();

        const isCommittee = auth.roles.includes('committee_member');
        if (!isCommittee && auth.roles.includes('admin') && !overrideReason) {
          return res.status(400).json({
            error: 'Admin approval override requires an explicit reason.',
          });
        }

        const result = await db.transaction(async (tx) => {
          // Lock payment row for update
          const lockedRows = await tx.execute(
            sql`SELECT * FROM payment_submissions WHERE id = ${submissionId} FOR UPDATE`
          );
          const row = lockedRows.rows[0] as Record<string, any> | undefined;
          if (!row) {
            throw Object.assign(new Error('Payment submission not found.'), { statusCode: 404 });
          }

          // Idempotent retry if already approved with same transaction
          if (row.status === 'approved' && row.fund_transaction_id) {
            return {
              alreadyApproved: true,
              fundTransactionId: row.fund_transaction_id as string,
            };
          }

          if (row.status !== 'pending') {
            throw Object.assign(new Error(`Payment is already ${row.status}.`), { statusCode: 409 });
          }

          // BR-005: Creator cannot approve their own payment submission!
          if (row.submitted_by_user_id === auth.userAccountId || row.created_by === auth.userAccountId) {
            await recordAudit(tx, {
              actorUserId: auth.userAccountId,
              actorMemberId: auth.memberId,
              actorUsername: auth.username,
              actorRoleCodes: auth.roles,
              entityType: 'payment_submission',
              entityId: submissionId,
              action: 'payment_self_approval_blocked',
              reason: 'Separation of duties violation',
            });
            throw Object.assign(
              new Error('Separation of duties: payment creator cannot approve their own record.'),
              { statusCode: 403 }
            );
          }

          const amountMinor = toMinorUnits(row.amount);
          const currencyCode = row.currency_code as 'INR' | 'AED';
          const rate = currencyCode === 'INR' ? 1 : DEFAULT_AED_TO_INR_REPORTING_RATE;
          const functionalInrMinor = Math.round(amountMinor * rate);
          const assetCode =
            currencyCode === 'AED' ? '1030' : row.payment_method === 'cash' ? '1020' : '1010';
          const incomeCode = currencyCode === 'AED' ? '4020' : '4010';

          const posted = await postBalancedTransaction(tx, {
            transactionType: 'contribution_receipt',
            transactionDate: row.payment_date,
            referenceType: 'payment_submission',
            referenceId: submissionId,
            description: `Verified contribution (${currencyCode} ${row.amount}) · Ref ${row.transaction_reference}`,
            idempotencyKey,
            postedByUserId: auth.userAccountId,
            lines: [
              {
                accountCode: assetCode,
                side: 'debit',
                transactionAmountMinor: amountMinor,
                functionalAmountInrMinor: functionalInrMinor,
                exchangeRateToInr: rate,
              },
              {
                accountCode: incomeCode,
                side: 'credit',
                transactionAmountMinor: amountMinor,
                functionalAmountInrMinor: functionalInrMinor,
                exchangeRateToInr: rate,
              },
            ],
          });

          await tx
            .update(paymentSubmissions)
            .set({
              status: 'approved',
              approvedByUserId: auth.userAccountId,
              approvedAt: new Date(),
              fundTransactionId: posted.transactionId,
              updatedAt: new Date(),
              updatedBy: auth.userAccountId,
            })
            .where(eq(paymentSubmissions.id, submissionId));

          // Update linked due status if applicable (supports partial payments & installments)
          if (row.contribution_due_id) {
            const [due] = await tx
              .select()
              .from(contributionDues)
              .where(eq(contributionDues.id, row.contribution_due_id))
              .limit(1);
            if (due) {
              const paidRows = await tx
                .select({ total: sql<string>`COALESCE(SUM(${paymentSubmissions.amount}), 0)` })
                .from(paymentSubmissions)
                .where(
                  and(
                    eq(paymentSubmissions.contributionDueId, due.id),
                    eq(paymentSubmissions.status, 'approved')
                  )
                );
              const totalPaidMinor = toMinorUnits(paidRows[0]?.total ?? 0);
              const dueMinor = toMinorUnits(due.dueAmount);
              const nextDueStatus = totalPaidMinor >= dueMinor ? 'paid' : 'partially_paid';
              await tx
                .update(contributionDues)
                .set({ status: nextDueStatus, updatedAt: new Date() })
                .where(eq(contributionDues.id, due.id));
            }
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'payment_submission',
            entityId: submissionId,
            fundTransactionId: posted.transactionId,
            action: 'payment_approved',
            oldValues: { status: 'pending' },
            newValues: {
              status: 'approved',
              amount: row.amount,
              currencyCode,
              transactionNumber: posted.transactionNumber,
            },
            reason: overrideReason || null,
          });

          return {
            alreadyApproved: false,
            fundTransactionId: posted.transactionId,
            transactionNumber: posted.transactionNumber,
          };
        });

        return res.json(result);
      } catch (error: any) {
        const code = error.statusCode || 500;
        if (code === 500) console.error('Approve payment failed:', error);
        return res.status(code).json({ error: error.message || 'Failed to approve payment.' });
      }
    }
  );

  router.post(
    '/contributions/payments/:id/reject',
    requireAuth,
    requireRole('committee_member', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const submissionId = String(req.params.id);
        const reason = String(req.body?.reason || '').trim();
        if (!reason) {
          return res.status(400).json({ error: 'Rejection reason is required.' });
        }

        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(paymentSubmissions)
            .where(eq(paymentSubmissions.id, submissionId))
            .limit(1);
          if (!existing) {
            throw Object.assign(new Error('Payment submission not found.'), { statusCode: 404 });
          }
          if (existing.status !== 'pending') {
            throw Object.assign(new Error(`Payment is already ${existing.status}.`), {
              statusCode: 409,
            });
          }

          await tx
            .update(paymentSubmissions)
            .set({
              status: 'rejected',
              rejectionReason: reason,
              approvedByUserId: auth.userAccountId,
              approvedAt: new Date(),
              updatedAt: new Date(),
              updatedBy: auth.userAccountId,
            })
            .where(eq(paymentSubmissions.id, submissionId));

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'payment_submission',
            entityId: submissionId,
            action: 'payment_rejected',
            oldValues: { status: 'pending' },
            newValues: { status: 'rejected' },
            reason,
          });
        });

        return res.json({ status: 'rejected' });
      } catch (error: any) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Rejection failed.' });
      }
    }
  );

  // ============================================================================
  // 6. PRIVATE ACCESS-CONTROLLED ATTACHMENTS
  // ============================================================================
  router.get('/attachments/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const attId = String(req.params.id);
      const [att] = await db.select().from(attachments).where(eq(attachments.id, attId)).limit(1);
      if (!att) {
        return res.status(404).json({ error: 'Attachment not found.' });
      }

      const isPrivileged = auth.roles.some((r) =>
        ['admin', 'committee_member', 'treasurer', 'auditor'].includes(r)
      );
      if (!isPrivileged && att.uploadedByUserId !== auth.userAccountId) {
        return res.status(403).json({ error: 'Forbidden: Not authorized to view this file.' });
      }

      const buf = Buffer.from(att.fileDataBase64, 'base64');
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${att.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`
      );
      return res.send(buf);
    } catch (error) {
      console.error('Attachment download error:', error);
      return res.status(500).json({ error: 'Failed to retrieve attachment.' });
    }
  });

  // ============================================================================
  // 7. ASSISTANCE REQUESTS, FROZEN COMMITTEE APPROVAL & TREASURER PAYOUT
  // ============================================================================
  router.get('/assistance', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const isPrivileged = auth.roles.some((r) =>
        ['admin', 'committee_member', 'treasurer', 'auditor'].includes(r)
      );

      const requests = await db
        .select()
        .from(assistanceRequests)
        .where(isPrivileged ? undefined : eq(assistanceRequests.requestedByUserId, auth.userAccountId))
        .orderBy(desc(assistanceRequests.createdAt))
        .limit(150);

      const reqIds = requests.map((r) => r.id);
      const rounds =
        reqIds.length > 0
          ? await db
              .select()
              .from(approvalRounds)
              .where(inArray(approvalRounds.assistanceRequestId, reqIds))
          : [];
      const roundIds = rounds.map((r) => r.id);

      const votes =
        roundIds.length > 0
          ? await db
              .select({
                id: assistanceApprovals.id,
                approvalRoundId: assistanceApprovals.approvalRoundId,
                committeeMemberId: assistanceApprovals.committeeMemberId,
                memberNameEn: members.fullNameEn,
                decision: assistanceApprovals.decision,
                comments: assistanceApprovals.comments,
                decidedAt: assistanceApprovals.decidedAt,
              })
              .from(assistanceApprovals)
              .innerJoin(members, eq(assistanceApprovals.committeeMemberId, members.id))
              .where(inArray(assistanceApprovals.approvalRoundId, roundIds))
          : [];

      const eligible =
        roundIds.length > 0
          ? await db
              .select()
              .from(approvalEligibleMembers)
              .where(inArray(approvalEligibleMembers.approvalRoundId, roundIds))
          : [];

      const attList =
        reqIds.length > 0
          ? await db
              .select({
                id: attachments.id,
                entityId: attachments.entityId,
                fileName: attachments.fileName,
                mimeType: attachments.mimeType,
                sizeBytes: attachments.sizeBytes,
              })
              .from(attachments)
              .where(
                and(eq(attachments.entityType, 'assistance_request'), inArray(attachments.entityId, reqIds))
              )
          : [];

      const roundByReq = new Map(rounds.map((r) => [r.assistanceRequestId, r]));
      const votesByRound = new Map<string, typeof votes>();
      for (const v of votes) {
        const list = votesByRound.get(v.approvalRoundId) || [];
        list.push(v);
        votesByRound.set(v.approvalRoundId, list);
      }
      const eligibleByRound = new Map<string, Set<string>>();
      for (const e of eligible) {
        const set = eligibleByRound.get(e.approvalRoundId) || new Set<string>();
        set.add(e.committeeMemberId);
        eligibleByRound.set(e.approvalRoundId, set);
      }
      const attMap = new Map<string, typeof attList>();
      for (const a of attList) {
        const list = attMap.get(a.entityId) || [];
        list.push(a);
        attMap.set(a.entityId, list);
      }

      const enriched = requests.map((reqRow) => {
        const round = roundByReq.get(reqRow.id);
        const roundVotes = round ? votesByRound.get(round.id) || [] : [];
        const eligibleSet = round ? eligibleByRound.get(round.id) : undefined;
        const approvalsCount = roundVotes.filter((v) => v.decision === 'approved').length;
        const rejectionsCount = roundVotes.filter((v) => v.decision === 'rejected').length;
        const myVote = auth.memberId
          ? roundVotes.find((v) => v.committeeMemberId === auth.memberId) || null
          : null;
        const isEligibleVoter = Boolean(
          auth.memberId && eligibleSet?.has(auth.memberId) && auth.roles.includes('committee_member')
        );

        return {
          ...reqRow,
          round: round
            ? {
                ...round,
                approvalsCount,
                rejectionsCount,
                votes: roundVotes,
                isEligibleVoter,
                hasVoted: Boolean(myVote),
                myVote,
              }
            : null,
          attachments: attMap.get(reqRow.id) || [],
        };
      });

      return res.json({ requests: enriched });
    } catch (error) {
      console.error('Fetch assistance requests failed:', error);
      return res.status(500).json({ error: 'Failed to load assistance requests.' });
    }
  });

  router.post('/assistance', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const auth = req.auth!;
      const body = req.body || {};
      const beneficiaryNameEn = String(body.beneficiaryNameEn || '').trim();
      const reason = String(body.reason || '').trim();
      const requestType = body.requestType === 'emergency' ? 'emergency' : 'normal';
      const currencyCode = isValidCurrency(body.currencyCode) ? body.currencyCode : 'INR';
      const amountNum = Number(body.requestedAmount);

      if (!beneficiaryNameEn || !reason || !Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({
          error: 'Beneficiary name, positive amount, and reason are required.',
        });
      }

      let attachmentData: ReturnType<typeof validateAttachmentPayload> = null;
      if (body.attachment) {
        attachmentData = validateAttachmentPayload(body.attachment);
      }

      const requestNumber = `REQ-${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

      const created = await db.transaction(async (tx) => {
        const committeeRole = await tx
          .select()
          .from(roles)
          .where(eq(roles.code, 'committee_member'))
          .limit(1);

        const eligibleRows = committeeRole.length
          ? await tx
              .select({ memberId: memberRoles.memberId })
              .from(memberRoles)
              .innerJoin(members, eq(memberRoles.memberId, members.id))
              .where(and(eq(memberRoles.roleId, committeeRole[0].id), eq(members.status, 'active')))
          : [];

        const initialStatus = eligibleRows.length > 0 ? 'pending_approval' : 'submitted';

        const [row] = await tx
          .insert(assistanceRequests)
          .values({
            requestNumber,
            requestedByUserId: auth.userAccountId,
            beneficiaryNameEn,
            beneficiaryNameTa: String(body.beneficiaryNameTa || '').trim() || null,
            familyNameEn: String(body.familyNameEn || '').trim() || null,
            familyNameTa: String(body.familyNameTa || '').trim() || null,
            streetEn: String(body.streetEn || '').trim() || null,
            streetTa: String(body.streetTa || '').trim() || null,
            requestedAmount: amountNum.toFixed(2),
            currencyCode,
            reason,
            requestType,
            status: initialStatus,
            createdBy: auth.userAccountId,
            updatedBy: auth.userAccountId,
          })
          .returning();

        if (eligibleRows.length > 0) {
          const requiredApprovals =
            requestType === 'emergency' ? 1 : Math.ceil(eligibleRows.length * 0.5);
          const [round] = await tx
            .insert(approvalRounds)
            .values({
              assistanceRequestId: row.id,
              eligibleCommitteeCount: eligibleRows.length,
              requiredApprovals,
              approvalType: requestType,
            })
            .returning();

          for (const e of eligibleRows) {
            await tx.insert(approvalEligibleMembers).values({
              approvalRoundId: round.id,
              committeeMemberId: e.memberId,
            });
          }
        }

        if (attachmentData) {
          await tx.insert(attachments).values({
            entityType: 'assistance_request',
            entityId: row.id,
            ...attachmentData,
            uploadedByUserId: auth.userAccountId,
          });
        }

        await recordAudit(tx, {
          actorUserId: auth.userAccountId,
          actorMemberId: auth.memberId,
          actorUsername: auth.username,
          actorRoleCodes: auth.roles,
          entityType: 'assistance_request',
          entityId: row.id,
          action: 'assistance_requested',
          newValues: {
            requestNumber,
            requestType,
            requestedAmount: row.requestedAmount,
            currencyCode,
            eligibleCommitteeCount: eligibleRows.length,
          },
        });

        return row;
      });

      return res.status(201).json({ request: created });
    } catch (error: any) {
      console.error('Create assistance request failed:', error);
      return res.status(400).json({ error: error.message || 'Failed to create assistance request.' });
    }
  });

  router.post(
    '/assistance/:id/vote',
    requireAuth,
    requireRole('committee_member'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        if (!auth.memberId) {
          return res.status(403).json({ error: 'Committee voter must be linked to a member record.' });
        }
        const requestId = String(req.params.id);
        const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
        const comments = String(req.body?.comments || '').trim() || null;

        const outcome = await db.transaction(async (tx) => {
          const [reqRow] = await tx
            .select()
            .from(assistanceRequests)
            .where(eq(assistanceRequests.id, requestId))
            .limit(1);
          if (!reqRow) {
            throw Object.assign(new Error('Assistance request not found.'), { statusCode: 404 });
          }
          if (reqRow.status !== 'pending_approval') {
            throw Object.assign(
              new Error(`Voting is closed; current status is ${reqRow.status}.`),
              { statusCode: 409 }
            );
          }

          const [round] = await tx
            .select()
            .from(approvalRounds)
            .where(eq(approvalRounds.assistanceRequestId, requestId))
            .limit(1);
          if (!round || round.closedAt) {
            throw Object.assign(new Error('Approval round is closed or unavailable.'), {
              statusCode: 409,
            });
          }

          const [eligible] = await tx
            .select()
            .from(approvalEligibleMembers)
            .where(
              and(
                eq(approvalEligibleMembers.approvalRoundId, round.id),
                eq(approvalEligibleMembers.committeeMemberId, auth.memberId!)
              )
            )
            .limit(1);
          if (!eligible) {
            throw Object.assign(
              new Error('You are not in the frozen eligible committee voter list for this round.'),
              { statusCode: 403 }
            );
          }

          try {
            await tx.insert(assistanceApprovals).values({
              approvalRoundId: round.id,
              committeeMemberId: auth.memberId!,
              decision,
              comments,
            });
          } catch (err: any) {
            if (String(err?.code) === '23505') {
              throw Object.assign(new Error('You have already voted on this request.'), {
                statusCode: 409,
              });
            }
            throw err;
          }

          const allVotes = await tx
            .select()
            .from(assistanceApprovals)
            .where(eq(assistanceApprovals.approvalRoundId, round.id));

          const approvedCount = allVotes.filter((v) => v.decision === 'approved').length;
          const rejectedCount = allVotes.filter((v) => v.decision === 'rejected').length;

          let nextStatus = 'pending_approval';
          if (approvedCount >= round.requiredApprovals) {
            nextStatus = 'approved';
          } else if (rejectedCount > round.eligibleCommitteeCount - round.requiredApprovals) {
            // Mathematically impossible to reach required approvals
            nextStatus = 'rejected';
          }

          if (nextStatus !== 'pending_approval') {
            await tx
              .update(approvalRounds)
              .set({ closedAt: new Date() })
              .where(eq(approvalRounds.id, round.id));
            await tx
              .update(assistanceRequests)
              .set({
                status: nextStatus,
                rejectionReason: nextStatus === 'rejected' ? comments || 'Rejected by committee threshold' : null,
                updatedAt: new Date(),
                updatedBy: auth.userAccountId,
              })
              .where(eq(assistanceRequests.id, requestId));
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'assistance_request',
            entityId: requestId,
            action: `assistance_vote_${decision}`,
            newValues: {
              decision,
              approvedCount,
              rejectedCount,
              requiredApprovals: round.requiredApprovals,
              resultingStatus: nextStatus,
            },
            reason: comments,
          });

          return {
            status: nextStatus,
            approvedCount,
            rejectedCount,
            requiredApprovals: round.requiredApprovals,
          };
        });

        return res.json(outcome);
      } catch (error: any) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Vote failed.' });
      }
    }
  );

  router.post(
    '/assistance/:id/payout',
    requireAuth,
    requireRole('treasurer', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const requestId = String(req.params.id);
        const body = req.body || {};
        const isTreasurer = auth.roles.includes('treasurer');
        const overrideReason = String(body.overrideReason || '').trim();
        if (!isTreasurer && auth.roles.includes('admin') && !overrideReason) {
          return res.status(400).json({
            error: 'Admin payout override requires an explicit reason.',
          });
        }

        const payoutAmountNum = Number(body.payoutAmount);
        const payoutCurrency = isValidCurrency(body.currencyCode) ? body.currencyCode : 'INR';
        const accountCode = String(body.accountCode || (payoutCurrency === 'AED' ? '1030' : '1010'));
        const payoutReference = String(body.payoutReference || '').trim();
        const payoutDate = String(body.payoutDate || new Date().toISOString().slice(0, 10));
        const idempotencyKey = String(body.idempotencyKey || `asst-payout-${requestId}`);

        if (!Number.isFinite(payoutAmountNum) || payoutAmountNum <= 0 || !payoutReference) {
          return res.status(400).json({
            error: 'Positive payout amount and bank/cash payout reference are required.',
          });
        }

        const result = await db.transaction(async (tx) => {
          const locked = await tx.execute(
            sql`SELECT * FROM assistance_requests WHERE id = ${requestId} FOR UPDATE`
          );
          const reqRow = locked.rows[0] as Record<string, any> | undefined;
          if (!reqRow) {
            throw Object.assign(new Error('Assistance request not found.'), { statusCode: 404 });
          }

          if (reqRow.status === 'paid' && reqRow.payout_transaction_id) {
            return {
              alreadyPaid: true,
              transactionId: reqRow.payout_transaction_id as string,
            };
          }

          if (reqRow.status !== 'approved') {
            throw Object.assign(
              new Error(`Payout blocked: request status is "${reqRow.status}", must be "approved".`),
              { statusCode: 409 }
            );
          }

          const balances = await getAccountBalances(tx);
          const sourceAcc = balances.find((a) => a.accountCode === accountCode);
          if (!sourceAcc || sourceAcc.accountType !== 'asset' || sourceAcc.currencyCode !== payoutCurrency) {
            throw Object.assign(new Error('Invalid asset payout account for selected currency.'), {
              statusCode: 400,
            });
          }

          const payoutMinor = toMinorUnits(payoutAmountNum);
          const availMinor = toMinorUnits(sourceAcc.balance);
          if (availMinor < payoutMinor) {
            throw Object.assign(
              new Error(
                `Insufficient balance in ${sourceAcc.accountName}. Available: ${payoutCurrency} ${sourceAcc.balance}.`
              ),
              { statusCode: 409 }
            );
          }

          const rate = payoutCurrency === 'INR' ? 1 : DEFAULT_AED_TO_INR_REPORTING_RATE;
          const functionalInrMinor = Math.round(payoutMinor * rate);
          const expenseCode = payoutCurrency === 'AED' ? '5020' : '5010';

          const posted = await postBalancedTransaction(tx, {
            transactionType: 'assistance_payout',
            transactionDate: payoutDate,
            referenceType: 'assistance_request',
            referenceId: requestId,
            description: `Assistance payout ${reqRow.request_number} to ${reqRow.beneficiary_name_en} · Ref ${payoutReference}`,
            idempotencyKey,
            postedByUserId: auth.userAccountId,
            lines: [
              {
                accountCode: expenseCode,
                side: 'debit',
                transactionAmountMinor: payoutMinor,
                functionalAmountInrMinor: functionalInrMinor,
                exchangeRateToInr: rate,
              },
              {
                accountCode,
                side: 'credit',
                transactionAmountMinor: payoutMinor,
                functionalAmountInrMinor: functionalInrMinor,
                exchangeRateToInr: rate,
              },
            ],
          });

          await tx
            .update(assistanceRequests)
            .set({
              status: 'paid',
              payoutAmount: payoutAmountNum.toFixed(2),
              payoutCurrencyCode: payoutCurrency,
              payoutAccountId: sourceAcc.accountId,
              payoutReference,
              payoutTransactionId: posted.transactionId,
              paidAt: new Date(),
              paidByUserId: auth.userAccountId,
              updatedAt: new Date(),
              updatedBy: auth.userAccountId,
            })
            .where(eq(assistanceRequests.id, requestId));

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'assistance_request',
            entityId: requestId,
            fundTransactionId: posted.transactionId,
            action: 'assistance_payout_executed',
            oldValues: { status: 'approved' },
            newValues: {
              status: 'paid',
              payoutAmount: payoutAmountNum.toFixed(2),
              payoutCurrency,
              payoutReference,
              transactionNumber: posted.transactionNumber,
            },
            reason: overrideReason || null,
          });

          return {
            alreadyPaid: false,
            transactionId: posted.transactionId,
            transactionNumber: posted.transactionNumber,
          };
        });

        return res.json(result);
      } catch (error: any) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Payout failed.' });
      }
    }
  );

  // ============================================================================
  // 8. TREASURY, LEDGER & UAE MONTHLY SETTLEMENTS
  // ============================================================================
  router.get(
    '/treasury/overview',
    requireAuth,
    requireRole('admin', 'committee_member', 'treasurer', 'auditor'),
    async (_req: AuthedRequest, res) => {
      try {
        const balances = await getAccountBalances(db);
        const recentTxns = await db
          .select()
          .from(fundTransactions)
          .orderBy(desc(fundTransactions.postedAt))
          .limit(60);

        const txnIds = recentTxns.map((t) => t.id);
        const entries =
          txnIds.length > 0
            ? await db
                .select({
                  id: ledgerEntries.id,
                  fundTransactionId: ledgerEntries.fundTransactionId,
                  accountCode: fundAccounts.accountCode,
                  accountName: fundAccounts.accountName,
                  side: ledgerEntries.side,
                  accountCurrencyCode: ledgerEntries.accountCurrencyCode,
                  transactionAmount: ledgerEntries.transactionAmount,
                  functionalAmountInr: ledgerEntries.functionalAmountInr,
                  exchangeRateToInr: ledgerEntries.exchangeRateToInr,
                })
                .from(ledgerEntries)
                .innerJoin(fundAccounts, eq(ledgerEntries.fundAccountId, fundAccounts.id))
                .where(inArray(ledgerEntries.fundTransactionId, txnIds))
            : [];

        const entryMap = new Map<string, typeof entries>();
        for (const e of entries) {
          const list = entryMap.get(e.fundTransactionId) || [];
          list.push(e);
          entryMap.set(e.fundTransactionId, list);
        }

        return res.json({
          accounts: balances,
          transactions: recentTxns.map((t) => ({
            ...t,
            entries: entryMap.get(t.id) || [],
          })),
        });
      } catch (error) {
        console.error('Treasury overview failed:', error);
        return res.status(500).json({ error: 'Failed to load treasury ledger.' });
      }
    }
  );

  router.post(
    '/treasury/transactions',
    requireAuth,
    requireRole('treasurer', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const body = req.body || {};
        const txnType = body.transactionType === 'inflow' ? 'inflow' : 'expense';
        const currencyCode = isValidCurrency(body.currencyCode) ? body.currencyCode : 'INR';
        const assetAccountCode = String(
          body.assetAccountCode || (currencyCode === 'AED' ? '1030' : '1010')
        );
        const amountNum = Number(body.amount);
        const transactionDate = String(body.transactionDate || new Date().toISOString().slice(0, 10));
        const description = String(body.description || '').trim();
        const idempotencyKey = String(body.idempotencyKey || `manual-${crypto.randomUUID()}`);

        if (!Number.isFinite(amountNum) || amountNum <= 0 || !description) {
          return res.status(400).json({ error: 'Positive amount and description are required.' });
        }

        const amountMinor = toMinorUnits(amountNum);
        const rate = currencyCode === 'INR' ? 1 : DEFAULT_AED_TO_INR_REPORTING_RATE;
        const functionalInrMinor = Math.round(amountMinor * rate);

        const result = await db.transaction(async (tx) => {
          const balances = await getAccountBalances(tx);
          const assetAcc = balances.find((a) => a.accountCode === assetAccountCode);
          if (!assetAcc || assetAcc.accountType !== 'asset' || assetAcc.currencyCode !== currencyCode) {
            throw Object.assign(new Error('Invalid asset account for currency.'), { statusCode: 400 });
          }

          if (txnType === 'expense' && toMinorUnits(assetAcc.balance) < amountMinor) {
            throw Object.assign(
              new Error(`Insufficient balance in ${assetAcc.accountName}.`),
              { statusCode: 409 }
            );
          }

          const counterAccountCode =
            txnType === 'inflow' ? (currencyCode === 'AED' ? '4020' : '4030') : '5040';

          const lines =
            txnType === 'inflow'
              ? [
                  {
                    accountCode: assetAccountCode,
                    side: 'debit' as const,
                    transactionAmountMinor: amountMinor,
                    functionalAmountInrMinor: functionalInrMinor,
                    exchangeRateToInr: rate,
                  },
                  {
                    accountCode: counterAccountCode,
                    side: 'credit' as const,
                    transactionAmountMinor: amountMinor,
                    functionalAmountInrMinor: functionalInrMinor,
                    exchangeRateToInr: rate,
                  },
                ]
              : [
                  {
                    accountCode: counterAccountCode,
                    side: 'debit' as const,
                    transactionAmountMinor: amountMinor,
                    functionalAmountInrMinor: functionalInrMinor,
                    exchangeRateToInr: rate,
                  },
                  {
                    accountCode: assetAccountCode,
                    side: 'credit' as const,
                    transactionAmountMinor: amountMinor,
                    functionalAmountInrMinor: functionalInrMinor,
                    exchangeRateToInr: rate,
                  },
                ];

          const posted = await postBalancedTransaction(tx, {
            transactionType: txnType,
            transactionDate,
            referenceType: 'treasury_manual',
            description,
            idempotencyKey,
            postedByUserId: auth.userAccountId,
            lines,
          });

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'fund_transaction',
            entityId: posted.transactionId,
            fundTransactionId: posted.transactionId,
            action: `treasury_${txnType}_posted`,
            newValues: {
              transactionNumber: posted.transactionNumber,
              amount: amountNum.toFixed(2),
              currencyCode,
              description,
            },
          });

          return posted;
        });

        return res.status(201).json(result);
      } catch (error: any) {
        return res
          .status(error.statusCode || 500)
          .json({ error: error.message || 'Failed to record treasury transaction.' });
      }
    }
  );

  router.post(
    '/treasury/transactions/:id/reverse',
    requireAuth,
    requireRole('treasurer', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const txnId = String(req.params.id);
        const reason = String(req.body?.reason || '').trim();
        if (!reason) {
          return res.status(400).json({ error: 'Reversal reason is required.' });
        }

        const result = await db.transaction(async (tx) => {
          const [orig] = await tx
            .select()
            .from(fundTransactions)
            .where(eq(fundTransactions.id, txnId))
            .limit(1);
          if (!orig) {
            throw Object.assign(new Error('Transaction not found.'), { statusCode: 404 });
          }
          if (orig.status === 'reversed') {
            throw Object.assign(new Error('Transaction is already reversed.'), { statusCode: 409 });
          }
          if (orig.transactionType === 'reversal') {
            throw Object.assign(new Error('Cannot reverse a reversal journal.'), { statusCode: 409 });
          }

          const origLines = await tx
            .select({
              accountCode: fundAccounts.accountCode,
              side: ledgerEntries.side,
              transactionAmount: ledgerEntries.transactionAmount,
              functionalAmountInr: ledgerEntries.functionalAmountInr,
              exchangeRateToInr: ledgerEntries.exchangeRateToInr,
            })
            .from(ledgerEntries)
            .innerJoin(fundAccounts, eq(ledgerEntries.fundAccountId, fundAccounts.id))
            .where(eq(ledgerEntries.fundTransactionId, txnId));

          const reversedLines = origLines.map((l) => ({
            accountCode: l.accountCode,
            side: (l.side === 'debit' ? 'credit' : 'debit') as 'debit' | 'credit',
            transactionAmountMinor: toMinorUnits(l.transactionAmount),
            functionalAmountInrMinor: toMinorUnits(l.functionalAmountInr),
            exchangeRateToInr: Number(l.exchangeRateToInr),
            description: `Reversal of ${orig.transactionNumber}: ${reason}`,
          }));

          const posted = await postBalancedTransaction(tx, {
            transactionType: 'reversal',
            transactionDate: new Date().toISOString().slice(0, 10),
            referenceType: 'reversal',
            referenceId: orig.id,
            description: `Reversal of ${orig.transactionNumber} · ${reason}`,
            idempotencyKey: `reverse-${orig.id}`,
            postedByUserId: auth.userAccountId,
            reversalOfTransactionId: orig.id,
            lines: reversedLines,
          });

          await tx
            .update(fundTransactions)
            .set({ status: 'reversed' })
            .where(eq(fundTransactions.id, orig.id));

          if (orig.referenceType === 'uae_settlement' && orig.referenceId) {
            await tx
              .update(monthlyUaeSettlements)
              .set({ status: 'reversed', updatedAt: new Date(), updatedBy: auth.userAccountId })
              .where(eq(monthlyUaeSettlements.id, orig.referenceId));
          }

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'fund_transaction',
            entityId: orig.id,
            fundTransactionId: posted.transactionId,
            action: 'transaction_reversed',
            oldValues: { status: 'posted', originalTransactionNumber: orig.transactionNumber },
            newValues: { status: 'reversed', reversalTransactionNumber: posted.transactionNumber },
            reason,
          });

          return posted;
        });

        return res.json(result);
      } catch (error: any) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Reversal failed.' });
      }
    }
  );

  router.get(
    '/treasury/settlements',
    requireAuth,
    requireRole('treasurer', 'admin', 'auditor'),
    async (req: AuthedRequest, res) => {
      try {
        const month = String(req.query.month || new Date().toISOString().slice(0, 7));
        const monthPrefix = `${month}%`;

        const confirmedAedRows = await db
          .select({
            id: paymentSubmissions.id,
            memberNumber: members.memberNumber,
            memberNameEn: members.fullNameEn,
            paymentDate: paymentSubmissions.paymentDate,
            amount: paymentSubmissions.amount,
            transactionReference: paymentSubmissions.transactionReference,
          })
          .from(paymentSubmissions)
          .innerJoin(members, eq(paymentSubmissions.memberId, members.id))
          .where(
            and(
              eq(paymentSubmissions.status, 'approved'),
              eq(paymentSubmissions.currencyCode, 'AED'),
              sql`${paymentSubmissions.paymentDate} LIKE ${monthPrefix}`
            )
          )
          .orderBy(paymentSubmissions.paymentDate);

        const totalAedMinor = confirmedAedRows.reduce(
          (acc, row) => acc + toMinorUnits(row.amount),
          0
        );

        const settlements = await db
          .select()
          .from(monthlyUaeSettlements)
          .orderBy(desc(monthlyUaeSettlements.settlementMonth))
          .limit(36);

        return res.json({
          month,
          totalAedCollected: fromMinorUnits(totalAedMinor),
          confirmedAedPayments: confirmedAedRows,
          settlements,
        });
      } catch (error) {
        console.error('Fetch settlements failed:', error);
        return res.status(500).json({ error: 'Failed to load UAE settlements.' });
      }
    }
  );

  router.post(
    '/treasury/settlements/confirm',
    requireAuth,
    requireRole('treasurer', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const auth = req.auth!;
        const body = req.body || {};
        const month = String(body.month || '');
        if (!/^\d{4}-\d{2}$/.test(month)) {
          return res.status(400).json({ error: 'Settlement month must be YYYY-MM.' });
        }
        const settlementMonthKey = `${month}-01`;
        const rate = Number(body.exchangeRateInrPerAed);
        const bankReference = String(body.bankReference || '').trim();
        const txCharge = Number(body.transactionCharge ?? 0);
        const txChargeCur = isValidCurrency(body.transactionChargeCurrency)
          ? body.transactionChargeCurrency
          : 'INR';
        const taxAmt = Number(body.taxAmount ?? 0);
        const taxCur = isValidCurrency(body.taxCurrency) ? body.taxCurrency : 'INR';
        const otherAmt = Number(body.otherCharges ?? 0);
        const otherCur = isValidCurrency(body.otherChargesCurrency)
          ? body.otherChargesCurrency
          : 'INR';
        const idempotencyKey = String(body.idempotencyKey || `uae-settle-${month}`);

        if (!Number.isFinite(rate) || rate <= 0 || !bankReference) {
          return res.status(400).json({
            error: 'Valid positive exchange rate and bank reference are required.',
          });
        }
        if (txCharge < 0 || taxAmt < 0 || otherAmt < 0) {
          return res.status(400).json({ error: 'Charges cannot be negative.' });
        }

        const result = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(monthlyUaeSettlements)
            .where(eq(monthlyUaeSettlements.settlementMonth, settlementMonthKey))
            .limit(1);

          if (existing && existing.status === 'confirmed') {
            throw Object.assign(
              new Error(`Settlement for ${month} is already confirmed (${existing.bankReference}).`),
              { statusCode: 409 }
            );
          }

          const monthPrefix = `${month}%`;
          const aedSumRow = await tx
            .select({ total: sql<string>`COALESCE(SUM(${paymentSubmissions.amount}), 0)` })
            .from(paymentSubmissions)
            .where(
              and(
                eq(paymentSubmissions.status, 'approved'),
                eq(paymentSubmissions.currencyCode, 'AED'),
                sql`${paymentSubmissions.paymentDate} LIKE ${monthPrefix}`
              )
            );

          const totalAedMinor = toMinorUnits(aedSumRow[0]?.total ?? 0);
          if (totalAedMinor <= 0) {
            throw Object.assign(
              new Error(`No confirmed AED collections found for ${month}.`),
              { statusCode: 400 }
            );
          }

          // Check UAE Collection AED account has enough balance
          const balances = await getAccountBalances(tx);
          const uaeAcc = balances.find((a) => a.accountCode === '1030');
          if (!uaeAcc || toMinorUnits(uaeAcc.balance) < totalAedMinor) {
            throw Object.assign(
              new Error(
                `UAE Collection AED balance (${uaeAcc?.balance ?? '0.00'}) is lower than settlement total (${fromMinorUnits(totalAedMinor)}).`
              ),
              { statusCode: 409 }
            );
          }

          const grossInrMinor = Math.round(totalAedMinor * rate);
          const toInrMinor = (amt: number, cur: 'INR' | 'AED') =>
            cur === 'INR' ? toMinorUnits(amt) : Math.round(toMinorUnits(amt) * rate);

          const chargesInrMinor =
            toInrMinor(txCharge, txChargeCur) +
            toInrMinor(taxAmt, taxCur) +
            toInrMinor(otherAmt, otherCur);

          const netInrMinor = grossInrMinor - chargesInrMinor;
          if (netInrMinor <= 0) {
            throw Object.assign(
              new Error('Total charges cannot equal or exceed gross INR settlement amount.'),
              { statusCode: 400 }
            );
          }

          const settlementId = existing?.id || crypto.randomUUID();

          const lines: Parameters<typeof postBalancedTransaction>[1]['lines'] = [
            {
              accountCode: '1010',
              side: 'debit',
              transactionAmountMinor: netInrMinor,
              functionalAmountInrMinor: netInrMinor,
              exchangeRateToInr: 1,
              description: `Net INR settled for ${month}`,
            },
            {
              accountCode: '1030',
              side: 'credit',
              transactionAmountMinor: totalAedMinor,
              functionalAmountInrMinor: grossInrMinor,
              exchangeRateToInr: rate,
              description: `AED settled for ${month} @ ${rate}`,
            },
          ];

          if (chargesInrMinor > 0) {
            lines.push({
              accountCode: '5030',
              side: 'debit',
              transactionAmountMinor: chargesInrMinor,
              functionalAmountInrMinor: chargesInrMinor,
              exchangeRateToInr: 1,
              description: `Remittance, tax & bank charges for ${month}`,
            });
          }

          const posted = await postBalancedTransaction(tx, {
            transactionType: 'uae_settlement',
            transactionDate: new Date().toISOString().slice(0, 10),
            referenceType: 'uae_settlement',
            referenceId: settlementId,
            description: `UAE Settlement ${month} · AED ${fromMinorUnits(totalAedMinor)} @ ${rate} · Ref ${bankReference}`,
            idempotencyKey: `${idempotencyKey}-${existing ? 're' : 'init'}`,
            postedByUserId: auth.userAccountId,
            lines,
          });

          const payloadValues = {
            id: settlementId,
            settlementMonth: settlementMonthKey,
            totalAedCollected: fromMinorUnits(totalAedMinor),
            exchangeRateInrPerAed: rate.toFixed(8),
            grossInrAmount: fromMinorUnits(grossInrMinor),
            transactionCharge: txCharge.toFixed(2),
            transactionChargeCurrency: txChargeCur,
            taxAmount: taxAmt.toFixed(2),
            taxCurrency: taxCur,
            otherCharges: otherAmt.toFixed(2),
            otherChargesCurrency: otherCur,
            totalChargesInr: fromMinorUnits(chargesInrMinor),
            netInrAmount: fromMinorUnits(netInrMinor),
            bankReference,
            status: 'confirmed',
            fundTransactionId: posted.transactionId,
            updatedAt: new Date(),
            updatedBy: auth.userAccountId,
          };

          const [saved] = existing
            ? await tx
                .update(monthlyUaeSettlements)
                .set(payloadValues)
                .where(eq(monthlyUaeSettlements.id, existing.id))
                .returning()
            : await tx
                .insert(monthlyUaeSettlements)
                .values({ ...payloadValues, createdBy: auth.userAccountId })
                .returning();

          await recordAudit(tx, {
            actorUserId: auth.userAccountId,
            actorMemberId: auth.memberId,
            actorUsername: auth.username,
            actorRoleCodes: auth.roles,
            entityType: 'uae_settlement',
            entityId: saved.id,
            fundTransactionId: posted.transactionId,
            action: 'uae_settlement_confirmed',
            newValues: {
              month,
              totalAedCollected: saved.totalAedCollected,
              exchangeRate: rate,
              netInrAmount: saved.netInrAmount,
              bankReference,
              transactionNumber: posted.transactionNumber,
            },
          });

          return { settlement: saved, transactionNumber: posted.transactionNumber };
        });

        return res.status(201).json(result);
      } catch (error: any) {
        return res
          .status(error.statusCode || 500)
          .json({ error: error.message || 'Settlement confirmation failed.' });
      }
    }
  );

  // ============================================================================
  // 9. AUDIT LOGS & PRIVACY-SAFE CSV EXPORT
  // ============================================================================
  router.get(
    '/audit',
    requireAuth,
    requireRole('auditor', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const userId = req.query.userId ? String(req.query.userId) : null;
        const roleCode = req.query.roleCode ? String(req.query.roleCode) : null;
        const action = req.query.action ? String(req.query.action) : null;
        const entityType = req.query.entityType ? String(req.query.entityType) : null;
        const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
        const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
        const mode = req.query.mode === 'distinct_transactions' ? 'distinct_transactions' : 'activities';
        const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
        const offset = Math.max(Number(req.query.offset || 0), 0);

        const conditions = [];
        if (userId) conditions.push(eq(auditLogs.actorUserId, userId));
        if (roleCode) {
          conditions.push(sql`${auditLogs.actorRoleCodes} @> ARRAY[${roleCode}]::text[]`);
        }
        if (action) conditions.push(eq(auditLogs.action, action));
        if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
        if (dateFrom) conditions.push(gte(auditLogs.performedAt, new Date(`${dateFrom}T00:00:00Z`)));
        if (dateTo) conditions.push(lte(auditLogs.performedAt, new Date(`${dateTo}T23:59:59Z`)));
        if (mode === 'distinct_transactions') {
          conditions.push(sql`${auditLogs.fundTransactionId} IS NOT NULL`);
        }

        if (mode === 'distinct_transactions') {
          // Deduplicate by fundTransactionId, selecting latest event per transaction (UC-11 / FR-AUD-005)
          const rawRows = await db
            .select()
            .from(auditLogs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(auditLogs.performedAt))
            .limit(200);

          const seen = new Set<string>();
          const distinct = [];
          for (const row of rawRows) {
            if (!row.fundTransactionId || seen.has(row.fundTransactionId)) continue;
            seen.add(row.fundTransactionId);
            distinct.push(row);
            if (distinct.length >= limit) break;
          }
          return res.json({ logs: distinct, mode });
        }

        const logs = await db
          .select()
          .from(auditLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(auditLogs.performedAt))
          .limit(limit)
          .offset(offset);

        const actors = await db
          .select({
            id: userAccounts.id,
            username: userAccounts.username,
            fullNameEn: members.fullNameEn,
          })
          .from(userAccounts)
          .leftJoin(members, eq(userAccounts.memberId, members.id))
          .orderBy(userAccounts.username);

        return res.json({ logs, actors, mode });
      } catch (error) {
        console.error('Fetch audit logs failed:', error);
        return res.status(500).json({ error: 'Failed to load audit logs.' });
      }
    }
  );

  router.get(
    '/audit/export',
    requireAuth,
    requireRole('auditor', 'admin'),
    async (req: AuthedRequest, res) => {
      try {
        const userId = req.query.userId ? String(req.query.userId) : null;
        const roleCode = req.query.roleCode ? String(req.query.roleCode) : null;
        const conditions = [];
        if (userId) conditions.push(eq(auditLogs.actorUserId, userId));
        if (roleCode) {
          conditions.push(sql`${auditLogs.actorRoleCodes} @> ARRAY[${roleCode}]::text[]`);
        }

        const logs = await db
          .select()
          .from(auditLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(auditLogs.performedAt))
          .limit(500);

        const header = [
          'Timestamp (UTC)',
          'Actor Username',
          'Role Snapshot',
          'Action',
          'Entity Type',
          'Entity ID',
          'Transaction ID',
          'Reason',
        ]
          .map(sanitizeCsvCell)
          .join(',');

        const lines = logs.map((l) =>
          [
            l.performedAt.toISOString(),
            l.actorUsername || 'system',
            l.actorRoleCodes.join('; '),
            l.action,
            l.entityType,
            l.entityId,
            l.fundTransactionId || '',
            l.reason || '',
          ]
            .map(sanitizeCsvCell)
            .join(',')
        );

        const csv = [header, ...lines].join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="village-fund-audit-report.csv"');
        return res.send(csv);
      } catch (error) {
        console.error('Audit CSV export failed:', error);
        return res.status(500).json({ error: 'Failed to export audit report.' });
      }
    }
  );

  return router;
}
