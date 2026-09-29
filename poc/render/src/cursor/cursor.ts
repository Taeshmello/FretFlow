/**
 * Cursor model and movement. Pure on purpose: no DOM, no alphaTab imports, so it
 * can move to packages/editor-core later (CLAUDE.md layering rule).
 *
 * The shapes below are structural, which means alphaTab's own Beat and Note
 * objects satisfy them and can be passed straight through.
 */

export interface CursorNote {
  /** 1-based, 1 = highest string (CLAUDE.md domain rules). */
  string: number;
}

export interface CursorBeat<TNote extends CursorNote = CursorNote> {
  notes: readonly TNote[];
}

export interface CursorBar<TNote extends CursorNote = CursorNote> {
  beats: readonly CursorBeat<TNote>[];
}

export interface CursorScore<TNote extends CursorNote = CursorNote> {
  bars: readonly CursorBar<TNote>[];
  stringCount: number;
}

export interface Cursor {
  /**
   * SPEC 5.1 calls this trackId because our model uses ULIDs. alphaTab addresses
   * tracks by index, so the PoC carries the index under the same role.
   */
  trackIndex: number;
  barIndex: number;
  beatIndex: number;
  string: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Moves across strings. Positive delta goes towards the lowest string. */
export function moveString(score: CursorScore, cursor: Cursor, delta: number): Cursor {
  return { ...cursor, string: clamp(cursor.string + delta, 1, score.stringCount) };
}

/**
 * Moves across beats, crossing into the neighbouring bar at either end.
 * Stops at the start and end of the score; SPEC 5.2 grows a new bar there
 * instead, which belongs to editor-core in W3.
 */
export function moveBeat(score: CursorScore, cursor: Cursor, delta: number): Cursor {
  const bar = score.bars[cursor.barIndex];
  if (!bar) {
    return cursor;
  }

  const target = cursor.beatIndex + delta;
  if (target >= 0 && target < bar.beats.length) {
    return { ...cursor, beatIndex: target };
  }

  const barStep = target < 0 ? -1 : 1;
  const nextBarIndex = cursor.barIndex + barStep;
  const nextBar = score.bars[nextBarIndex];
  if (!nextBar || nextBar.beats.length === 0) {
    return cursor;
  }

  return {
    ...cursor,
    barIndex: nextBarIndex,
    beatIndex: barStep < 0 ? nextBar.beats.length - 1 : 0,
  };
}

export function beatAt<TNote extends CursorNote>(
  score: CursorScore<TNote>,
  cursor: Cursor,
): CursorBeat<TNote> | null {
  return score.bars[cursor.barIndex]?.beats[cursor.beatIndex] ?? null;
}

export function noteAt<TNote extends CursorNote>(
  score: CursorScore<TNote>,
  cursor: Cursor,
): TNote | null {
  return beatAt(score, cursor)?.notes.find(n => n.string === cursor.string) ?? null;
}
