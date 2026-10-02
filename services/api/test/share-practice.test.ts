import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@fretflow/score-model';
import { eq } from 'drizzle-orm';
import type { Db } from '../src/db/client.ts';
import { entitlements, scores } from '../src/db/schema.ts';
import { buildTestApp, createTestDb, json, resetDb, sampleScore } from './helpers.ts';

let db: Db;
let t: ReturnType<typeof buildTestApp>;
let owner: string;
let other: string;

beforeAll(async () => { db = await createTestDb(); });
beforeEach(async () => {
  await resetDb(db);
  t = buildTestApp(db);
  owner = await t.signIn('owner@example.com');
  other = await t.signIn('other@example.com');
});

async function addScore() {
  const score = sampleScore();
  expect((await t.request('/api/scores', { method: 'POST', cookie: owner, body: json({ snapshot: score }) })).status).toBe(201);
  return score;
}

async function grantPro(cookie: string) {
  const me = await (await t.request('/api/me', { cookie })).json() as { id: string };
  await db.insert(entitlements).values({ userId: me.id, plan: 'pro', source: 'manual' });
}

describe('unlisted read-only score links', () => {
  it('requires the owner to create a link and keeps other users indistinguishable from missing scores', async () => {
    const score = await addScore();
    expect((await t.request(`/api/scores/${score.id}/share`, { method: 'POST' })).status).toBe(401);
    expect((await t.request(`/api/scores/${score.id}/share`, { method: 'POST', cookie: other })).status).toBe(404);
    expect((await t.request(`/api/scores/${newId()}/share`, { method: 'POST', cookie: other })).status).toBe(404);
  });

  it('serves only the score snapshot and invalidates rotated or revoked links', async () => {
    const score = await addScore();
    const created = await t.request(`/api/scores/${score.id}/share`, { method: 'POST', cookie: owner });
    expect(created.status).toBe(201);
    const { token } = await created.json() as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const raw = JSON.stringify(await db.select({ hash: scores.shareTokenHash }).from(scores).where(eq(scores.id, score.id)));
    expect(raw).not.toContain(token);
    const view = await t.request(`/api/share/${token}`);
    expect(view.status).toBe(200);
    expect(await view.json()).toEqual({ snapshot: score });
    expect(view.headers.get('x-robots-tag')).toContain('noindex');
    expect(await (await t.request(`/api/scores/${score.id}/share`, { cookie: owner })).json()).toEqual({ shared: true });

    const rotated = await t.request(`/api/scores/${score.id}/share`, { method: 'POST', cookie: owner });
    const second = (await rotated.json() as { token: string }).token;
    expect(second).not.toBe(token);
    expect((await t.request(`/api/share/${token}`)).status).toBe(404);
    expect((await t.request(`/api/share/${second}`)).status).toBe(200);
    expect((await t.request(`/api/scores/${score.id}/share`, { method: 'DELETE', cookie: owner })).status).toBe(204);
    expect((await t.request(`/api/share/${second}`)).status).toBe(404);
  });

  it('does not expose a trashed score or accept malformed tokens', async () => {
    const score = await addScore();
    const created = await t.request(`/api/scores/${score.id}/share`, { method: 'POST', cookie: owner });
    const { token } = await created.json() as { token: string };
    expect((await t.request('/api/share/nope')).status).toBe(400);
    await t.request(`/api/scores/${score.id}`, { method: 'DELETE', cookie: owner });
    expect((await t.request(`/api/share/${token}`)).status).toBe(404);
  });
});

describe('private Pro practice synchronization', () => {
  const section = () => ({ id: newId(), name: 'Solo', startBar: 1, endBar: 2, targetReps: 3, completedSessions: 0, lastPracticedAt: null });

  it('requires an owned score and a current Pro entitlement', async () => {
    const score = await addScore();
    expect((await t.request(`/api/scores/${score.id}/practice`)).status).toBe(401);
    expect((await t.request(`/api/scores/${score.id}/practice`, { cookie: other })).status).toBe(404);
    expect((await t.request(`/api/scores/${score.id}/practice`, { cookie: owner })).status).toBe(403);
    await grantPro(owner);
    expect(await (await t.request(`/api/scores/${score.id}/practice`, { cookie: owner })).json()).toEqual({ sections: [], rev: 0 });
  });

  it('validates sections and uses a separate revision without changing the shared score', async () => {
    const score = await addScore();
    await grantPro(owner);
    const path = `/api/scores/${score.id}/practice`;
    const options = (sections: unknown, rev = '0') => ({ method: 'PUT', cookie: owner, headers: { 'if-match': rev }, body: json({ sections }) });
    expect((await t.request(path, options([{ ...section(), endBar: 99 }]))).status).toBe(400);
    const saved = [section()];
    const first = await t.request(path, options(saved));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ rev: 1 });
    const stale = await t.request(path, options([]));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: { code: 'rev_mismatch', message: expect.any(String) }, rev: 1 });
    expect(await (await t.request(path, { cookie: owner })).json()).toEqual({ sections: saved, rev: 1 });
    const row = await (await t.request(`/api/scores/${score.id}`, { cookie: owner })).json() as { snapshot: unknown; rev: number };
    expect(row).toMatchObject({ snapshot: score, rev: 1 });
    const token = (await (await t.request(`/api/scores/${score.id}/share`, { method: 'POST', cookie: owner })).json() as { token: string }).token;
    expect(JSON.stringify(await (await t.request(`/api/share/${token}`)).json())).not.toContain('Solo');
  });
});
