export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimiter {
  hit(key: string): RateLimitResult;
  /** Whether `key` is still within budget, without counting a hit. */
  peek(key: string): RateLimitResult;
}

/**
 * Fixed-window in-memory limiter. Per process only: fine for one instance;
 * move to Postgres or Redis before scaling out horizontally.
 */
export function createMemoryRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return {
    hit(key) {
      const t = now();
      if (t >= nextSweep) {
        for (const [k, w] of windows) {
          if (w.resetAt <= t) windows.delete(k);
        }
        nextSweep = t + opts.windowMs;
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + opts.windowMs };
        windows.set(key, w);
      }
      w.count++;
      return { allowed: w.count <= opts.max, retryAfterSec: Math.ceil((w.resetAt - t) / 1000) };
    },
    peek(key) {
      const t = now();
      const w = windows.get(key);
      if (!w || w.resetAt <= t) {
        return { allowed: true, retryAfterSec: 0 };
      }
      return { allowed: w.count < opts.max, retryAfterSec: Math.ceil((w.resetAt - t) / 1000) };
    },
  };
}

export const unlimited: RateLimiter = { hit: () => ({ allowed: true, retryAfterSec: 0 }), peek: () => ({ allowed: true, retryAfterSec: 0 }) };
