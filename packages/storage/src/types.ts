import type { Id, Score, Transaction } from '@fretflow/score-model';

export interface ScoreSummary {
  id: Id;
  title: string;
  artist?: string;
  updatedAt: number;
  rev: number;
}

/** SPEC §8. Local (IndexedDB) and remote (API) stores share this shape. */
export interface ScoreStore {
  list(): Promise<ScoreSummary[]>;
  load(id: Id): Promise<{ score: Score; rev: number } | null>;
  /** Snapshot + append the transaction to the log. `tx` is null for a first save or import. */
  save(score: Score, tx: Transaction | null): Promise<void>;
  delete(id: Id): Promise<void>;
}

/** The server has a newer revision than the one this device based its edit on (HTTP 409). */
export class ConflictError extends Error {
  constructor(
    readonly latestRev: number,
    readonly updatedAt: string | null,
  ) {
    super('The score was changed on another device.');
  }
}

export class StorageError extends Error {}
