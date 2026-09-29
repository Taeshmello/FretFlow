import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/auth.ts';
import { enforceLimit, requireUser, type AppEnv } from './auth/require-user.ts';
import type { Db } from './db/client.ts';
import { errorResponse, HttpError } from './lib/errors.ts';
import type { Logger } from './lib/logger.ts';
import { createMemoryRateLimiter, type RateLimiter } from './lib/rate-limit.ts';
import { MAX_SNAPSHOT_BYTES } from './lib/score-snapshot.ts';
import type { ObjectStorage } from './lib/storage.ts';
import { audioRoutes, DEFAULT_AUDIO_LIMITS, syncMapRoutes, type AudioLimits } from './routes/audio.ts';

export type { AudioLimits };
import { healthRoutes } from './routes/health.ts';
import { meRoutes } from './routes/me.ts';
import { scoreRoutes } from './routes/scores.ts';

export interface RateLimits {
  /** Every authenticated request, per user. */
  perUser: RateLimiter;
  /** POST /api/auth/sign-in/*, per client IP. */
  signIn: RateLimiter;
  /** Magic links sent, per email address (anti email-bombing). */
  signInEmail: RateLimiter;
  /** POST /api/audio/upload-url, per user. */
  audioUpload: RateLimiter;
}

export function defaultRateLimits(): RateLimits {
  return {
    perUser: createMemoryRateLimiter({ max: 300, windowMs: 60_000 }),
    signIn: createMemoryRateLimiter({ max: 5, windowMs: 60_000 }),
    signInEmail: createMemoryRateLimiter({ max: 3, windowMs: 10 * 60_000 }),
    audioUpload: createMemoryRateLimiter({ max: 30, windowMs: 60_000 }),
  };
}

export interface AppDeps {
  db: Db;
  auth: Auth;
  storage: ObjectStorage;
  logger: Logger;
  /** CORS / CSRF allow list (WEB_ORIGIN). */
  webOrigins: string[];
  /** Defaults to BACKEND.md §6.5 (see defaultRateLimits). Missing entries use the default. */
  rateLimits?: Partial<RateLimits>;
  audioLimits?: Partial<AudioLimits>;
  /** Proxy header with the real client IP; unset = socket address. */
  clientIpHeader?: string;
}

/** The only routes reachable without a session (BACKEND.md §6.1). */
function isPublicPath(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/auth/');
}

function clientIp(c: Context, header: string | undefined): string {
  if (header) {
    return c.req.header(header)?.split(',')[0]?.trim() || 'unknown';
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Normalized address from a magic-link request, read from a clone so Better Auth still gets the body. */
async function magicLinkEmail(req: Request): Promise<string | null> {
  try {
    const body = (await req.clone().json()) as { email?: unknown };
    return typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export function createApp(deps: AppDeps) {
  const { db, auth, logger } = deps;
  const limits: RateLimits = { ...defaultRateLimits(), ...deps.rateLimits };
  const audioLimits: AudioLimits = { ...DEFAULT_AUDIO_LIMITS, ...deps.audioLimits };

  const app = new Hono<AppEnv>();
  app.onError((err, c) => errorResponse(c, err, logger));
  app.notFound(c => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  // Path only: query strings can carry magic-link tokens.
  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    logger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
      'request',
    );
  });

  app.use(
    '/api/*',
    cors({
      origin: deps.webOrigins,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'If-Match'],
      maxAge: 600,
    }),
  );
  app.use('/api/*', csrf({ origin: deps.webOrigins }));
  app.use('/api/*', secureHeaders());
  // Transport cap a little above the 5MB snapshot limit (JSON wrapper + slack).
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_SNAPSHOT_BYTES + 512 * 1024,
      onError: () => {
        throw new HttpError(413, 'too_large', 'Request body too large');
      },
    }),
  );

  app.route('/api/health', healthRoutes(db));

  app.post('/api/auth/sign-in/*', async (c, next) => {
    enforceLimit(c, limits.signIn, `ip:${clientIp(c, deps.clientIpHeader)}`);
    await next();
  });
  app.post('/api/auth/sign-in/magic-link', async (c, next) => {
    const email = await magicLinkEmail(c.req.raw);
    if (email) {
      enforceLimit(c, limits.signInEmail, `email:${email}`);
    }
    await next();
  });
  app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));

  // Default deny: every other /api path needs a session, including unknown ones.
  const guard = requireUser(auth, limits.perUser);
  app.use('/api/*', async (c, next) => (isPublicPath(c.req.path) ? next() : guard(c, next)));

  app.route('/api/me', meRoutes());
  app.route('/api/scores', scoreRoutes(db));
  app.route('/api/scores', syncMapRoutes(db));
  app.route('/api/audio', audioRoutes(db, deps.storage, limits.audioUpload, audioLimits));

  return app;
}
