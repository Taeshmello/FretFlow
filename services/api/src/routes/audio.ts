import { newId } from '@fretflow/score-model';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { enforceLimit, type AppEnv } from '../auth/require-user.ts';
import type { Db } from '../db/client.ts';
import { audioAssets, syncMaps } from '../db/schema.ts';
import { badRequest, HttpError, notFound, parseOr400, readJsonBody } from '../lib/errors.ts';
import { assertAudioOwner, assertScoreOwner, ownedAudio } from '../lib/ownership.ts';
import { idSchema } from '../lib/score-snapshot.ts';
import type { RateLimiter } from '../lib/rate-limit.ts';
import { audioStorageKey, type ObjectStorage } from '../lib/storage.ts';

/** BACKEND.md §5: 100MB upload limit. SPEC §7: 15 minutes of audio. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 15 * 60 * 1000;

const uploadUrlSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().min(1).max(MAX_AUDIO_BYTES),
  mime: z.string().regex(/^audio\/[a-z0-9.+-]{1,50}$/),
});

const completeSchema = z.object({ duration_ms: z.number().int().min(1).max(MAX_AUDIO_DURATION_MS) });

const syncMapSchema = z.object({
  anchors: z
    .array(z.object({ tick: z.number().int().min(0), seconds: z.number().finite().min(0) }))
    .max(10_000),
  offset_ms: z.number().int().min(-60_000).max(60_000),
});

const idParams = z.object({ id: idSchema });

export interface AudioLimits {
  /** Total bytes of a user's pending + ready audio. */
  quotaBytes: number;
  /** Unfinished uploads a user may have at once. */
  maxPending: number;
}

export const DEFAULT_AUDIO_LIMITS: AudioLimits = { quotaBytes: 2 * 1024 * 1024 * 1024, maxPending: 20 };

const quotaExceeded = (message: string) => new HttpError(413, 'quota_exceeded', message);

/**
 * Deletes pending uploads created before `olderThan`, object first, then row.
 * Not scheduled yet: call it from a periodic job (e.g. daily, olderThan = now - 24h).
 */
export async function purgeStalePending(db: Db, storage: ObjectStorage, olderThan: Date): Promise<number> {
  const stale = await db
    .select({ id: audioAssets.id, storageKey: audioAssets.storageKey })
    .from(audioAssets)
    .where(and(eq(audioAssets.status, 'pending'), lt(audioAssets.createdAt, olderThan)));
  for (const asset of stale) {
    await storage.deleteObject(asset.storageKey);
    await db.delete(audioAssets).where(and(eq(audioAssets.id, asset.id), eq(audioAssets.status, 'pending')));
  }
  return stale.length;
}

export function audioRoutes(db: Db, storage: ObjectStorage, uploadLimiter: RateLimiter, limits: AudioLimits) {
  return new Hono<AppEnv>()
    .post('/upload-url', async c => {
      const ownerId = c.get('user').id;
      enforceLimit(c, uploadLimiter, `upload:${ownerId}`);
      const input = parseOr400(uploadUrlSchema, await readJsonBody(c.req.raw));
      const storageKey = audioStorageKey(ownerId, input.sha256);

      // Quota over everything else the user stores; the same file asked for again is not counted twice.
      // Checked without a lock, so concurrent requests can overshoot by a request or two.
      const [usage] = await db
        .select({
          bytes: sql<string>`coalesce(sum(${audioAssets.sizeBytes}), 0)`,
          pending: sql<number>`count(*) filter (where ${audioAssets.status} = 'pending')::int`,
        })
        .from(audioAssets)
        .where(and(eq(audioAssets.ownerId, ownerId), ne(audioAssets.sha256, input.sha256)));
      const alreadyReady = await db
        .select({ id: audioAssets.id })
        .from(audioAssets)
        .where(and(eq(audioAssets.ownerId, ownerId), eq(audioAssets.sha256, input.sha256), eq(audioAssets.status, 'ready')))
        .limit(1);
      if (alreadyReady.length === 0) {
        if (Number(usage?.bytes ?? 0) + input.size > limits.quotaBytes) {
          throw quotaExceeded('Audio storage quota exceeded');
        }
        if ((usage?.pending ?? 0) >= limits.maxPending) {
          throw quotaExceeded('Too many unfinished uploads');
        }
      }

      // unique(owner_id, sha256): a second upload of the same file reuses the row.
      await db
        .insert(audioAssets)
        .values({ id: newId(), ownerId, storageKey, sha256: input.sha256, sizeBytes: input.size, mime: input.mime, status: 'pending' })
        .onConflictDoNothing({ target: [audioAssets.ownerId, audioAssets.sha256] });
      const [asset] = await db
        .select()
        .from(audioAssets)
        .where(and(eq(audioAssets.ownerId, ownerId), eq(audioAssets.sha256, input.sha256)))
        .limit(1);
      if (!asset) {
        throw new Error('audio asset row missing after upsert');
      }
      if (asset.status === 'ready') {
        return c.json({ id: asset.id, existing: true });
      }
      if (asset.sizeBytes !== input.size || asset.mime !== input.mime) {
        await db.update(audioAssets).set({ sizeBytes: input.size, mime: input.mime }).where(eq(audioAssets.id, asset.id));
      }
      const upload = await storage.presignUpload(storageKey, {
        contentType: input.mime,
        size: input.size,
        sha256: input.sha256,
      });
      // A pending row from an earlier, unfinished attempt gets a fresh URL; the client uploads again.
      return c.json({ id: asset.id, existing: false, uploadUrl: upload.url, uploadHeaders: upload.headers });
    })

    .post('/:id/complete', async c => {
      const { id } = parseOr400(idParams, c.req.param());
      const userId = c.get('user').id;
      const asset = await assertAudioOwner(db, userId, id);
      const input = parseOr400(completeSchema, await readJsonBody(c.req.raw));
      const size = await storage.sizeOf(asset.storageKey);
      if (size === null || size !== asset.sizeBytes) {
        throw badRequest('Uploaded object is missing or has the wrong size');
      }
      await db
        .update(audioAssets)
        .set({ status: 'ready', durationMs: input.duration_ms })
        .where(ownedAudio(userId, id));
      return c.json({ id, status: 'ready' as const });
    })

    .get('/:id/url', async c => {
      const { id } = parseOr400(idParams, c.req.param());
      const asset = await assertAudioOwner(db, c.get('user').id, id);
      if (asset.status !== 'ready') {
        throw notFound();
      }
      const url = await storage.presignDownload(asset.storageKey, { contentType: asset.mime });
      return c.json({ url });
    })

    .delete('/:id', async c => {
      const { id } = parseOr400(idParams, c.req.param());
      const userId = c.get('user').id;
      const asset = await assertAudioOwner(db, userId, id);
      // Object first: if storage fails the row stays and the delete can be retried.
      await storage.deleteObject(asset.storageKey);
      // Sync maps that reference this audio go with it (ON DELETE CASCADE).
      await db.delete(audioAssets).where(ownedAudio(userId, id));
      return c.body(null, 204);
    });
}

/** Sync maps, mounted under /api/scores: GET /:id/sync-maps and PUT /:id/sync-maps/:audioId. */
export function syncMapRoutes(db: Db) {
  const params = z.object({ id: idSchema, audioId: idSchema });
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
