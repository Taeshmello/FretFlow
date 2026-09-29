import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';

export function healthRoutes(db: Db) {
  return new Hono().get('/', async c => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'degraded' }, 503);
    }
  });
}
