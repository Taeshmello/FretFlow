import type { Score, Transaction } from '@fretflow/score-model';
import {
  AutoSaver,
  IndexedDbScoreStore,
  LocalMediaStore,
  openFretFlowDb,
  RemoteScoreStore,
  ScoreSync,
  type SaveStatus,
} from '@fretflow/storage';

/** Only the public API address lives in the client (BACKEND.md §3). Empty = local-only mode. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface Persistence {
  scores: IndexedDbScoreStore;
  media: LocalMediaStore;
  remote: RemoteScoreStore | null;
  sync: ScoreSync | null;
  saver: AutoSaver;
}

let instance: Promise<Persistence> | null = null;

export function persistence(onStatus: (status: SaveStatus, error: unknown) => void): Promise<Persistence> {
  instance ??= (async () => {
    const db = await openFretFlowDb();
    const scores = new IndexedDbScoreStore(db);
    const media = new LocalMediaStore(db);
    const remote = API_URL ? new RemoteScoreStore(API_URL) : null;
    const sync = remote ? new ScoreSync(scores, remote) : null;
    const saver = new AutoSaver((score: Score, txs: Transaction[]) => scores.saveWithLog(score, txs), onStatus);
    return { scores, media, remote, sync, saver };
  })();
  return instance;
}
