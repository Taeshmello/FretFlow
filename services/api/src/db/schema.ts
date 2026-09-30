import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

// Better Auth core tables (user, session, account, verification). Field keys
// must match Better Auth's model field names; the drizzle adapter maps by key.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  t => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('verification_identifier_idx').on(t.identifier)],
);

// App tables (BACKEND.md §4).

export const scores = pgTable(
  'scores',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    composerType: text('composer_type', { enum: ['original', 'cover', 'public_domain'] }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    rev: integer('rev').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  t => [index('scores_owner_id_idx').on(t.ownerId)],
);

export const audioAssets = pgTable(
  'audio_assets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Declared at upload; served back as the download Content-Type. */
    mime: text('mime').notNull().default('application/octet-stream'),
    durationMs: integer('duration_ms'),
    status: text('status', { enum: ['pending', 'ready'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('audio_assets_owner_id_idx').on(t.ownerId), unique('audio_assets_owner_sha256_uq').on(t.ownerId, t.sha256)],
);

export const syncMaps = pgTable(
  'sync_maps',
  {
    scoreId: text('score_id')
      .notNull()
      .references(() => scores.id, { onDelete: 'cascade' }),
    audioId: text('audio_id')
      .notNull()
      .references(() => audioAssets.id, { onDelete: 'cascade' }),
    anchors: jsonb('anchors').notNull(),
    offsetMs: integer('offset_ms').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.scoreId, t.audioId] })],
);

/**
 * What a user has paid for (D-010: the server decides). One row per user while a
 * plan is granted; no row, or an expiry in the past, means the free plan. Written by
 * the payment webhook once a MoR provider is chosen, or by hand ('manual') until then.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    plan: text('plan', { enum: ['pro'] }).notNull(),
    source: text('source', { enum: ['manual', 'mor'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Rows are also written by hand (and later by a webhook), so the database checks the values too.
  t => [check('entitlements_plan_check', sql`${t.plan} in ('pro')`), check('entitlements_source_check', sql`${t.source} in ('manual', 'mor')`)],
);
