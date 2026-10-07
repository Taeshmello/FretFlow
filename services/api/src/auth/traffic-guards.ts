import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import type { Auth } from './auth.ts';
import { enforceLimit, requireUser, type AppEnv } from './require-user.ts';
import { HttpError } from '../lib/errors.ts';
import { createMemoryRateLimiter, type RateLimiter } from '../lib/rate-limit.ts';

export interface RateLimits {
  /** Every authenticated request, per user. */
  perUser: RateLimiter;
  /** POST /api/auth/sign-in/*, per client IP. */
  signIn: RateLimiter;
  /** Magic links sent, per email address (anti email-bombing). */
  signInEmail: RateLimiter;
  /** POST /api/auth/sign-up/*, per client IP (account creation). */
  signUp: RateLimiter;
  /** Failed password sign-ins, per email address (successes do not count). */
  passwordEmail: RateLimiter;
  /** POST /api/audio/upload-url, per user. */
  audioUpload: RateLimiter;
  /** Public unlisted score reads, per client IP. */
  shareView: RateLimiter;
}

export function defaultRateLimits(): RateLimits {
  return {
    perUser: createMemoryRateLimiter({ max: 300, windowMs: 60_000 }),
    signIn: createMemoryRateLimiter({ max: 5, windowMs: 60_000 }),
    signInEmail: createMemoryRateLimiter({ max: 3, windowMs: 10 * 60_000 }),
    signUp: createMemoryRateLimiter({ max: 5, windowMs: 10 * 60_000 }),
    passwordEmail: createMemoryRateLimiter({ max: 10, windowMs: 10 * 60_000 }),
    audioUpload: createMemoryRateLimiter({ max: 30, windowMs: 60_000 }),
    shareView: createMemoryRateLimiter({ max: 120, windowMs: 60_000 }),
  };
}

/** The only paths reachable without a session (BACKEND.md §6.1). */
function isPublicPath(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/auth/') || path.startsWith('/api/share/');
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

/** Read from a clone so Better Auth still receives the original body. */
async function requestEmail(req: Request): Promise<string | null> {
  try {
    const body = (await req.clone().json()) as { email?: unknown };
    return typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Register before the public share routes so their reads are rate-limited. */
export function registerShareLimit(app: Hono<AppEnv>, limiter: RateLimiter, clientIpHeader?: string): void {
  app.use('/api/share/*', async (c, next) => {
    enforceLimit(c, limiter, `ip:${clientIp(c, clientIpHeader)}`);
    await next();
  });
}

/** Register before the Better Auth handler; route order is security-sensitive. */
export function registerAuthLimits(app: Hono<AppEnv>, auth: Auth, limits: RateLimits, clientIpHeader?: string): void {
  app.post('/api/auth/sign-in/*', async (c, next) => {
    enforceLimit(c, limits.signIn, `ip:${clientIp(c, clientIpHeader)}`);
    await next();
  });
  app.post('/api/auth/sign-in/magic-link', async (c, next) => {
    const email = await requestEmail(c.req.raw);
    if (email) enforceLimit(c, limits.signInEmail, `email:${email}`);
    await next();
  });
  app.post('/api/auth/sign-in/email', async (c, next) => {
    const email = await requestEmail(c.req.raw);
    const key = email ? `password:${email}` : null;
    if (key) {
      const { allowed, retryAfterSec } = limits.passwordEmail.peek(key);
      if (!allowed) {
        c.header('Retry-After', String(retryAfterSec));
        throw new HttpError(429, 'rate_limited', 'Too many requests');
      }
    }
    await next();
    // Only wrong passwords count against the address.
    if (key && c.res.status === 401) limits.passwordEmail.hit(key);
  });
  app.post('/api/auth/sign-up/*', async (c, next) => {
    enforceLimit(c, limits.signUp, `ip:${clientIp(c, clientIpHeader)}`);
    await next();
  });
  app.on(['GET', 'POST'], '/api/auth/*', c => auth.handler(c.req.raw));
}

/** Default deny: every other /api path needs a session, including unknown ones. */
export function registerSessionGuard(app: Hono<AppEnv>, auth: Auth, perUser: RateLimiter): void {
  const guard = requireUser(auth, perUser);
  app.use('/api/*', async (c, next) => (isPublicPath(c.req.path) ? next() : guard(c, next)));
}
