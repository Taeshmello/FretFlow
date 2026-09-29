import { newId } from '@fretflow/score-model';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client.ts';
import { audioAssets } from '../src/db/schema.ts';
import { createMemoryRateLimiter } from '../src/lib/rate-limit.ts';
import { purgeStalePending } from '../src/routes/audio.ts';
import { buildTestApp, createTestDb, json, resetDb, sampleScore } from './helpers.ts';

let db: Db;
let t: ReturnType<typeof buildTestApp>;
let ana: string;
let ben: string;

const SHA = 'a'.repeat(64);
const upload = { sha256: SHA, size: 1234, mime: 'audio/mpeg' };

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  t = buildTestApp(db);
  ana = await t.signIn('ana@example.com');
  ben = await t.signIn('ben@example.com');
});

function requestUpload(cookie: string | undefined, body: unknown = upload) {
  return t.request('/api/audio/upload-url', { method: 'POST', cookie, body: json(body) });
}

/** Runs the whole upload flow and returns the asset id. */
async function uploadReady(cookie: string, sha = SHA): Promise<string> {
  const res = await requestUpload(cookie, { ...upload, sha256: sha });
  const { id } = (await res.json()) as { id: string };
  const asset = (await db.query.audioAssets.findFirst({ where: (a, { eq }) => eq(a.id, id) }))!;
  t.storage.objects.set(asset.storageKey, upload.size);
  const done = await t.request(`/api/audio/${id}/complete`, { method: 'POST', cookie, body: json({ duration_ms: 60_000 }) });
  expect(done.status).toBe(200);
  return id;
}

describe('POST /api/audio/upload-url', () => {
  it('rejects a request without a session with 401', async () => {
    expect((await requestUpload(undefined)).status).toBe(401);
  });

  it('issues a 10-minute signed upload URL keyed by owner and sha256', async () => {
    const res = await requestUpload(ana);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; existing: boolean; uploadUrl: string };
    expect(body).toEqual({
      id: expect.any(String),
      existing: false,
      uploadUrl: expect.any(String),
      uploadHeaders: { 'content-type': 'audio/mpeg', 'x-amz-checksum-sha256': Buffer.from(SHA, 'hex').toString('base64') },
    });
    const asset = await db.query.audioAssets.findFirst();
    expect(asset?.storageKey).toMatch(new RegExp(`^audio/[^/]+/${SHA}$`));
    expect(body.uploadUrl).toContain(asset!.storageKey);
  });

  it('returns the existing asset instead of a new upload when the same file was uploaded before', async () => {
    const id = await uploadReady(ana);
    const res = await requestUpload(ana);
    expect(await res.json()).toEqual({ id, existing: true });
    expect(await db.query.audioAssets.findMany()).toHaveLength(1);
  });

  it('keeps separate assets for the same file uploaded by two users', async () => {
    const a = (await (await requestUpload(ana)).json()) as { id: string };
    const b = (await (await requestUpload(ben)).json()) as { id: string };
    expect(a.id).not.toBe(b.id);
  });

  it('rejects files over 100MB, bad hashes and non-audio types with 400', async () => {
    for (const bad of [
      { ...upload, size: 100 * 1024 * 1024 + 1 },
      { ...upload, sha256: 'xyz' },
      { ...upload, mime: 'video/mp4' },
      { sha256: SHA },
    ]) {
      expect((await requestUpload(ana, bad)).status).toBe(400);
    }
  });
});

