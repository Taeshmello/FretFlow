import type { Score } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export class MigrationError extends Error {}

/**
 * Brings stored JSON up to the current schema. Version 1 is the first one, so
 * this only checks the shape; later versions add steps here.
 */
export function migrateScore(raw: unknown): Score {
  if (raw === null || typeof raw !== 'object') {
    throw new MigrationError('score is not an object');
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(`unsupported schemaVersion ${String(version)}`);
  }
  const s = raw as Score;
  if (!Array.isArray(s.masterBars) || !Array.isArray(s.tracks) || typeof s.id !== 'string') {
    throw new MigrationError('score is missing masterBars, tracks or id');
  }
  return s;
}
