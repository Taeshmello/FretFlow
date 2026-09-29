import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { audioAssets, scores } from '../db/schema.ts';
import { notFound } from './errors.ts';

// Every ownership check goes through here (BACKEND.md §6.2). Queries always
// filter on owner_id = current user, so another user's row is indistinguishable
// from a missing one and both become 404.

/** SQL condition: live (not trashed) score owned by userId. */
export function ownedScore(userId: string, scoreId: string) {
  return and(eq(scores.id, scoreId), eq(scores.ownerId, userId), isNull(scores.deletedAt));
}

/** SQL condition: audio asset owned by userId. */
export function ownedAudio(userId: string, audioId: string) {
  return and(eq(audioAssets.id, audioId), eq(audioAssets.ownerId, userId));
}

export async function assertScoreOwner(db: Db, userId: string, scoreId: string) {
  const [row] = await db
    .select({ id: scores.id, rev: scores.rev, updatedAt: scores.updatedAt })
    .from(scores)
    .where(ownedScore(userId, scoreId))
    .limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}

export async function assertAudioOwner(db: Db, userId: string, audioId: string) {
  const [row] = await db.select().from(audioAssets).where(ownedAudio(userId, audioId)).limit(1);
  if (!row) {
    throw notFound();
  }
  return row;
}