describe('audio quota', () => {
  const sha = (c: string) => c.repeat(64);

  it('rejects an upload that would push the owner past the storage quota with 413 quota_exceeded', async () => {
    const app = buildTestApp(db, { audioLimits: { quotaBytes: 3000 } });
    const cookie = await app.signIn('ana@example.com');
    const ask = (s: string) => app.request('/api/audio/upload-url', { method: 'POST', cookie, body: json({ ...upload, sha256: s }) });
    expect((await ask(sha('1'))).status).toBe(200);
    expect((await ask(sha('2'))).status).toBe(200);
    const over = await ask(sha('3'));
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ error: { code: 'quota_exceeded', message: expect.any(String) } });
    // Asking again for a file that is already counted does not count it twice.
    expect((await ask(sha('2'))).status).toBe(200);
    // Another user has their own quota.
    const ben2 = await app.signIn('ben@example.com');
    const theirs = await app.request('/api/audio/upload-url', { method: 'POST', cookie: ben2, body: json({ ...upload, sha256: sha('3') }) });
    expect(theirs.status).toBe(200);
  });

  it('caps unfinished uploads per user', async () => {
    const app = buildTestApp(db, { audioLimits: { maxPending: 2 } });
    const cookie = await app.signIn('ana@example.com');
    const ask = (s: string) => app.request('/api/audio/upload-url', { method: 'POST', cookie, body: json({ ...upload, sha256: s }) });
    expect((await ask(sha('1'))).status).toBe(200);
    expect((await ask(sha('2'))).status).toBe(200);
    const third = await ask(sha('3'));
    expect(third.status).toBe(413);
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe('quota_exceeded');
    expect((await ask(sha('1'))).status).toBe(200);
  });

  it('rate limits upload-url requests separately from the general per-user budget', async () => {
    const app = buildTestApp(db, { rateLimits: { audioUpload: createMemoryRateLimiter({ max: 2, windowMs: 60_000 }) } });
    const cookie = await app.signIn('ana@example.com');
    const ask = () => app.request('/api/audio/upload-url', { method: 'POST', cookie, body: json(upload) });
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
    expect((await app.request('/api/me', { cookie })).status).toBe(200);
  });
});

describe('purgeStalePending', () => {
  it('deletes pending uploads older than the cutoff and their stored objects, keeping fresh and ready ones', async () => {
    const stale = (await (await requestUpload(ana, { ...upload, sha256: 'e'.repeat(64) })).json()) as { id: string };
    const fresh = (await (await requestUpload(ana, { ...upload, sha256: 'f'.repeat(64) })).json()) as { id: string };
    const ready = await uploadReady(ana, '9'.repeat(64));
    const dayAndHourAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const id of [stale.id, ready]) {
      await db.update(audioAssets).set({ createdAt: dayAndHourAgo }).where(eq(audioAssets.id, id));
    }
    const staleKey = (await db.query.audioAssets.findFirst({ where: (a, { eq: e }) => e(a.id, stale.id) }))!.storageKey;

    const purged = await purgeStalePending(db, t.storage, new Date(Date.now() - 24 * 60 * 60 * 1000));

    expect(purged).toBe(1);
    const left = (await db.query.audioAssets.findMany()).map(a => a.id).sort();
    expect(left).toEqual([fresh.id, ready].sort());
    expect(t.storage.deleted).toEqual([staleKey]);
  });
});

describe('POST /api/audio/:id/complete', () => {
  it('rejects a request without a session with 401', async () => {
    const { id } = (await (await requestUpload(ana)).json()) as { id: string };
    const res = await t.request(`/api/audio/${id}/complete`, { method: 'POST', body: json({ duration_ms: 1000 }) });
    expect(res.status).toBe(401);
  });

  it('marks the asset ready and records its duration', async () => {
    const id = await uploadReady(ana);
    const asset = await db.query.audioAssets.findFirst();
    expect(asset).toMatchObject({ id, status: 'ready', durationMs: 60_000 });
  });

  it('answers 404 for another user’s asset', async () => {
    const { id } = (await (await requestUpload(ana)).json()) as { id: string };
    const res = await t.request(`/api/audio/${id}/complete`, { method: 'POST', cookie: ben, body: json({ duration_ms: 1000 }) });
    expect(res.status).toBe(404);
  });

  it('rejects a bad duration or a missing uploaded object with 400', async () => {
    const { id } = (await (await requestUpload(ana)).json()) as { id: string };
    const complete = (body: unknown) =>
      t.request(`/api/audio/${id}/complete`, { method: 'POST', cookie: ana, body: json(body) });
    expect((await complete({ duration_ms: -1 })).status).toBe(400);
    expect((await complete({ duration_ms: 16 * 60 * 1000 })).status).toBe(400);
    expect((await complete({ durationMs: 1000 })).status).toBe(400); // wrong field name
    expect((await complete({ duration_ms: 1000 })).status).toBe(400); // nothing uploaded yet
    expect((await db.query.audioAssets.findFirst())?.status).toBe('pending');
  });
});

