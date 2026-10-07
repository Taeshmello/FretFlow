import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './auth/auth.ts';
import type { AppEnv } from './auth/require-user.ts';
import { defaultRateLimits, registerAuthLimits, registerSessionGuard, registerShareLimit, type RateLimits } from './auth/traffic-guards.ts';
import type { Db } from './db/client.ts';
import { errorResponse, HttpError } from './lib/errors.ts';
import type { Logger } from './lib/logger.ts';
import { MAX_SNAPSHOT_BYTES } from './lib/score-snapshot.ts';
import type { ObjectStorage } from './lib/storage.ts';
import { audioRoutes, DEFAULT_AUDIO_LIMITS, type AudioLimits } from './routes/audio.ts';

export type { AudioLimits, RateLimits };
export { defaultRateLimits } from './auth/traffic-guards.ts';
import { healthRoutes } from './routes/health.ts';
import { meRoutes } from './routes/me.ts';
import { scoreRoutes } from './routes/scores.ts';
import { ownerShareRoutes, publicShareRoutes } from './routes/share.ts';
import { practiceRoutes } from './routes/practice.ts';
import { syncMapRoutes } from './routes/sync-maps.ts';

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
  registerShareLimit(app, limits.shareView, deps.clientIpHeader);
  app.route('/api/share', publicShareRoutes(db));

  registerAuthLimits(app, auth, limits, deps.clientIpHeader);
  registerSessionGuard(app, auth, limits.perUser);

  app.route('/api/me', meRoutes(db));
  app.route('/api/scores', scoreRoutes(db));
  app.route('/api/scores', ownerShareRoutes(db));
  app.route('/api/scores', practiceRoutes(db));
  app.route('/api/scores', syncMapRoutes(db));
  app.route('/api/audio', audioRoutes(db, deps.storage, limits.audioUpload, audioLimits));

  return app;
}
