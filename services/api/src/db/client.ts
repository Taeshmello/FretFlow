import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export { schema };

/** Driver-agnostic handle: postgres-js in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createPostgresDb(url: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