describe('GET /api/audio/:id/url', () => {
  it('rejects a request without a session with 401', async () => {
    const id = await uploadReady(ana);
    expect((await t.request(`/api/audio/${id}/url`)).status).toBe(401);
  });

  it('issues a 10-minute signed download URL for a ready asset', async () => {
    const id = await uploadReady(ana);
    const res = await t.request(`/api/audio/${id}/url`, { cookie: ana });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: expect.stringContaining('download/audio/') });
    expect(t.storage.downloads).toEqual([{ key: expect.stringMatching(/^audio\//), contentType: 'audio/mpeg' }]);
  });

  it('answers 404 for another user’s asset and for an unfinished upload', async () => {
    const id = await uploadReady(ana);
    expect((await t.request(`/api/audio/${id}/url`, { cookie: ben })).status).toBe(404);
    const pending = (await (await requestUpload(ana, { ...upload, sha256: 'b'.repeat(64) })).json()) as { id: string };
    expect((await t.request(`/api/audio/${pending.id}/url`, { cookie: ana })).status).toBe(404);
  });

  it('rejects an id that is not a ULID with 400', async () => {
    expect((await t.request('/api/audio/nope/url', { cookie: ana })).status).toBe(400);
  });
});

describe('PUT /api/scores/:id/sync-maps/:audioId', () => {
  const syncMap = { anchors: [{ tick: 0, seconds: 0.5 }, { tick: 3840, seconds: 2.5 }], offset_ms: 12 };

  async function setup(cookie: string) {
    const score = sampleScore();
    await t.request('/api/scores', { method: 'POST', cookie, body: json({ snapshot: score }) });
    const audioId = await uploadReady(cookie, 'c'.repeat(64));
    return { scoreId: score.id, audioId };
  }

  function putMap(cookie: string | undefined, scoreId: string, audioId: string, body: unknown = syncMap) {
    return t.request(`/api/scores/${scoreId}/sync-maps/${audioId}`, { method: 'PUT', cookie, body: json(body) });
  }

  it('rejects a request without a session with 401', async () => {
    const { scoreId, audioId } = await setup(ana);
    expect((await putMap(undefined, scoreId, audioId)).status).toBe(401);
  });

  it('stores the beat map and overwrites it on the next save', async () => {
    const { scoreId, audioId } = await setup(ana);
    const first = await putMap(ana, scoreId, audioId);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ updated_at: expect.any(String) });
    const res = await putMap(ana, scoreId, audioId, { anchors: [{ tick: 0, seconds: 1 }], offset_ms: -5 });
    expect(res.status).toBe(200);
    const rows = await db.query.syncMaps.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ scoreId, audioId, anchors: [{ tick: 0, seconds: 1 }], offsetMs: -5 });
  });

  it('answers 404 when the score or the audio belongs to another user', async () => {
    const mine = await setup(ana);
    const theirs = await setup(ben);
    expect((await putMap(ben, mine.scoreId, theirs.audioId)).status).toBe(404);
    expect((await putMap(ben, theirs.scoreId, mine.audioId)).status).toBe(404);
    expect((await putMap(ana, mine.scoreId, newId())).status).toBe(404);
    expect(await db.query.syncMaps.findMany()).toHaveLength(0);
  });

  it('rejects non-integer ticks, negative seconds or a missing offset with 400', async () => {
    const { scoreId, audioId } = await setup(ana);
    for (const bad of [
      { anchors: [{ tick: 0.5, seconds: 0 }], offset_ms: 0 },
      { anchors: [{ tick: 0, seconds: -1 }], offset_ms: 0 },
      { anchors: [], offsetMs: 0 },
    ]) {
      expect((await putMap(ana, scoreId, audioId, bad)).status).toBe(400);
    }
  });
});

