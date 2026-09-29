import { newId } from '@fretflow/score-model';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client.ts';
import { scores as scoresTable } from '../src/db/schema.ts';
import { purgeTrash } from '../src/routes/scores.ts';
import { buildTestApp, createTestDb, json, resetDb, sampleScore } from './helpers.ts';

let db: Db;
let t: ReturnType<typeof buildTestApp>;
let ana: string;
let ben: string;

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  t = buildTestApp(db);
  ana = await t.signIn('ana@example.com');
  ben = await t.signIn('ben@example.com');
});

async function createAs(cookie: string, score = sampleScore()) {
  const res = await t.request('/api/scores', { method: 'POST', cookie, body: json({ snapshot: score }) });
  expect(res.status).toBe(201);
  return score;
}

function put(cookie: string, id: string, snapshot: unknown, rev: number | string | undefined) {
  const headers: Record<string, string> = {};
  if (rev !== undefined) headers['if-match'] = String(rev);
  return t.request(`/api/scores/${id}`, { method: 'PUT', cookie, headers, body: json({ snapshot }) });
}

describe('GET /api/scores', () => {
  it('rejects a request without a session with 401', async () => {
    expect((await t.request('/api/scores')).status).toBe(401);
  });

  it('lists only the caller’s live scores, newest first', async () => {
    const first = await createAs(ana, sampleScore({ title: 'First' }));
    const second = await createAs(ana, sampleScore({ title: 'Second' }));
    await createAs(ben, sampleScore({ title: 'Ben’s' }));
    await put(ana, first.id, { ...first, meta: { ...first.meta, title: 'First v2' } }, 1);

    const res = await t.request('/api/scores', { cookie: ana });
    expect(res.status).toBe(200);
    const { scores } = (await res.json()) as { scores: { id: string; title: string; rev: number; updated_at: string }[] };
    expect(scores.map(s => s.title)).toEqual(['First v2', 'Second']);
    expect(scores[0]).toEqual({ id: first.id, title: 'First v2', rev: 2, updated_at: expect.any(String) });
    expect(Number.isNaN(Date.parse(scores[0].updated_at))).toBe(false);
    expect(scores.some(s => s.id === second.id)).toBe(true);
  });

  it('hides trashed scores from the list', async () => {
    const score = await createAs(ana);
    await t.request(`/api/scores/${score.id}`, { method: 'DELETE', cookie: ana });
    const { scores } = (await (await t.request('/api/scores', { cookie: ana })).json()) as { scores: unknown[] };
    expect(scores).toEqual([]);
  });
});

describe('POST /api/scores', () => {
  it('rejects a request without a session with 401', async () => {
    const res = await t.request('/api/scores', { method: 'POST', body: json({ snapshot: sampleScore() }) });
    expect(res.status).toBe(401);
  });

  it('stores a valid snapshot at rev 1', async () => {
    const score = sampleScore();
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: score }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: score.id, rev: 1, updated_at: expect.any(String) });
  });

  it('rejects a snapshot that fails validateScore with 400', async () => {
    const score = sampleScore();
    score.tracks[0].bars.pop(); // bar count no longer matches masterBars
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: score }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: 'Score failed validation: barCount' } });
  });

  it('rejects a malformed body with 400', async () => {
    for (const body of ['not json', json({}), json({ snapshot: { schemaVersion: 1, id: 'x' } }), json({ snapshot: 42 })]) {
      const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a 200k-deep nested array with 400 instead of crashing', async () => {
    const depth = 200_000;
    const body = `{"snapshot":${'['.repeat(depth)}${']'.repeat(depth)}}`;
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: expect.any(String) } });
  });

  it('rejects deep nesting hidden inside note effects with 400', async () => {
    const score = sampleScore();
    const depth = 200_000;
    const deep = `${'['.repeat(depth)}${']'.repeat(depth)}`;
    const beat = score.tracks[0].bars[0].beats[0];
    beat.rest = false;
    beat.notes = [{ id: 'N1', pitch: 64, string: 1, fret: 0, fingeringLocked: true, effects: {}, source: 'user' }];
    const body = json({ snapshot: score }).replace('"effects":{}', `"effects":{"x":${deep}}`);
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body });
    expect(res.status).toBe(400);
  });

  it('rejects a NUL character anywhere in the snapshot with 400', async () => {
    const inTitle = sampleScore({ title: 'bad\u0000title' });
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: inTitle }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: expect.any(String) } });

    const inEffectKey = sampleScore();
    const beat = inEffectKey.tracks[0].bars[0].beats[0];
    beat.rest = false;
    beat.notes = [{ id: 'N1', pitch: 64, string: 1, fret: 0, fingeringLocked: true, effects: { 'k\u0000': 1 }, source: 'user' }];
    const res2 = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: inEffectKey }) });
    expect(res2.status).toBe(400);
  });

  it('rejects a duplicate id with 409, even when another user owns it', async () => {
    const score = await createAs(ana);
    const again = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: score }) });
    expect(again.status).toBe(409);
    // No rev in the body: the client treats a POST conflict as "exists elsewhere" (rev 0).
    expect(await again.json()).toEqual({ error: { code: 'conflict', message: expect.any(String) } });
    const other = await t.request('/api/scores', { method: 'POST', cookie: ben, body: json({ snapshot: score }) });
    expect(other.status).toBe(409);
  });

  it('rejects a snapshot over 5MB with 413', async () => {
    const score = sampleScore({ title: 'Big' });
    score.tracks[0].bars[0].beats[0].text = 'x'.repeat(5 * 1024 * 1024);
    const res = await t.request('/api/scores', { method: 'POST', cookie: ana, body: json({ snapshot: score }) });
    expect(res.status).toBe(413);
  });
});

