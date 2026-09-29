import type { Id, Score } from '@fretflow/score-model';
import type { IndexedDbScoreStore } from './indexedDb';
import type { RemoteScoreStore } from './remote';
import { ConflictError } from './types';

export interface SyncConflict {
  scoreId: Id;
  title: string;
  latestRev: number;
  updatedAt: string | null;
}

export interface SyncResult {
  uploaded: Id[];
  conflicts: SyncConflict[];
  failed: { scoreId: Id; error: unknown }[];
}

/**
 * Offline-first sync: IndexedDB is always written first; dirty scores are
 * pushed when online. A 409 is surfaced to the user, never merged (SPEC §8).
 */
export class ScoreSync {
  constructor(
    private readonly local: IndexedDbScoreStore,
    private readonly remote: RemoteScoreStore,
  ) {}

  async pushDirty(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: [], conflicts: [], failed: [] };
    for (const stored of await this.local.dirtyScores()) {
      try {
        const rev = await this.remote.push(stored.snapshot, stored.remoteRev);
        await this.local.markSynced(stored.id, stored.rev, rev);
        result.uploaded.push(stored.id);
      } catch (error) {
        if (error instanceof ConflictError) {
          result.conflicts.push({ scoreId: stored.id, title: stored.snapshot.meta.title, latestRev: error.latestRev, updatedAt: error.updatedAt });
        } else {
          result.failed.push({ scoreId: stored.id, error });
        }
      }
    }
    return result;
  }

  /** Conflict choice (1): overwrite the server with this device's version. */
  async overwriteServer(scoreId: Id, latestRev: number): Promise<void> {
    const stored = await this.local.record(scoreId);
    if (!stored) {
      return;
    }
    const rev = await this.remote.push(stored.snapshot, latestRev);
    await this.local.markSynced(scoreId, stored.rev, rev);
  }

  /** Conflict choice (2): take the server version. */
  async takeServer(scoreId: Id): Promise<Score | null> {
    const loaded = await this.remote.load(scoreId);
    if (!loaded) {
      return null;
    }
    await this.local.replaceFromRemote(loaded.score, loaded.rev);
    return loaded.score;
  }

  /** Brings server-only scores down so the list is complete on a new device. */
  async pullMissing(): Promise<Id[]> {
    const pulled: Id[] = [];
    const localIds = new Set((await this.local.list()).map(s => s.id));
    for (const s of await this.remote.list()) {
      if (!localIds.has(s.id)) {
        const loaded = await this.remote.load(s.id);
        if (loaded) {
          await this.local.replaceFromRemote(loaded.score, loaded.rev);
          pulled.push(s.id);
        }
      }
    }
    return pulled;
  }
}
