import type { NextFunction, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { memberRoles, members, roles, userAccounts } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { recordAudit } from './audit.ts';
import { verifySessionToken } from './crypto.ts';
import { ensureReferenceData, INITIAL_OWNER_EMAIL } from './seed.ts';

export type RoleCode = 'admin' | 'committee_member' | 'treasurer' | 'member' | 'auditor';

export interface AuthContext {
  userAccountId: string;
  memberId: string | null;
  username: string;
  email: string | null;
  fullNameEn: string;
  fullNameTa: string | null;
  avatarUrl: string | null;
  preferredLanguage: 'en' | 'ta';
  roles: RoleCode[];
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

async function loadRolesForMember(memberId: string | null): Promise<RoleCode[]> {
  if (!memberId) return [];
  const rows = await db
    .select({ code: roles.code })
    .from(memberRoles)
    .innerJoin(roles, eq(memberRoles.roleId, roles.id))
    .where(eq(memberRoles.memberId, memberId));
  return rows.map((r) => r.code as RoleCode);
}

async function provisionInitialOwner(uid: string, email: string, displayName?: string): Promise<string> {
  return await db.transaction(async (tx) => {
    const existingByUid = await tx
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.authUserId, uid))
      .limit(1);
    if (existingByUid.length > 0) {
      return existingByUid[0].id;
    }

    const [createdMember] = await tx
      .insert(members)
      .values({
        memberNumber: 'M-0001',
        fullNameEn: displayName || 'Village Fund Administrator',
        fullNameTa: 'கிராம நல நிதி நிர்வாகி',
        email: email.toLowerCase(),
        contributionFrequency: 'monthly',
        expectedContributionAmount: '500.00',
        expectedContributionCurrency: 'INR',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: members.memberNumber,
        set: { email: email.toLowerCase(), updatedAt: new Date() },
      })
      .returning();

    const [createdAccount] = await tx
      .insert(userAccounts)
      .values({
        memberId: createdMember.id,
        authUserId: uid,
        username: 'admin',
        recoveryEmail: email.toLowerCase(),
        status: 'active',
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userAccounts.username,
        set: {
          authUserId: uid,
          memberId: createdMember.id,
          recoveryEmail: email.toLowerCase(),
          lastLoginAt: new Date(),
        },
      })
      .returning();

    const allRoles = await tx.select().from(roles);
    for (const r of allRoles) {
      await tx
        .insert(memberRoles)
        .values({
          memberId: createdMember.id,
          roleId: r.id,
          assignedBy: createdAccount.id,
        })
        .onConflictDoNothing();
    }

    await recordAudit(tx, {
      actorUserId: createdAccount.id,
      actorMemberId: createdMember.id,
      actorUsername: createdAccount.username,
      actorRoleCodes: allRoles.map((r) => r.code),
      entityType: 'user_account',
      entityId: createdAccount.id,
      action: 'owner_bootstrap_provisioned',
      newValues: { username: 'admin', memberNumber: 'M-0001' },
    });

    return createdAccount.id;
  });
}

export async function resolveAuthFromToken(token: string): Promise<AuthContext | { error: string; status: number }> {
  await ensureReferenceData();

  // 1. Check custom signed username/password token
  if (token.startsWith('vwcf.')) {
    const payload = verifySessionToken(token);
    if (!payload) {
      return { error: 'Unauthorized: Invalid or expired session token.', status: 401 };
    }
    const [account] = await db
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.id, payload.userId))
      .limit(1);
    if (!account) {
      return { error: 'Unauthorized: Account not found.', status: 401 };
    }
    if (account.status !== 'active') {
      return { error: 'Access denied: Account is disabled.', status: 403 };
    }
    const member = account.memberId
      ? (await db.select().from(members).where(eq(members.id, account.memberId)).limit(1))[0]
      : undefined;
    const assignedRoles = await loadRolesForMember(account.memberId);
    return {
      userAccountId: account.id,
      memberId: account.memberId,
      username: account.username,
      email: account.recoveryEmail || member?.email || null,
      fullNameEn: member?.fullNameEn || account.username,
      fullNameTa: member?.fullNameTa || null,
      avatarUrl: account.avatarDataUrl || null,
      preferredLanguage: account.preferredLanguage === 'ta' ? 'ta' : 'en',
      roles: assignedRoles,
    };
  }

  // 2. Verify Firebase ID Token (Google Sign-In)
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { error: 'Unauthorized: Invalid authentication token.', status: 401 };
  }

  let [account] = await db
    .select()
    .from(userAccounts)
    .where(eq(userAccounts.authUserId, decoded.uid))
    .limit(1);

  if (!account && decoded.email) {
    const normalizedEmail = decoded.email.toLowerCase();
    const [matchedByRecovery] = await db
      .select()
      .from(userAccounts)
      .where(sql`LOWER(${userAccounts.recoveryEmail}) = ${normalizedEmail}`)
      .limit(1);

    if (matchedByRecovery) {
      const [updated] = await db
        .update(userAccounts)
        .set({ authUserId: decoded.uid, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(userAccounts.id, matchedByRecovery.id))
        .returning();
      account = updated;
    } else if (normalizedEmail === INITIAL_OWNER_EMAIL.toLowerCase()) {
      const newId = await provisionInitialOwner(decoded.uid, normalizedEmail, decoded.name);
      const [ownerAccount] = await db
        .select()
        .from(userAccounts)
        .where(eq(userAccounts.id, newId))
        .limit(1);
      account = ownerAccount;
    }
  }

  if (!account) {
    return {
      error:
        'Account not provisioned. Public registration is disabled; contact your Village Fund Administrator.',
      status: 403,
    };
  }

  if (account.status !== 'active') {
    return { error: 'Access denied: Account is disabled.', status: 403 };
  }

  const member = account.memberId
    ? (await db.select().from(members).where(eq(members.id, account.memberId)).limit(1))[0]
    : undefined;
  const assignedRoles = await loadRolesForMember(account.memberId);

  return {
    userAccountId: account.id,
    memberId: account.memberId,
    username: account.username,
    email: account.recoveryEmail || member?.email || decoded.email || null,
    fullNameEn: member?.fullNameEn || decoded.name || account.username,
    fullNameTa: member?.fullNameTa || null,
    avatarUrl: account.avatarDataUrl || null,
    preferredLanguage: account.preferredLanguage === 'ta' ? 'ta' : 'en',
    roles: assignedRoles,
  };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing bearer token.' });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const result = await resolveAuthFromToken(token);
    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }
    req.auth = result;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

export function requireRole(...allowedRoles: RoleCode[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const hasRole = req.auth.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role privileges.' });
    }
    next();
  };
}
