import { Hono } from 'hono';
import type { AppEnv } from '../auth/require-user.ts';

export function meRoutes() {
  return new Hono<AppEnv>().get('/', c => {
    const { id, email, name } = c.get('user');
    return c.json({ id, email, name });
  });
}
