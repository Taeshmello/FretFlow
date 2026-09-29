import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { scores } from '../db/schema.ts';
import { badRequest, HttpError, notFound, parseOr400, readJsonBody } from '../lib/errors.ts';
import { assertScoreOwner, ownedScore } from '../lib/ownership.ts';
import { idSchema, parseSnapshot } from '../lib/score-snapshot.ts';

const bodySchema = z.object({ snapshot: z.unknown() });
const paramsSchema = z.object({ id: idSchema });

/** Accepts `3` or the ETag-style `"3"`. */
function parseIfMatch(header: string | undefined): number {
  const m = header?.trim().match(/^"?(\d{1,9})"?$/);
  if (!m) {
    throw badRequest('If-Match header with the current rev is required');
  }
  return Number(m[1]);
}

/**
 * Permanently deletes scores trashed more than `olderThanDays` ago (BACKEND.md §4:
 * 30 days). Sync maps go with them via ON DELETE CASCADE. Not scheduled yet:
 * call it from a daily job.
 */
export async function purgeTrash(db: Db, olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const purged = await db.delete(scores).where(lt(scores.deletedAt, cutoff)).returning({ id: scores.id });
  return purged.length;
}

export function scoreRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get('/', async c => {
      const rows = await db
        .select({ id: scores.id, title: scores.title, updated_at: scores.updatedAt, rev: scores.rev })
        .from(scores)
        .where(and(eq(scores.ownerId, c.get('user').id), isNull(scores.deletedAt)))
        .orderBy(desc(scores.updatedAt));
      return c.json({ scores: rows });
    })

    .post('/', async c => {
      const body = parseOr400(bodySchema, await readJsonBody(c.req.raw));
      const { score } = parseSnapshot(body.snapshot);
      const [row] = await db
        .insert(scores)
        .values({
          id: score.id,
          ownerId: c.get('user').id,
          title: score.meta.title,
          composerType: score.meta.composerType,
          snapshot: score,
          rev: 1,
        })
        .onConflictDoNothing({ target: scores.id })
        .returning({ id: scores.id, rev: scores.rev, updated_at: scores.updatedAt });
      if (!row) {
        throw new HttpError(409, 'conflict', 'A score with this id already exists');
      }
      return c.json(row, 201);
    })

    .get('/:id', async c => {
      const { id } = parseOr400(paramsSchema, c.req.param());
      const [row] = await db
        .select({ id: scores.id, snapshot: scores.snapshot, rev: scores.rev, updated_at: scores.updatedAt })
        .from(scores)
        .where(ownedScore(c.get('user').id, id))
        .limit(1);
      if (!row) {
        throw notFound();
      }
      return c.json(row);
    })

    .put('/:id', async c => {
      const { id } = parseOr400(paramsSchema, c.req.param());
      const ifMatch = parseIfMatch(c.req.header('If-Match'));
      const body = parseOr400(bodySchema, await readJsonBody(c.req.raw));
      const { score } = parseSnapshot(body.snapshot);
      if (score.id !== id) {
        throw badRequest('Snapshot id does not match the URL');
      }
      const userId = c.get('user').id;

      // Compare-and-swap on rev: the write only lands if nobody saved in between.
      const [row] = await db
        .update(scores)
        .set({
          snapshot: score,
          title: score.meta.title,
          composerType: score.meta.composerType,
          rev: sql`${scores.rev} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(ownedScore(userId, id), eq(scores.rev, ifMatch)))
        .returning({ rev: scores.rev, updated_at: scores.updatedAt });
      if (row) {
        return c.json(row);
      }
      const current = await assertScoreOwner(db, userId, id);
      throw new HttpError(409, 'rev_mismatch', 'Score was modified elsewhere', {
        rev: current.rev,
        updated_at: current.updatedAt,
      });
    })

    .delete('/:id', async c => {
      const { id } = parseOr400(paramsSchema, c.req.param());
      const [row] = await db
        .update(scores)
        .set({ deletedAt: sql`now()` })
        .where(ownedScore(c.get('user').id, id))
        .returning({ id: scores.id });
      if (!row) {
        throw notFound();
      }
      return c.body(null, 204);
    });
}
