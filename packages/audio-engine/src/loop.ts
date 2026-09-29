import type { Tick } from '@fretflow/score-model';
import { tickToSeconds } from './syncMap';
import type { SyncMap } from './syncMap';
import { barAtTick } from './tempoMap';
import type { TempoMap } from './tempoMap';

/** A-B loop in seconds of the audio file. */
export interface LoopRegion {
  start: number;
  end: number;
}

/** Shorter loops are rejected: a 10ms crossfade on each side needs room. */
export const MIN_LOOP_SECONDS = 0.05;

/**
 * Orders the ends, clamps to [0, duration] and returns null when the loop is too short.
 * `duration` may be omitted when the file length is not known yet.
 */
export function normalizeLoop(loop: LoopRegion, duration?: number, minLength = MIN_LOOP_SECONDS): LoopRegion | null {
  let start = Math.min(loop.start, loop.end);
  let end = Math.max(loop.start, loop.end);
  start = Math.max(0, start);
  if (duration !== undefined) {
    end = Math.min(end, duration);
  }
  return end - start >= minLength ? { start, end } : null;
}

/**
 * True when playback is inside the loop and will reach its end within `lookaheadSec`,
 * so the fade-out must start now. A position before the loop (after a manual seek) never
 * wraps; a position past the end does, so a late timer still brings playback back.
 */
export function shouldWrap(currentTime: number, loop: LoopRegion, lookaheadSec: number): boolean {
  return currentTime >= loop.start && currentTime >= loop.end - lookaheadSec;
}

/** Expands [startTick, endTick) outward to whole bars. */
export function snapTickRangeToBars(tempo: TempoMap, startTick: Tick, endTick: Tick): [Tick, Tick] {
  const lo = Math.min(startTick, endTick);
  const hi = Math.max(startTick, endTick);
  const first = barAtTick(tempo, lo);
  if (first === -1) {
    return [lo, hi];
  }
  const last = barAtTick(tempo, Math.max(lo, hi - 1));
  const lastBar = tempo.bars[last];
  return [tempo.bars[first].startTick, lastBar.startTick + lastBar.ticks];
}

/** Loop over bars `firstBar..lastBar` (inclusive) in audio seconds. */
export function loopFromBars(syncMap: SyncMap, tempo: TempoMap, firstBar: number, lastBar: number): LoopRegion | null {
  const a = tempo.bars[Math.min(firstBar, lastBar)];
  const b = tempo.bars[Math.max(firstBar, lastBar)];
  if (!a || !b) {
    return null;
  }
  const bpm = a.bpm;
  return normalizeLoop({
    start: tickToSeconds(syncMap, a.startTick, bpm),
    end: tickToSeconds(syncMap, b.startTick + b.ticks, bpm),
  });
}

/** Loop from a tick range (e.g. a selection), snapped to whole bars unless `snap` is false. */
export function loopFromTickRange(
  syncMap: SyncMap,
  tempo: TempoMap,
  startTick: Tick,
  endTick: Tick,
  snap = true,
): LoopRegion | null {
  const [a, b] = snap ? snapTickRangeToBars(tempo, startTick, endTick) : [startTick, endTick];
  const bpm = tempo.bars[Math.max(0, barAtTick(tempo, a))]?.bpm;
  return normalizeLoop({ start: tickToSeconds(syncMap, a, bpm), end: tickToSeconds(syncMap, b, bpm) });
}
