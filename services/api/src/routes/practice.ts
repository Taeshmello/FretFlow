import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { scores } from '../db/schema.ts';
import { badRequest, HttpError, parseOr400, readJsonBody } from '../lib/errors.ts';
import { ownedScore } from '../lib/ownership.ts';
import { idSchema } from '../lib/score-snapshot.ts';
import { planOf } from './me.ts';

const params = z.object({ id: idSchema });
const section = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(60),
  startBar: z.number().int().min(1),
  endBar: z.number().int().min(1),
  targetReps: z.number().int().min(1).max(20),
  completedSessions: z.number().int().min(0),
  lastPracticedAt: z.number().int().min(0).nullable(),
}).strict();
const bodySchema = z.object({ sections: z.array(section).max(30) }).strict();

function revision(header: string | undefined): number {
  const match = header?.trim().match(/^(0|[1-9]\d{0,8})$/);
  if (!match) throw badRequest('If-Match with the practice revision is required');
  return Number(match[1]);
}

async function proScore(db: Db, userId: string, scoreId: string) {
  const [row] = await db.select({ snapshot: scores.snapshot, sections: scores.practiceSections, rev: scores.practiceRev })
    .from(scores).where(ownedScore(userId, scoreId)).limit(1);
  if (!row) throw new HttpError(404, 'not_found', 'Not found');
  if ((await planOf(db, userId)).plan !== 'pro') throw new HttpError(403, 'pro_required', 'FretFlow Pro is required');
  return row;
}

/** Private, revisioned practice state. No practice data enters shared Score JSON. */
export function practiceRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get('/:id/practice', async c => {
      const { id } = parseOr400(params, c.req.param());
      const row = await proScore(db, c.get('user').id, id);
      c.header('Cache-Control', 'no-store');
      return c.json({ sections: row.sections, rev: row.rev });
    })
    .put('/:id/practice', async c => {
      const { id } = parseOr400(params, c.req.param());
      const rev = revision(c.req.header('If-Match'));
      const { sections } = parseOr400(bodySchema, await readJsonBody(c.req.raw));
      const userId = c.get('user').id;
      const current = await proScore(db, userId, id);
      const bars = (current.snapshot as { masterBars: unknown[] }).masterBars.length;
      if (new Set(sections.map(s => s.id)).size !== sections.length || sections.some(s => s.startBar > s.endBar || s.endBar > bars)) {
        throw badRequest('Invalid practice sections');
      }
      const [updated] = await db.update(scores).set({ practiceSections: sections, practiceRev: sql`${scores.practiceRev} + 1` })
        .where(and(ownedScore(userId, id), eq(scores.practiceRev, rev)))
        .returning({ rev: scores.practiceRev });
      if (!updated) {
        const latest = await proScore(db, userId, id);
        throw new HttpError(409, 'rev_mismatch', 'Practice changed on another device', { rev: latest.rev });
      }
      return c.json({ rev: updated.rev });
    });
}
