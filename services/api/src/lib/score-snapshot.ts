import { migrateScore, validateScore, type Score } from '@fretflow/score-model';
import { z } from 'zod';
import { badRequest, HttpError } from './errors.ts';

/** BACKEND.md §4: snapshot jsonb is at most 5MB. */
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'ULID');

const int = z.number().int();

// Shape check before validateScore, which assumes well-typed input. Mirrors
// score-model types.ts; NoteEffects keeps unknown keys (SPEC §3).
const noteSchema = z.object({
  id: z.string().min(1),
  pitch: int,
  string: int,
  fret: int,
  fingeringLocked: z.boolean(),
  tieFromPrev: z.boolean().optional(),
  effects: z.looseObject({}),
  source: z.enum(['user', 'import', 'ai']),
});

const beatSchema = z.object({
  id: z.string().min(1),
  duration: z.object({
    base: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
    dots: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    tuplet: z.tuple([z.literal(3), z.literal(2)]).optional(),
  }),
  rest: z.boolean(),
  notes: z.array(noteSchema),
  text: z.string().optional(),
});

const scoreSchema = z.object({
  schemaVersion: z.literal(1),
  id: idSchema,
  meta: z.object({
    title: z.string().max(500),
    artist: z.string().max(500).optional(),
    composerType: z.enum(['original', 'cover', 'public_domain']),
  }),
  masterBars: z.array(
    z.object({
      id: z.string().min(1),
      timeSig: z.tuple([int, int]),
      keySig: int,
      tempo: z.number().positive().optional(),
      repeatStart: z.boolean().optional(),
      repeatEnd: int.optional(),
      section: z.string().optional(),
    }),
  ),
  tracks: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      instrument: z.enum(['guitar', 'bass']),
      tuning: z.array(int),
      capo: int,
      maxFret: int,
      bars: z.array(z.object({ id: z.string().min(1), masterBarId: z.string().min(1), beats: z.array(beatSchema) })),
    }),
  ),
});

/** A real score nests about 8 levels deep; the headroom is for unknown effect keys. */
export const MAX_SNAPSHOT_DEPTH = 32;

/**
 * Finds what Postgres jsonb or the stack would choke on: nesting deeper than
 * maxDepth, or a NUL character in any string or key (jsonb rejects \u0000).
 * Iterative, so hostile nesting cannot overflow the stack.
 */
export function unsafeJson(value: unknown, maxDepth: number): 'tooDeep' | 'nul' | null {
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (typeof node === 'string') {
      if (node.includes('\u0000')) return 'nul';
      continue;
    }
    if (node === null || typeof node !== 'object') continue;
    if (depth > maxDepth) return 'tooDeep';
    for (const [key, child] of Object.entries(node)) {
      if (key.includes('\u0000')) return 'nul';
      stack.push([child, depth + 1]);
    }
  }
  return null;
}

/** Depth and NUL check (400), size check (413), then migration, shape and domain validation (400). */
export function parseSnapshot(raw: unknown): { score: Score; bytes: number } {
  // Before anything recursive (JSON.stringify, Zod, jsonb serialization) touches it.
  const unsafe = unsafeJson(raw, MAX_SNAPSHOT_DEPTH);
  if (unsafe === 'tooDeep') {
    throw badRequest('Score is nested too deeply');
  }
  if (unsafe === 'nul') {
    throw badRequest('Score contains a NUL character');
  }
  const bytes = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8');
  if (bytes > MAX_SNAPSHOT_BYTES) {
    throw new HttpError(413, 'too_large', 'Snapshot exceeds 5MB');
  }
  let migrated: unknown;
  try {
    migrated = migrateScore(raw);
  } catch {
    throw badRequest('Unsupported score format');
  }
  const shaped = scoreSchema.safeParse(migrated);
  if (!shaped.success) {
    throw badRequest('Score has an invalid shape');
  }
  const score = shaped.data as Score;
  const issues = validateScore(score);
  if (issues.length > 0) {
    throw badRequest(`Score failed validation: ${issues[0].code}`);
  }
  return { score, bytes };
}
