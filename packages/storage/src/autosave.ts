import type { Score, Transaction } from '@fretflow/score-model';

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * 1-second debounced save (SPEC §8). Collects the transactions since the last
 * save so the log is complete, and reports status for the "save failed" banner.
 */
export class AutoSaver {
  private timer: unknown = null;
  private latest: Score | null = null;
  private txs: Transaction[] = [];
  private running: Promise<void> = Promise.resolve();
  status: SaveStatus = 'idle';
  lastError: unknown = null;

  constructor(
    private readonly save: (score: Score, txs: Transaction[]) => Promise<void>,
    private readonly onStatus: (status: SaveStatus, error: unknown) => void = () => {},
    private readonly delayMs = 1000,
    private readonly timers: Timers = realTimers,
  ) {}

  schedule(score: Score, tx: Transaction | null): void {
    this.latest = score;
    if (tx) {
      this.txs.push(tx);
    }
    if (this.timer !== null) {
      this.timers.clear(this.timer);
    }
    this.setStatus('pending');
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Save now (e.g. on pagehide). Saves never overlap. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    this.running = this.running.then(async () => {
      const score = this.latest;
      if (!score) {
        return;
      }
      const txs = this.txs;
      this.latest = null;
      this.txs = [];
      this.setStatus('saving');
      try {
        await this.save(score, txs);
        this.setStatus(this.latest ? 'pending' : 'saved');
      } catch (err) {
        // Keep the unsaved state so the next flush retries it.
        this.latest ??= score;
        this.txs = [...txs, ...this.txs];
        this.lastError = err;
        this.setStatus('error', err);
      }
    });
    return this.running;
  }

  get hasPending(): boolean {
    return this.latest !== null;
  }

  private setStatus(status: SaveStatus, error: unknown = null): void {
    this.status = status;
    this.onStatus(status, error);
  }
}
