import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client.ts';
import { audioAssets, scores as scoresTable } from '../src/db/schema.ts';
import { runMaintenance, startMaintenance } from '../src/lib/maintenance.ts';
import { buildTestApp, createFakeStorage, createTestDb, json, resetDb, sampleScore } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});
afterEach(() => {
  vi.useRealTimers();
});

const silent = { info: () => {}, error: () => {} };

describe('runMaintenance', () => {
  it('purges 30-day-old trash and day-old unfinished uploads in one pass', async () => {
    const t = buildTestApp(db);
    const ana = await t.signIn('ana@example.com');
    const old = sampleScore({ title: 'Old' });
    await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: old }) });
    await db.update(scoresTable).set({ deletedAt: new Date(Date.now() - 31 * DAY) }).where(eq(scoresTable.id, old.id));
    const up = await t.request('/api/audio/upload-url', {
      method: 'POST',
      cookie: ana,
      body: json({ sha256: 'a'.repeat(64), size: 10, mime: 'audio/wav' }),
    });
    const { id } = (await up.json()) as { id: string };
    await db.update(audioAssets).set({ createdAt: new Date(Date.now() - 2 * DAY) }).where(eq(audioAssets.id, id));

    const result = await runMaintenance({ db, storage: createFakeStorage(), logger: silent });

    expect(result).toEqual({ ran: true, trash: 1, stalePending: 1 });
    expect(await db.query.scores.findMany()).toEqual([]);
    expect(await db.query.audioAssets.findMany()).toEqual([]);
  });

  it('reports nothing to do on a clean database', async () => {
    expect(await runMaintenance({ db, storage: createFakeStorage(), logger: silent })).toEqual({ ran: true, trash: 0, stalePending: 0 });
  });
});

describe('startMaintenance', () => {
  it('runs shortly after start and then once a day until stopped', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({ ran: true, trash: 0, stalePending: 0 }));
    const stop = startMaintenance(run, { firstDelayMs: 60_000, intervalMs: DAY, logger: silent });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DAY);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(3 * DAY);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps the schedule going when a run fails', async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const run = vi.fn(async () => {
      throw new Error('db down');
    });
    const stop = startMaintenance(run, { firstDelayMs: 10, intervalMs: 100, logger: { info: () => {}, error: e => errors.push(e) } });
    await vi.advanceTimersByTimeAsync(210);
    expect(run).toHaveBeenCalledTimes(3);
    expect(errors).toHaveLength(3);
    stop();
  });
});
