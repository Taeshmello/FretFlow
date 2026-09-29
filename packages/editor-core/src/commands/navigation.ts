import type { Score } from '@fretflow/score-model';
import { moveBeat, type Cursor } from '../cursor';
import type { Change } from '../change';
import { appendBarOps } from './bars';

/** Right arrow: next beat, next bar, or a new bar after the last one. */
export function advanceRight(score: Score, cursor: Cursor): { cursor: Cursor; change: Change | null } {
  const moved = moveBeat(score, cursor, 1);
  if (!moved.needsNewBar) {
    return { cursor: moved.cursor, change: null };
  }
  const next = { ...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0 };
  return { cursor: next, change: { ops: appendBarOps(score), label: 'add bar', cursor: next } };
}
