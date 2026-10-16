import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId } from '@fretflow/score-model';
import type { Db } from '../src/db/client.ts';
import { schema } from '../src/db/client.ts';
import { createMemoryRateLimiter } from '../src/lib/rate-limit.ts';
import { buildTestApp, createTestDb, resetDb, sampleScore, WEB_ORIGIN } from './helpers.ts';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

describe('GET /api/health', () => {
  it('answers without a session when the database is reachable', async () => {
    const { request } = buildTestApp(db);
    const res = await request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /api/me', () => {
  it('rejects a request without a session with 401', async () => {
    const { request } = buildTestApp(db);
    const res = await request('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });

  it('rejects a forged session cookie with 401', async () => {
    const { request } = buildTestApp(db);
    const res = await request('/api/me', { cookie: 'better-auth.session_token=forged.value' });
    expect(res.status).toBe(401);
  });

  it('returns the signed-in user after the magic-link flow', async () => {
    const { request, signIn } = buildTestApp(db);
    const cookie = await signIn('ana@example.com');
    const res = await request('/api/me', { cookie });
    expect(res.status).toBe(200);
    const me = (await res.json()) as { id: string; email: string };
    expect(me.email).toBe('ana@example.com');
    expect(me.id).toEqual(expect.any(String));
  });

  it('shows each user only their own identity', async () => {
    const { request, signIn } = buildTestApp(db);
    const a = await signIn('ana@example.com');
    const b = await signIn('ben@example.com');
    const meA = (await (await request('/api/me', { cookie: a })).json()) as { email: string };
    const meB = (await (await request('/api/me', { cookie: b })).json()) as { email: string };
    expect(meA.email).toBe('ana@example.com');
    expect(meB.email).toBe('ben@example.com');
  });

  it('requires a session for unknown paths under /api (default deny)', async () => {
    const { request } = buildTestApp(db);
    const res = await request('/api/does-not-exist');
    expect(res.status).toBe(401);
  });
});

describe('account deletion', () => {
  it('deletes the account, sessions, scores and cloud audio object', async () => {
    const t = buildTestApp(db);
    const cookie = await t.signIn('delete-me@example.com');
    const me = (await (await t.request('/api/me', { cookie })).json()) as { id: string };
    const score = sampleScore();
    const audioId = newId();
    const storageKey = `audio/${me.id}/${'a'.repeat(64)}`;

    await db.insert(schema.scores).values({
      id: score.id,
      ownerId: me.id,
      title: score.meta.title,
      composerType: score.meta.composerType,
      snapshot: score,
    });
    await db.insert(schema.audioAssets).values({
      id: audioId,
      ownerId: me.id,
      storageKey,
      sha256: 'a'.repeat(64),
      sizeBytes: 12,
      status: 'ready',
    });
    t.storage.objects.set(storageKey, 12);

    const deleted = await t.request('/api/auth/delete-user', {
      method: 'POST',
      cookie,
      body: '{}',
    });

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ success: true, message: 'User deleted' });
    expect(t.storage.deleted).toEqual([storageKey]);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, me.id))).toHaveLength(0);
    expect(await db.select().from(schema.scores).where(eq(schema.scores.ownerId, me.id))).toHaveLength(0);
    expect(await db.select().from(schema.audioAssets).where(eq(schema.audioAssets.ownerId, me.id))).toHaveLength(0);
    expect((await t.request('/api/me', { cookie })).status).toBe(401);
  });

  it('keeps the account when deleting a cloud object fails', async () => {
    const t = buildTestApp(db);
    const cookie = await t.signIn('retry-delete@example.com');
    const me = (await (await t.request('/api/me', { cookie })).json()) as { id: string };
    const storageKey = `audio/${me.id}/${'b'.repeat(64)}`;
    await db.insert(schema.audioAssets).values({
      id: newId(),
      ownerId: me.id,
      storageKey,
      sha256: 'b'.repeat(64),
      sizeBytes: 12,
      status: 'ready',
    });
    t.storage.deleteObject = async () => {
      throw new Error('storage unavailable');
    };

    expect((await t.request('/api/auth/delete-user', { method: 'POST', cookie, body: '{}' })).status).toBe(500);
    expect(await db.select().from(schema.user).where(eq(schema.user.id, me.id))).toHaveLength(1);
  });
});

