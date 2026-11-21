import crypto from 'crypto';
import { auditLogs } from '../db/schema.ts';
import type { db as DbType } from '../db/index.ts';

type DbExecutor = typeof DbType | Parameters<Parameters<typeof DbType.transaction>[0]>[0];

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'resetToken',
  'resetTokenHash',
  'reset_token_hash',
  'token',
  'publicTrackingToken',
  'publicTrackingTokenHash',
  'fileDataBase64',
]);

function redactObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface AuditInput {
  actorUserId?: string | null;
  actorMemberId?: string | null;
  actorUsername?: string | null;
  actorRoleCodes: string[];
  entityType: string;
  entityId: string;
  fundTransactionId?: string | null;
  action: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
  correlationId?: string;
}

export async function recordAudit(executor: DbExecutor, input: AuditInput): Promise<void> {
  await executor.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    actorMemberId: input.actorMemberId ?? null,
    actorUsername: input.actorUsername ?? null,
    actorRoleCodes: input.actorRoleCodes.length > 0 ? input.actorRoleCodes : ['public'],
    entityType: input.entityType,
    entityId: input.entityId,
    fundTransactionId: input.fundTransactionId ?? null,
    action: input.action,
    oldValues: redactObject(input.oldValues),
    newValues: redactObject(input.newValues),
    reason: input.reason ?? null,
    correlationId: input.correlationId ?? crypto.randomUUID(),
  });
}
