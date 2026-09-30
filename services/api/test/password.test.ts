import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, type Db } from '../src/db/client.ts';
import { createMemoryRateLimiter } from '../src/lib/rate-limit.ts';
import { buildTestApp, createTestDb, resetDb } from './helpers.ts';

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
}, 30_000);
beforeEach(async () => {
  await resetDb(db);
});

const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .map(c => c.split(';')[0])
    .filter(c => c.includes('session_token'))
    .join('; ');

type App = ReturnType<typeof buildTestApp>;
const signUp = (t: App, email: string, password: string, ip = '203.0.113.9') =>
  t.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'x-test-ip': ip }, body: JSON.stringify({ email, password, name: email.split('@')[0] }) });
const signInPw = (t: App, email: string, password: string, ip = '203.0.113.9') =>
  t.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'x-test-ip': ip }, body: JSON.stringify({ email, password }) });

describe('email and password sign-in', () => {
  it('signs up, starts a session and reports the free plan on /api/me', async () => {
    const t = buildTestApp(db);
    const res = await signUp(t, 'ana@example.com', 'correct horse battery');
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).not.toBe('');
    const me = await t.request('/api/me', { cookie });
    expect(me.status).toBe(200);
    const body = (await me.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ email: 'ana@example.com', plan: 'free' });
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });

  it('stores only a hash of the password', async () => {
    const t = buildTestApp(db);
    await signUp(t, 'ana@example.com', 'correct horse battery');
    const [row] = await db.select().from(schema.account);
    expect(row.password).toBeTruthy();
    expect(row.password).not.toContain('correct horse battery');
  });

  it('signs in with the right password and refuses a wrong one with 401', async () => {
    const t = buildTestApp(db);
    await signUp(t, 'ana@example.com', 'correct horse battery');
    const ok = await signInPw(t, 'ana@example.com', 'correct horse battery');
    expect(ok.status).toBe(200);
    expect(sessionCookie(ok)).not.toBe('');
    const bad = await signInPw(t, 'ana@example.com', 'wrong password!');
    expect(bad.status).toBe(401);
    expect(sessionCookie(bad)).toBe('');
  });

  it('rejects a password shorter than 8 characters with 400', async () => {
    const t = buildTestApp(db);
    expect((await signUp(t, 'ana@example.com', 'short')).status).toBe(400);
  });

  it('does not create a second account for the same email', async () => {
    const t = buildTestApp(db);
    await signUp(t, 'ana@example.com', 'correct horse battery');
    const again = await signUp(t, 'ANA@example.com', 'another good password');
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });

  it('limits sign-ups per IP', async () => {
    const t = buildTestApp(db, { rateLimits: { signUp: createMemoryRateLimiter({ max: 2, windowMs: 60_000 }) } });
    expect((await signUp(t, 'a@example.com', 'correct horse battery')).status).toBe(200);
    expect((await signUp(t, 'b@example.com', 'correct horse battery')).status).toBe(200);
    expect((await signUp(t, 'c@example.com', 'correct horse battery')).status).toBe(429);
    expect((await signUp(t, 'c@example.com', 'correct horse battery', '203.0.113.10')).status).toBe(200);
  });

  it('limits password attempts per email address, whatever the IP or letter case', async () => {
    const t = buildTestApp(db, { rateLimits: { passwordEmail: createMemoryRateLimiter({ max: 3, windowMs: 60_000 }) } });
    await signUp(t, 'ana@example.com', 'correct horse battery');
    for (let i = 0; i < 3; i++) {
      expect((await signInPw(t, i % 2 ? 'ANA@example.com' : 'ana@example.com', 'wrong password!', `198.51.100.${i}`)).status).toBe(401);
    }
    expect((await signInPw(t, 'ana@example.com', 'correct horse battery', '198.51.100.99')).status).toBe(429);
  });
});

describe('password lockout', () => {
  it('counts only wrong passwords, so the owner signing in often is never locked out', async () => {
    const t = buildTestApp(db, { rateLimits: { passwordEmail: createMemoryRateLimiter({ max: 2, windowMs: 60_000 }) } });
    await signUp(t, 'ana@example.com', 'correct horse battery');
    for (let i = 0; i < 5; i++) {
      expect((await signInPw(t, 'ana@example.com', 'correct horse battery', `198.51.100.${i}`)).status).toBe(200);
    }
  });
});

describe('plan on /api/me (server decides, D-010)', () => {
  it('reports pro while an entitlement is active and free once it has expired', async () => {
    const t = buildTestApp(db);
    const cookie = sessionCookie(await signUp(t, 'ana@example.com', 'correct horse battery'));
    const [user] = await db.select().from(schema.user);
    const plan = async () => ((await (await t.request('/api/me', { cookie })).json()) as { plan: string }).plan;

    await db.insert(schema.entitlements).values({ userId: user.id, plan: 'pro', source: 'manual', expiresAt: null });
    expect(await plan()).toBe('pro');

    await db.update(schema.entitlements).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.entitlements.userId, user.id));
    expect(await plan()).toBe('free');
  });
});