describe('magic link sign-in', () => {
  it('rejects an invalid email address with 400', async () => {
    const { request, email } = buildTestApp(db);
    const res = await request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
    expect(email.sent).toHaveLength(0);
  });

  it('consumes the link on first use so it cannot mint a second session', async () => {
    const { app, request, email } = buildTestApp(db);
    await request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: 'ana@example.com', callbackURL: `${WEB_ORIGIN}/` }),
    });
    const link = email.sent[0].text.match(/https?:\/\/\S+/)![0];
    const first = await app.request(link, { redirect: 'manual' });
    const second = await app.request(link, { redirect: 'manual' });
    expect(first.headers.getSetCookie().some(c => c.includes('session_token='))).toBe(true);
    expect(second.headers.getSetCookie().some(c => /session_token=[^;]+/.test(c) && !c.includes('Max-Age=0'))).toBe(false);
  });

  it('limits sign-in requests to 5 per minute per IP', async () => {
    const { request, email } = buildTestApp(db, {
      rateLimits: { signIn: createMemoryRateLimiter({ max: 5, windowMs: 60_000 }) },
    });
    const send = (ip: string) =>
      request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'x-test-ip': ip },
        body: JSON.stringify({ email: 'ana@example.com' }),
      });
    for (let i = 0; i < 5; i++) {
      expect((await send('203.0.113.1')).status).toBe(200);
    }
    const blocked = await send('203.0.113.1');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await send('203.0.113.2')).status).toBe(200);
    expect(email.sent).toHaveLength(6);
  });

  it('shares the IP sign-in budget across magic links and passwords', async () => {
    const { request } = buildTestApp(db, {
      rateLimits: { signIn: createMemoryRateLimiter({ max: 1, windowMs: 60_000 }) },
    });
    expect((await request('/api/auth/sign-in/magic-link', {
      method: 'POST', headers: { 'x-test-ip': '203.0.113.7' }, body: JSON.stringify({ email: 'ana@example.com' }),
    })).status).toBe(200);
    const blocked = await request('/api/auth/sign-in/email', {
      method: 'POST', headers: { 'x-test-ip': '203.0.113.7' }, body: JSON.stringify({ email: 'ana@example.com', password: 'wrong password!' }),
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('limits magic links to 3 per 10 minutes per email address, whatever the IP or letter case', async () => {
    const { request, email } = buildTestApp(db, {
      rateLimits: { signInEmail: createMemoryRateLimiter({ max: 3, windowMs: 10 * 60_000 }) },
    });
    const send = (address: string, ip: string) =>
      request('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'x-test-ip': ip },
        body: JSON.stringify({ email: address }),
      });
    expect((await send('ana@example.com', '203.0.113.1')).status).toBe(200);
    expect((await send('Ana@Example.com', '203.0.113.2')).status).toBe(200);
    expect((await send('ANA@EXAMPLE.COM', '203.0.113.3')).status).toBe(200);
    const blocked = await send('ana@example.com', '203.0.113.4');
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: 'rate_limited', message: expect.any(String) } });
    expect((await send('ben@example.com', '203.0.113.4')).status).toBe(200);
    expect(email.sent).toHaveLength(4);
  });

  it('does not put the email address or token in any response header', async () => {
    const { request } = buildTestApp(db);
    const res = await request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: 'ana@example.com' }),
    });
    const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    expect(headers).not.toContain('ana@example.com');
  });
});

describe('public share guard', () => {
  it('allows a public share request without a session and limits reads per IP', async () => {
    const { request } = buildTestApp(db, {
      rateLimits: { shareView: createMemoryRateLimiter({ max: 1, windowMs: 60_000 }) },
    });
    const read = (ip: string) => request('/api/share/invalid-token', { headers: { 'x-test-ip': ip } });
    expect((await read('203.0.113.1')).status).toBe(400);
    const blocked = await read('203.0.113.1');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await read('203.0.113.2')).status).toBe(400);
  });
});

describe('per-user rate limit', () => {
  it('answers 429 once a user exceeds the per-minute budget', async () => {
    const { request, signIn } = buildTestApp(db, {
      rateLimits: { perUser: createMemoryRateLimiter({ max: 3, windowMs: 60_000 }) },
    });
    const cookie = await signIn('ana@example.com');
    for (let i = 0; i < 3; i++) {
      expect((await request('/api/me', { cookie })).status).toBe(200);
    }
    expect((await request('/api/me', { cookie })).status).toBe(429);
  });
});

describe('CORS', () => {
  it('allows credentialed requests only from WEB_ORIGIN', async () => {
    const { app } = buildTestApp(db);
    const preflight = (origin: string) =>
      app.request('http://localhost:3000/api/scores', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'if-match' },
      });
    const ok = await preflight(WEB_ORIGIN);
    expect(ok.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const evil = await preflight('https://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
