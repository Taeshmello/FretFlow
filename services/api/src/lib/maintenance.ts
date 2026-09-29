import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { purgeStalePending } from '../routes/audio.ts';
import { purgeTrash } from '../routes/scores.ts';
import type { ObjectStorage } from './storage.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Arbitrary constant key for pg_try_advisory_xact_lock, shared by every instance. */
const LOCK_KEY = 72_410_001;

export interface MaintenanceLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface MaintenanceResult {
  /** False when another instance held the lock, so this one did nothing. */
  ran: boolean;
  trash: number;
  stalePending: number;
}

function lockedRow(result: unknown): boolean {
  // postgres-js returns an array of rows, PGlite returns { rows }.
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  const row = rows[0] as { locked?: unknown } | undefined;
  return row?.locked === true;
}

/**
 * Daily cleanup (BACKEND.md §4): trash older than 30 days, uploads never
 * completed within a day. A transaction advisory lock keeps two instances
 * from doing it at the same time.
 */
export async function runMaintenance(deps: { db: Db; storage: ObjectStorage; logger: MaintenanceLogger; now?: () => number }): Promise<MaintenanceResult> {
  const now = deps.now ?? Date.now;
  return deps.db.transaction(async tx => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    if (!lockedRow(lock)) {
      return { ran: false, trash: 0, stalePending: 0 };
    }
    const trash = await purgeTrash(tx);
    const stalePending = await purgeStalePending(tx, deps.storage, new Date(now() - DAY_MS));
    deps.logger.info({ trash, stalePending }, 'maintenance done');
    return { ran: true, trash, stalePending };
  });
}

/** Runs `run` after `firstDelayMs`, then every `intervalMs`. Failures are logged and never stop the schedule. */
export function startMaintenance(
  run: () => Promise<MaintenanceResult>,
  opts: { firstDelayMs?: number; intervalMs?: number; logger: MaintenanceLogger },
): () => void {
  const interval = opts.intervalMs ?? DAY_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = async () => {
    try {
      await run();
    } catch (err) {
      opts.logger.error({ err }, 'maintenance failed');
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), interval);
      timer.unref?.();
    }
  };

  timer = setTimeout(() => void tick(), opts.firstDelayMs ?? 60_000);
  timer.unref?.();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
