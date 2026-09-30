import { PGlite } from '@electric-sql/pglite';
import { createScore, type Score } from '@fretflow/score-model';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createApp, type AudioLimits, type RateLimits } from '../src/app.ts';
import { createAuth } from '../src/auth/auth.ts';
import { schema, type Db } from '../src/db/client.ts';
import { MIGRATIONS_FOLDER } from '../src/db/migrate.ts';
import { createMemoryEmailSender } from '../src/lib/email.ts';
import { silentLogger } from '../src/lib/logger.ts';
import { unlimited } from '../src/lib/rate-limit.ts';
import type { ObjectStorage } from '../src/lib/storage.ts';

export const WEB_ORIGIN = 'http://localhost:5173';
const BASE_URL = 'http://localhost:3000';

/** Real Postgres (PGlite, WASM) with the committed migrations applied. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Wipes all rows between tests; user cascades to sessions, scores, audio, sync maps. */
export async function resetDb(db: Db) {
  await db.execute(sql`truncate table "user", "verification" cascade`);
}

export function createFakeStorage(): ObjectStorage & {
  objects: Map<string, number>;
  deleted: string[];
  downloads: { key: string; contentType: string }[];
} {
  const objects = new Map<string, number>();
  const deleted: string[] = [];
  const downloads: { key: string; contentType: string }[] = [];
  return {
    objects,
    deleted,
    downloads,
    async presignUpload(key, { contentType, sha256 }) {
      return {
        url: `https://storage.test/upload/${key}?sig=test`,
        headers: { 'content-type': contentType, 'x-amz-checksum-sha256': Buffer.from(sha256, 'hex').toString('base64') },
      };
    },
    async presignDownload(key, { contentType }) {
      downloads.push({ key, contentType });
      return `https://storage.test/download/${key}?sig=test`;
    },
    async sizeOf(key) {
      return objects.get(key) ?? null;
    },
    async deleteObject(key) {
      deleted.push(key);
      objects.delete(key);
    },
  };
}

export function buildTestApp(db: Db, opts: { rateLimits?: Partial<RateLimits>; audioLimits?: Partial<AudioLimits> } = {}) {
  const email = createMemoryEmailSender();
  const storage = createFakeStorage();
  const logger = silentLogger();
  const auth = createAuth({
    db,
    secret: 'test-secret-test-secret-test-secret-0000',
    baseURL: BASE_URL,
    webOrigins: [WEB_ORIGIN],
    email,
    logger,
    secureCookies: false,
  });
  const app = createApp({
    db,
    auth,
    logger,
    storage,
    webOrigins: [WEB_ORIGIN],
    clientIpHeader: 'x-test-ip',
    rateLimits: { perUser: unlimited, signIn: unlimited, signInEmail: unlimited, signUp: unlimited, passwordEmail: unlimited, audioUpload: unlimited, ...opts.rateLimits },
    audioLimits: opts.audioLimits,
  });

  /** Requests against the app as a browser on WEB_ORIGIN would send them. */
  function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const headers = new Headers(init.headers);
    headers.set('origin', WEB_ORIGIN);
    if (init.cookie) headers.set('cookie', init.cookie);
    if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return app.request(new URL(path, BASE_URL).toString(), { ...init, headers });
  }

  /**
   * Signs in through the real magic-link flow: request a link, read it from the
   * in-memory mailbox, follow it, and keep the session cookie Better Auth sets.
   */
  async function signIn(address: string): Promise<string> {
    const before = email.sent.length;
    const res = await request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: address, callbackURL: `${WEB_ORIGIN}/` }),
    });
    if (res.status !== 200) {
      throw new Error(`magic link request failed: ${res.status} ${await res.text()}`);
    }
    const message = email.sent[before];
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) {
      throw new Error('no magic link was sent');
    }
    const verify = await app.request(link, { redirect: 'manual' });
    const cookie = verify.headers
      .getSetCookie()
      .map(c => c.split(';')[0])
      .filter(c => c.includes('session_token'))
      .join('; ');
    if (!cookie) {
      throw new Error(`verify did not set a session cookie (status ${verify.status})`);
    }
    return cookie;
  }

  return { app, auth, email, storage, request, signIn };
}

export function json(body: unknown): string {
  return JSON.stringify(body);
}

export function sampleScore(overrides: Partial<Score['meta']> = {}): Score {
  const score = createScore({ title: 'Riff', bars: 2 });
  return { ...score, meta: { ...score.meta, ...overrides } };
}
