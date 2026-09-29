// Applies drizzle/ migrations with the runtime driver (drizzle-kit is a dev
// dependency and is not in the production image). Run on every deploy.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Migrations run as a DDL-capable role (MIGRATION_DATABASE_URL) so the app role
 * behind DATABASE_URL can be limited to DML. Falls back to DATABASE_URL.
 */
export function migrationDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  if (!url) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
  }
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const client = postgres(migrationDatabaseUrl(process.env), { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  await client.end();
  console.log('migrations applied');
}
