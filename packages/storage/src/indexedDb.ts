import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { migrateScore, type Id, type Score, type Transaction } from '@fretflow/score-model';
import type { ScoreStore, ScoreSummary } from './types';

export const TXLOG_LIMIT = 200;
const DB_VERSION = 1;

export interface StoredScore {
  id: Id;
  snapshot: Score;
  rev: number;
  updatedAt: number;
  /** Revision the server last acknowledged; null = never uploaded. */
  syncedRev: number | null;
  /** Server-side rev this local copy was based on (sent as If-Match). */
  remoteRev: number | null;
  dirty: boolean;
}

export interface StoredAudio {
  /** sha256 hex of the file bytes. */
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  durationMs: number;
  remoteId?: string;
}

export interface LocalSyncMap {
  key: string; // `${scoreId}:${audioId}`
  scoreId: Id;
  audioId: string;
  anchors: { tick: number; seconds: number }[];
  offsetMs: number;
  updatedAt: number;
}

interface FretFlowDB extends DBSchema {
  scores: { key: Id; value: StoredScore; indexes: { byUpdated: number } };
  txlog: { key: [Id, number]; value: { scoreId: Id; seq: number; tx: Transaction } };
  audio: { key: string; value: StoredAudio };
  peaks: { key: string; value: { id: string; levels: unknown } };
  syncMaps: { key: string; value: LocalSyncMap; indexes: { byScore: Id } };
  prefs: { key: string; value: { key: string; value: unknown } };
}

export type FretFlowDatabase = IDBPDatabase<FretFlowDB>;

export function openFretFlowDb(name = 'fretflow'): Promise<FretFlowDatabase> {
  return openDB<FretFlowDB>(name, DB_VERSION, {
    upgrade(db) {
      const scores = db.createObjectStore('scores', { keyPath: 'id' });
      scores.createIndex('byUpdated', 'updatedAt');
      db.createObjectStore('txlog', { keyPath: ['scoreId', 'seq'] });
      db.createObjectStore('audio', { keyPath: 'id' });
      db.createObjectStore('peaks', { keyPath: 'id' });
      const maps = db.createObjectStore('syncMaps', { keyPath: 'key' });
      maps.createIndex('byScore', 'scoreId');
      db.createObjectStore('prefs', { keyPath: 'key' });
    },
  });
}

function summary(s: StoredScore): ScoreSummary {
  return {
    id: s.id,
    title: s.snapshot.meta.title,
    ...(s.snapshot.meta.artist ? { artist: s.snapshot.meta.artist } : {}),
    updatedAt: s.updatedAt,
    rev: s.rev,
  };
}

export class IndexedDbScoreStore implements ScoreStore {
  constructor(
    private readonly db: FretFlowDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<ScoreSummary[]> {
    const all = await this.db.getAllFromIndex('scores', 'byUpdated');
    return all.reverse().map(summary);
  }

  async load(id: Id): Promise<{ score: Score; rev: number } | null> {
    const stored = await this.db.get('scores', id);
    return stored ? { score: migrateScore(stored.snapshot), rev: stored.rev } : null;
  }

  async record(id: Id): Promise<StoredScore | undefined> {
    return this.db.get('scores', id);
  }

  async save(score: Score, tx: Transaction | null): Promise<void> {
    await this.saveWithLog(score, tx ? [tx] : []);
  }

  /** One snapshot write plus every transaction since the last save, in one IndexedDB transaction. */
  async saveWithLog(score: Score, txs: readonly Transaction[]): Promise<void> {
    const t = this.db.transaction(['scores', 'txlog'], 'readwrite');
    const scores = t.objectStore('scores');
    const prev = await scores.get(score.id);
    const rev = (prev?.rev ?? 0) + 1;
    await scores.put({
      id: score.id,
      snapshot: score,
      rev,
      updatedAt: this.now(),
      syncedRev: prev?.syncedRev ?? null,
      remoteRev: prev?.remoteRev ?? null,
      dirty: true,
    });
    if (txs.length) {
      const log = t.objectStore('txlog');
      // Log sequence numbers continue from the newest entry, independent of the snapshot rev.
      const newest = await log.openCursor(IDBKeyRange.bound([score.id, 0], [score.id, Number.MAX_SAFE_INTEGER]), 'prev');
      let seq = newest ? (newest.value.seq as number) : 0;
      for (const tx of txs) {
        await log.put({ scoreId: score.id, seq: ++seq, tx });
      }
      // Keep only the newest TXLOG_LIMIT entries per score.
      if (seq > TXLOG_LIMIT) {
        await log.delete(IDBKeyRange.bound([score.id, 0], [score.id, seq - TXLOG_LIMIT]));
      }
    }
    await t.done;
  }

  /** After a successful upload: remember the server rev and clear the dirty flag if nothing changed meanwhile. */
  async markSynced(id: Id, localRev: number, remoteRev: number): Promise<void> {
    const t = this.db.transaction('scores', 'readwrite');
    const stored = await t.store.get(id);
    if (stored) {
      await t.store.put({ ...stored, syncedRev: localRev, remoteRev, dirty: stored.rev !== localRev });
    }
    await t.done;
  }

  /** Replace the local copy with the server version (409 → "load server version"). */
  async replaceFromRemote(score: Score, remoteRev: number): Promise<void> {
    const prev = await this.db.get('scores', score.id);
    const rev = (prev?.rev ?? 0) + 1;
    await this.db.put('scores', { id: score.id, snapshot: score, rev, updatedAt: this.now(), syncedRev: rev, remoteRev, dirty: false });
  }

  async dirtyScores(): Promise<StoredScore[]> {
    return (await this.db.getAll('scores')).filter(s => s.dirty);
  }

  async txlog(id: Id): Promise<Transaction[]> {
    const rows = await this.db.getAll('txlog', IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    return rows.map(r => r.tx);
  }

  async delete(id: Id): Promise<void> {
    const t = this.db.transaction(['scores', 'txlog', 'syncMaps'], 'readwrite');
    await t.objectStore('scores').delete(id);
    await t.objectStore('txlog').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    const maps = await t.objectStore('syncMaps').index('byScore').getAllKeys(id);
    await Promise.all(maps.map(k => t.objectStore('syncMaps').delete(k)));
    await t.done;
  }
}

/** Audio blobs, waveform peaks and beat maps. Kept apart from scores (D-009: never inside the Score). */
export class LocalMediaStore {
  constructor(private readonly db: FretFlowDatabase) {}

  putAudio(audio: StoredAudio): Promise<string> {
    return this.db.put('audio', audio);
  }
  getAudio(id: string): Promise<StoredAudio | undefined> {
    return this.db.get('audio', id);
  }
  async putPeaks(id: string, levels: unknown): Promise<void> {
    await this.db.put('peaks', { id, levels });
  }
  async getPeaks(id: string): Promise<unknown> {
    return (await this.db.get('peaks', id))?.levels;
  }
  async putSyncMap(map: Omit<LocalSyncMap, 'key'>): Promise<void> {
    await this.db.put('syncMaps', { ...map, key: `${map.scoreId}:${map.audioId}` });
  }
  syncMapsFor(scoreId: Id): Promise<LocalSyncMap[]> {
    return this.db.getAllFromIndex('syncMaps', 'byScore', scoreId);
  }
  async getPref<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('prefs', key))?.value as T | undefined;
  }
  async setPref(key: string, value: unknown): Promise<void> {
    await this.db.put('prefs', { key, value });
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
