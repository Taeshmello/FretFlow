import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { loopFromBars, loopFromTickRange, normalizeLoop, shouldWrap, snapTickRangeToBars } from './loop';
import { syncMapFromScore } from './syncMap';
import { buildTempoMap } from './tempoMap';

describe('normalizeLoop', () => {
  it('swaps reversed ends and clamps to the file length', () => {
    expect(normalizeLoop({ start: 12, end: -1 }, 10)).toEqual({ start: 0, end: 10 });
  });

  it('rejects a loop shorter than the minimum', () => {
    expect(normalizeLoop({ start: 1, end: 1.01 })).toBeNull();
  });
});

describe('shouldWrap', () => {
  const loop = { start: 2, end: 4 };

  it('wraps when the end is within the lookahead', () => {
    expect(shouldWrap(3.98, loop, 0.03)).toBe(true);
  });

  it('does not wrap in the middle of the loop', () => {
    expect(shouldWrap(3, loop, 0.03)).toBe(false);
  });

  it('wraps when playback has already passed the end', () => {
    expect(shouldWrap(4.2, loop, 0.03)).toBe(true);
  });

  it('does not wrap before the loop start', () => {
    expect(shouldWrap(1, { start: 2, end: 2.01 }, 0.05)).toBe(false);
  });
});

describe('bar-snapped loops', () => {
  const score = createScore({ bars: 4, tempo: 120 });
  const tempo = buildTempoMap(score);
  const sync = syncMapFromScore(score, 1);

  it('expands a tick range outward to whole bars', () => {
    expect(snapTickRangeToBars(tempo, 4000, 5000)).toEqual([3840, 7680]);
    expect(snapTickRangeToBars(tempo, 3840, 7680)).toEqual([3840, 7680]);
  });

  it('converts a bar range to audio seconds through the sync map', () => {
    expect(loopFromBars(sync, tempo, 1, 2)).toEqual({ start: 3, end: 7 });
  });

  it('converts a selection to a snapped loop', () => {
    expect(loopFromTickRange(sync, tempo, 100, 200)).toEqual({ start: 1, end: 3 });
  });
});
