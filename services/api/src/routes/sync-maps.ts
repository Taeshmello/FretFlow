import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { syncMaps } from '../db/schema.ts';
import { HttpError, parseOr400, readJsonBody } from '../lib/errors.ts';
import { assertAudioOwner, assertScoreOwner } from '../lib/ownership.ts';
import { idSchema } from '../lib/score-snapshot.ts';

const idParams = z.object({ id: idSchema });
const params = z.object({ id: idSchema, audioId: idSchema });
const syncMapSchema = z.object({
  anchors: z
    .array(z.object({ tick: z.number().int().min(0), seconds: z.number().finite().min(0) }))
    .max(10_000),
  offset_ms: z.number().int().min(-60_000).max(60_000),
});

/** Sync maps, mounted under /api/scores: GET /:id/sync-maps and PUT /:id/sync-maps/:audioId. */
export function syncMapRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get('/:id/sync-maps', async c => {
      const { id } = parseOr400(idParams, c.req.param());
      await assertScoreOwner(db, c.get('user').id, id);
      const syncMapsOfScore = await db
        .select({
          audio_id: syncMaps.audioId,
          anchors: syncMaps.anchors,
          offset_ms: syncMaps.offsetMs,
          updated_at: syncMaps.updatedAt,
        })
        .from(syncMaps)
        .where(eq(syncMaps.scoreId, id));
      return c.json({ syncMaps: syncMapsOfScore });
    })
    .put('/:id/sync-maps/:audioId', async c => {
      const { id, audioId } = parseOr400(params, c.req.param());
      const userId = c.get('user').id;
      await assertScoreOwner(db, userId, id);
      await assertAudioOwner(db, userId, audioId);
      const input = parseOr400(syncMapSchema, await readJsonBody(c.req.raw));
      const [row] = await db
        .insert(syncMaps)
        .values({ scoreId: id, audioId, anchors: input.anchors, offsetMs: input.offset_ms })
        .onConflictDoUpdate({
          target: [syncMaps.scoreId, syncMaps.audioId],
          set: { anchors: input.anchors, offsetMs: input.offset_ms, updatedAt: sql`now()` },
        })
        .returning({ updated_at: syncMaps.updatedAt });
      if (!row) {
        throw new HttpError(500, 'internal', 'Internal server error');
      }
      return c.json(row);
    });
}