describe('GET /api/scores/:id', () => {
  it('rejects a request without a session with 401', async () => {
    const score = await createAs(ana);
    expect((await t.request(`/api/scores/${score.id}`)).status).toBe(401);
  });

  it('returns snapshot and rev to the owner', async () => {
    const score = await createAs(ana);
    const res = await t.request(`/api/scores/${score.id}`, { cookie: ana });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: score.id, snapshot: score, rev: 1, updated_at: expect.any(String) });
  });

  it('answers 404 for another user’s score, same as a missing one', async () => {
    const score = await createAs(ana);
    const theirs = await t.request(`/api/scores/${score.id}`, { cookie: ben });
    const missing = await t.request(`/api/scores/${newId()}`, { cookie: ben });
    expect(theirs.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await theirs.json()).toEqual(await missing.json());
  });

  it('rejects an id that is not a ULID with 400', async () => {
    expect((await t.request('/api/scores/not-a-ulid', { cookie: ana })).status).toBe(400);
  });

  it('answers 404 for a trashed score', async () => {
    const score = await createAs(ana);
    await t.request(`/api/scores/${score.id}`, { method: 'DELETE', cookie: ana });
    expect((await t.request(`/api/scores/${score.id}`, { cookie: ana })).status).toBe(404);
  });
});