describe('GET /api/scores/:id/sync-maps', () => {
  const anchors = [{ tick: 0, seconds: 0.25 }];

  async function setup(cookie: string) {
    const score = sampleScore();
    await t.request('/api/scores', { method: 'POST', cookie, body: json({ snapshot: score }) });
    const audioId = await uploadReady(cookie, 'd'.repeat(64));
    await t.request(`/api/scores/${score.id}/sync-maps/${audioId}`, {
      method: 'PUT',
      cookie,
      body: json({ anchors, offset_ms: 7 }),
    });
    return { scoreId: score.id, audioId };
  }

  it('rejects a request without a session with 401', async () => {
    const { scoreId } = await setup(ana);
    expect((await t.request(`/api/scores/${scoreId}/sync-maps`)).status).toBe(401);
  });

  it('lists the beat maps saved for the score', async () => {
    const { scoreId, audioId } = await setup(ana);
    const res = await t.request(`/api/scores/${scoreId}/sync-maps`, { cookie: ana });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncMaps: [{ audio_id: audioId, anchors, offset_ms: 7, updated_at: expect.any(String) }],
    });
  });

  it('answers 404 for another user’s score', async () => {
    const { scoreId } = await setup(ana);
    expect((await t.request(`/api/scores/${scoreId}/sync-maps`, { cookie: ben })).status).toBe(404);
  });

  it('rejects a score id that is not a ULID with 400', async () => {
    expect((await t.request('/api/scores/nope/sync-maps', { cookie: ana })).status).toBe(400);
  });
});

describe('DELETE /api/audio/:id', () => {
  async function withSyncMap(cookie: string) {
    const score = sampleScore();
    await t.request('/api/scores', { method: 'POST', cookie, body: json({ snapshot: score }) });
    const audioId = await uploadReady(cookie, '7'.repeat(64));
    await t.request(`/api/scores/${score.id}/sync-maps/${audioId}`, {
      method: 'PUT',
      cookie,
      body: json({ anchors: [{ tick: 0, seconds: 0 }], offset_ms: 0 }),
    });
    return { scoreId: score.id, audioId };
  }

  it('rejects a request without a session with 401', async () => {
    const id = await uploadReady(ana);
    expect((await t.request(`/api/audio/${id}`, { method: 'DELETE' })).status).toBe(401);
  });

  it('deletes the stored object, the row and its sync maps', async () => {
    const { audioId } = await withSyncMap(ana);
    const key = (await db.query.audioAssets.findFirst({ where: (a, { eq: e }) => e(a.id, audioId) }))!.storageKey;
    const res = await t.request(`/api/audio/${audioId}`, { method: 'DELETE', cookie: ana });
    expect(res.status).toBe(204);
    expect(t.storage.deleted).toEqual([key]);
    expect(await db.query.audioAssets.findMany()).toHaveLength(0);
    expect(await db.query.syncMaps.findMany()).toHaveLength(0);
  });

  it('answers 404 for another user’s asset and leaves it in place', async () => {
    const { audioId } = await withSyncMap(ana);
    expect((await t.request(`/api/audio/${audioId}`, { method: 'DELETE', cookie: ben })).status).toBe(404);
    expect(t.storage.deleted).toEqual([]);
    expect(await db.query.audioAssets.findMany()).toHaveLength(1);
    expect(await db.query.syncMaps.findMany()).toHaveLength(1);
  });

  it('rejects an id that is not a ULID with 400', async () => {
    expect((await t.request('/api/audio/nope', { method: 'DELETE', cookie: ana })).status).toBe(400);
  });
});
