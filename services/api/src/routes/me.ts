import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { entitlements } from '../db/schema.ts';

export type Plan = 'free' | 'pro';

/** The user's plan right now: an entitlement without expiry or expiring later (D-010). */
export async function planOf(db: Db, userId: string, now = new Date()): Promise<{ plan: Plan; expiresAt: string | null }> {
  const [row] = await db
    .select({ plan: entitlements.plan, expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now))))
    .limit(1);
  return row ? { plan: row.plan, expiresAt: row.expiresAt?.toISOString() ?? null } : { plan: 'free', expiresAt: null };
}

export function meRoutes(db: Db) {
  return new Hono<AppEnv>().get('/', async c => {
    const { id, email, name } = c.get('user');
    const { plan, expiresAt } = await planOf(db, id);
    return c.json({ id, email, name, plan, planExpiresAt: expiresAt });
  });
}
