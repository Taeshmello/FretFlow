import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { scores } from '../db/schema.ts';
import { notFound, parseOr400 } from '../lib/errors.ts';
import { ownedScore } from '../lib/ownership.ts';
import { idSchema } from '../lib/score-snapshot.ts';

const params = z.object({ id: idSchema });
const tokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Owner controls. POST rotates the link; DELETE revokes it. */
export function ownerShareRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get('/:id/share', async c => {
      const { id } = parseOr400(params, c.req.param());
      const [row] = await db.select({ shared: scores.shareTokenHash }).from(scores)
        .where(ownedScore(c.get('user').id, id)).limit(1);
      if (!row) throw notFound();
      return c.json({ shared: row.shared !== null });
    })
    .post('/:id/share', async c => {
      const { id } = parseOr400(params, c.req.param());
      const token = randomBytes(32).toString('base64url');
      const [row] = await db.update(scores).set({ shareTokenHash: tokenHash(token) })
        .where(ownedScore(c.get('user').id, id)).returning({ id: scores.id });
      if (!row) throw notFound();
      c.header('Cache-Control', 'no-store');
      return c.json({ token }, 201);
    })
    .delete('/:id/share', async c => {
      const { id } = parseOr400(params, c.req.param());
      const [row] = await db.update(scores).set({ shareTokenHash: null })
        .where(ownedScore(c.get('user').id, id)).returning({ id: scores.id });
      if (!row) throw notFound();
      return c.body(null, 204);
    });
}

/** Unlisted, read-only score. No owner identity, recording, or private practice data. */
export function publicShareRoutes(db: Db) {
  return new Hono().get('/:token', async c => {
    const { token } = parseOr400(tokenParams, c.req.param());
    const [row] = await db.select({ snapshot: scores.snapshot }).from(scores)
      .where(and(eq(scores.shareTokenHash, tokenHash(token)), isNull(scores.deletedAt))).limit(1);
    if (!row) throw notFound();
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    return c.json({ snapshot: row.snapshot });
  });
}
