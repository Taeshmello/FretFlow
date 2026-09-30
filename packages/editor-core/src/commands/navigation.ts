import { barFill, createBeat, DURATION_BASES, durationToTicks, type Duration, type Score } from '@fretflow/score-model';
import { cursorTrack, moveBeat, type Cursor } from '../cursor';
import type { Change } from '../change';
import { appendBarOps } from './bars';

/**
 * Length of a beat added at the end of a bar with `remaining` ticks left: the previous
 * beat's duration (SPEC §5.4) when it fits, else the longest plain duration that does.
 */
function fittingDuration(previous: Duration, remaining: number): Duration | null {
  if (durationToTicks(previous) <= remaining) {
    return previous;
  }
  const base = DURATION_BASES.find(b => durationToTicks({ base: b, dots: 0 }) <= remaining);
  return base ? { base, dots: 0 } : null;
}

/**
 * Right arrow: next beat. From the last beat of a bar that still has room, a new rest
 * beat is added in the same bar; from a full bar it goes to the next bar, adding one
 * after the last bar.
 */
export function advanceRight(score: Score, cursor: Cursor): { cursor: Cursor; change: Change | null } {
  const bar = cursorTrack(score, cursor).bars[cursor.barIndex];
  const last = bar?.beats[bar.beats.length - 1];
  const masterBar = score.masterBars[cursor.barIndex];
  if (bar && last && masterBar && cursor.beatIndex === bar.beats.length - 1) {
    const { remaining } = barFill(bar, masterBar);
    const duration = remaining > 0 ? fittingDuration(last.duration, remaining) : null;
    if (duration) {
      const next = { ...cursor, beatIndex: cursor.beatIndex + 1 };
      const beat = createBeat(duration);
      return { cursor: next, change: { ops: [{ t: 'insertNode', kind: 'beat', parentId: bar.id, index: bar.beats.length, node: beat }], label: 'add beat', cursor: next } };
    }
  }
  const moved = moveBeat(score, cursor, 1);
  if (!moved.needsNewBar) {
    return { cursor: moved.cursor, change: null };
  }
  const next = { ...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0 };
  return { cursor: next, change: { ops: appendBarOps(score), label: 'add bar', cursor: next } };
}
