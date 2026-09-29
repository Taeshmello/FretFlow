import { beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../src/auth/auth.ts';
import { migrationDatabaseUrl } from '../src/db/migrate.ts';
import { loadEnv } from '../src/env.ts';
import { createHttpEmailSender, createMemoryEmailSender } from '../src/lib/email.ts';
import { silentLogger } from '../src/lib/logger.ts';
import { createMemoryRateLimiter } from '../src/lib/rate-limit.ts';
import { createTestDb, WEB_ORIGIN } from './helpers.ts';

const validEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/fretflow',
  BETTER_AUTH_SECRET: 's'.repeat(32),
  BETTER_AUTH_URL: 'https://api.example.com',
  WEB_ORIGIN: 'https://app.example.com, https://staging.example.com',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'google-secret-value',
  EMAIL_FROM: 'FretFlow <login@example.com>',
  EMAIL_PROVIDER_API_KEY: 'key',
  S3_ENDPOINT: 'https://r2.example.com',
  S3_REGION: 'auto',
  S3_BUCKET: 'audio',
  S3_ACCESS_KEY_ID: 'ak',
  S3_SECRET_ACCESS_KEY: 'sk',
};

describe('loadEnv', () => {
  it('parses a complete environment and splits WEB_ORIGIN on commas', () => {
    const env = loadEnv(validEnv);
    expect(env.WEB_ORIGIN).toEqual(['https://app.example.com', 'https://staging.example.com']);
    expect(env.PORT).toBe(3000);
  });

  it('fails naming the missing keys without echoing any secret values', () => {
    const { GOOGLE_CLIENT_SECRET: _omit, ...rest } = validEnv;
    expect(() => loadEnv({ ...rest, BETTER_AUTH_SECRET: 'too-short' })).toThrow(
      /BETTER_AUTH_SECRET.*GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_SECRET.*BETTER_AUTH_SECRET/,
    );
    try {
      loadEnv({ ...validEnv, BETTER_AUTH_SECRET: 'too-short' });
    } catch (err) {
      expect(String(err)).not.toContain('too-short');
    }
  });
});

describe('loadEnv CLIENT_IP_HEADER', () => {
  it('is required in production so the sign-in limit keys on the real client IP', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(/CLIENT_IP_HEADER/);
    expect(loadEnv({ ...validEnv, NODE_ENV: 'production', CLIENT_IP_HEADER: 'fly-client-ip' }).CLIENT_IP_HEADER).toBe(
      'fly-client-ip',
    );
  });

  it('refuses X-Forwarded-For, which clients can spoof by prepending values', () => {
    for (const value of ['x-forwarded-for', 'X-Forwarded-For', ' x-forwarded-for ']) {
      expect(() => loadEnv({ ...validEnv, CLIENT_IP_HEADER: value })).toThrow(/CLIENT_IP_HEADER/);
    }
  });
});

describe('migrationDatabaseUrl', () => {
  it('prefers MIGRATION_DATABASE_URL and falls back to DATABASE_URL', () => {
    expect(migrationDatabaseUrl({ DATABASE_URL: 'postgres://app@h/db', MIGRATION_DATABASE_URL: 'postgres://ddl@h/db' })).toBe(
      'postgres://ddl@h/db',
    );
    expect(migrationDatabaseUrl({ DATABASE_URL: 'postgres://app@h/db' })).toBe('postgres://app@h/db');
    expect(migrationDatabaseUrl({ DATABASE_URL: 'postgres://app@h/db', MIGRATION_DATABASE_URL: '' })).toBe('postgres://app@h/db');
  });

  it('fails when neither is set', () => {
    expect(() => migrationDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});

describe('createMemoryRateLimiter', () => {
  it('allows max hits per window and resets after it', () => {
    let now = 0;
    const limiter = createMemoryRateLimiter({ max: 2, windowMs: 1000, now: () => now });
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k')).toEqual({ allowed: false, retryAfterSec: 1 });
    expect(limiter.hit('other').allowed).toBe(true);
    now = 1000;
    expect(limiter.hit('k').allowed).toBe(true);
  });
});

describe('createHttpEmailSender', () => {
  it('posts a Resend-style JSON payload with the API key as a bearer token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createHttpEmailSender({
      url: 'https://mail.test/emails',
      apiKey: 'k1',
      from: 'FretFlow <a@b.c>',
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init! });
        return new Response('{}', { status: 200 });
      },
    });
    await sender.send({ to: 'x@y.z', subject: 's', text: 't', html: 'h' });
    expect(calls[0].url).toBe('https://mail.test/emails');
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer k1');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: 'FretFlow <a@b.c>', to: 'x@y.z', subject: 's', text: 't', html: 'h' });
  });

  it('reports provider failures by status only, without the recipient or link', async () => {
    const sender = createHttpEmailSender({
      url: 'https://mail.test/emails',
      apiKey: 'k1',
      from: 'a@b.c',
      fetch: async () => new Response('nope', { status: 502 }),
    });
    const err = await sender.send({ to: 'x@y.z', subject: 's', text: 'https://link', html: '' }).catch(e => e);
    expect(String(err)).toBe('Error: email provider responded 502');
  });
});

describe('session cookies', () => {
  // PGlite startup + migrations can exceed the default 5s test timeout when the
  // whole workspace suite runs in parallel, so the database is made in a hook.
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);

  it('are HttpOnly, Secure and SameSite=Lax when secure cookies are on', async () => {
    const email = createMemoryEmailSender();
    const auth = createAuth({
      db,
      secret: 'test-secret-test-secret-test-secret-0000',
      baseURL: 'https://api.example.com',
      webOrigins: [WEB_ORIGIN],
      email,
      logger: silentLogger(),
      secureCookies: true,
    });
    await auth.handler(
      new Request('https://api.example.com/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
        body: JSON.stringify({ email: 'ana@example.com' }),
      }),
    );
    const link = email.sent[0].text.match(/https:\/\/\S+/)![0];
    const res = await auth.handler(new Request(link));
    const session = res.headers.getSetCookie().find(c => c.includes('session_token='))!;
    expect(session).toMatch(/^__Secure-/);
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/SameSite=Lax/i);
  }, 15_000);
});
