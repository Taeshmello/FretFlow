import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HttpError, unauthorized } from '../lib/errors.ts';
import type { RateLimiter } from '../lib/rate-limit.ts';
import type { Auth } from './auth.ts';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AppEnv = { Variables: { user: AuthUser } };

/** 401 without a valid Better Auth session; then applies the per-user rate limit. */
export function requireUser(auth: Auth, limiter: RateLimiter) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) {
      throw unauthorized();
    }
    enforceLimit(c, limiter, `user:${result.user.id}`);
    c.set('user', { id: result.user.id, email: result.user.email, name: result.user.name });
    await next();
  });
}

/** Counts one hit against `key`; throws 429 with Retry-After when over budget. */
export function enforceLimit(c: Context, limiter: RateLimiter, key: string): void {
  const { allowed, retryAfterSec } = limiter.hit(key);
  if (!allowed) {
    c.header('Retry-After', String(retryAfterSec));
    throw new HttpError(429, 'rate_limited', 'Too many requests');
  }
}