describe('PUT /api/scores/:id', () => {
  it('rejects a request without a session with 401', async () => {
    const score = await createAs(ana);
    const res = await t.request(`/api/scores/${score.id}`, {
      method: 'PUT',
      headers: { 'if-match': '1' },
      body: json({ snapshot: score }),
    });
    expect(res.status).toBe(401);
  });

  it('saves when If-Match matches and bumps rev', async () => {
    const score = await createAs(ana);
    const edited = { ...score, meta: { ...score.meta, title: 'Renamed' } };
    const res = await put(ana, score.id, edited, 1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rev: 2, updated_at: expect.any(String) });
    const stored = (await (await t.request(`/api/scores/${score.id}`, { cookie: ana })).json()) as {
      snapshot: { meta: { title: string } };
    };
    expect(stored.snapshot.meta.title).toBe('Renamed');
    expect((await put(ana, score.id, edited, '"2"')).status).toBe(200);
  });

  it('answers 409 with the latest rev and updatedAt when If-Match is stale', async () => {
    const score = await createAs(ana);
    expect((await put(ana, score.id, score, 1)).status).toBe(200);
    const stale = await put(ana, score.id, score, 1);
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: { code: string }; rev: number; updated_at: string };
    expect(body).toEqual({ error: { code: 'rev_mismatch', message: expect.any(String) }, rev: 2, updated_at: expect.any(String) });
    expect(Number.isNaN(Date.parse(body.updated_at))).toBe(false);
    // Option (1) of the conflict rule: retry with the latest rev overwrites.
    expect((await put(ana, score.id, score, body.rev)).status).toBe(200);
  });

  it('rejects a snapshot over 5MB with 413 and keeps the stored version', async () => {
    const score = await createAs(ana);
    const big = structuredClone(score);
    big.tracks[0].bars[0].beats[0].text = 'x'.repeat(5 * 1024 * 1024);
    expect((await put(ana, score.id, big, 1)).status).toBe(413);
    const stored = (await (await t.request(`/api/scores/${score.id}`, { cookie: ana })).json()) as { rev: number };
    expect(stored.rev).toBe(1);
  });

  it('rejects a body larger than the transport limit with 413', async () => {
    const score = await createAs(ana);
    const huge = structuredClone(score);
    huge.tracks[0].bars[0].beats[0].text = 'x'.repeat(7 * 1024 * 1024);
    expect((await put(ana, score.id, huge, 1)).status).toBe(413);
  });

  it('rejects a declared Content-Length over the limit with 413 before reading the body', async () => {
    const score = await createAs(ana);
    const res = await t.request(`/api/scores/${score.id}`, {
      method: 'PUT',
      cookie: ana,
      headers: { 'if-match': '1', 'content-length': String(8 * 1024 * 1024) },
      body: json({ snapshot: score }),
    });
    expect(res.status).toBe(413);
  });

  it('answers 404 for another user’s score and leaves it unchanged', async () => {
    const score = await createAs(ana);
    const res = await put(ben, score.id, { ...score, meta: { ...score.meta, title: 'Hijacked' } }, 1);
    expect(res.status).toBe(404);
    const stored = (await (await t.request(`/api/scores/${score.id}`, { cookie: ana })).json()) as {
      snapshot: { meta: { title: string } };
      rev: number;
    };
    expect(stored.snapshot.meta.title).toBe('Riff');
    expect(stored.rev).toBe(1);
  });

  it('rejects a missing If-Match, an invalid snapshot, or a mismatched id with 400', async () => {
    const score = await createAs(ana);
    expect((await put(ana, score.id, score, undefined)).status).toBe(400);
    expect((await put(ana, score.id, score, 'abc')).status).toBe(400);
    expect((await put(ana, score.id, { ...score, schemaVersion: 2 }, 1)).status).toBe(400);
    expect((await put(ana, score.id, { ...score, id: newId() }, 1)).status).toBe(400);
  });
});

describe('DELETE /api/scores/:id', () => {
  it('rejects a request without a session with 401', async () => {
    const score = await createAs(ana);
    expect((await t.request(`/api/scores/${score.id}`, { method: 'DELETE' })).status).toBe(401);
  });

  it('moves the score to the trash instead of deleting the row', async () => {
    const score = await createAs(ana);
    const res = await t.request(`/api/scores/${score.id}`, { method: 'DELETE', cookie: ana });
    expect(res.status).toBe(204);
    const rows = await db.query.scores.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
  });

  it('answers 404 for another user’s score and does not trash it', async () => {
    const score = await createAs(ana);
    expect((await t.request(`/api/scores/${score.id}`, { method: 'DELETE', cookie: ben })).status).toBe(404);
    expect((await t.request(`/api/scores/${score.id}`, { cookie: ana })).status).toBe(200);
  });

  it('rejects an id that is not a ULID with 400', async () => {
    expect((await t.request('/api/scores/123', { method: 'DELETE', cookie: ana })).status).toBe(400);
  });
});

describe('purgeTrash', () => {
  it('permanently deletes scores trashed more than 30 days ago and keeps newer trash and live scores', async () => {
    const old = await createAs(ana, sampleScore({ title: 'Old' }));
    const recent = await createAs(ana, sampleScore({ title: 'Recent' }));
    const live = await createAs(ana, sampleScore({ title: 'Live' }));
    const day = 24 * 60 * 60 * 1000;
    await db.update(scoresTable).set({ deletedAt: new Date(Date.now() - 31 * day) }).where(eq(scoresTable.id, old.id));
    await db.update(scoresTable).set({ deletedAt: new Date(Date.now() - 1 * day) }).where(eq(scoresTable.id, recent.id));

    expect(await purgeTrash(db)).toBe(1);

    const left = (await db.query.scores.findMany()).map(r => r.id).sort();
    expect(left).toEqual([recent.id, live.id].sort());
  });

  it('honours a custom retention in days', async () => {
    const score = await createAs(ana);
    await db.update(scoresTable).set({ deletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }).where(eq(scoresTable.id, score.id));
    expect(await purgeTrash(db, 3)).toBe(0);
    expect(await purgeTrash(db, 1)).toBe(1);
  });
});
