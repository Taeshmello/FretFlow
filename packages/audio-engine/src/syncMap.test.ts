import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import {
  addAnchor,
  moveAnchor,
  removeAnchor,
  secondsToTick,
  syncMapFromScore,
  syncMapFromTapTempo,
  tickToSeconds,
} from './syncMap';
import type { SyncMap } from './syncMap';

const map: SyncMap = {
  anchors: [
    { tick: 0, seconds: 1 },
    { tick: 3840, seconds: 3 },
    { tick: 7680, seconds: 4 },
  ],
  offsetMs: 0,
};

describe('tickToSeconds / secondsToTick', () => {
  it('interpolates linearly between two anchors', () => {
    expect(tickToSeconds(map, 1920)).toBeCloseTo(2);
    expect(tickToSeconds(map, 5760)).toBeCloseTo(3.5);
  });

  it('round-trips ticks through seconds', () => {
    for (const tick of [0, 1, 480, 3839, 3840, 5000, 7680, 9000, -200]) {
      expect(secondsToTick(map, tickToSeconds(map, tick))).toBe(tick);
    }
  });

  it('extrapolates past the last anchor with the last segment slope', () => {
    expect(tickToSeconds(map, 11520)).toBeCloseTo(5);
    expect(secondsToTick(map, 5)).toBe(11520);
  });

  it('extrapolates before the first anchor with the first segment slope', () => {
    expect(tickToSeconds(map, -1920)).toBeCloseTo(0);
  });

  it('uses the fallback BPM when there is a single anchor', () => {
    const one: SyncMap = { anchors: [{ tick: 0, seconds: 2 }], offsetMs: 0 };
    expect(tickToSeconds(one, 960, 60)).toBeCloseTo(3);
    expect(secondsToTick(one, 4, 60)).toBe(1920);
  });

  it('shifts audio time by offsetMs in both directions', () => {
    const shifted = { ...map, offsetMs: 50 };
    expect(tickToSeconds(shifted, 0)).toBeCloseTo(1.05);
    expect(secondsToTick(shifted, 1.05)).toBe(0);
  });

  it('always returns integer ticks', () => {
    expect(Number.isInteger(secondsToTick(map, 1.23456))).toBe(true);
  });
});

describe('anchor editing', () => {
  it('inserts an anchor in tick order', () => {
    const next = addAnchor(map, { tick: 1920, seconds: 2.2 });
    expect(next.anchors.map(a => a.tick)).toEqual([0, 1920, 3840, 7680]);
  });

  it('replaces an anchor at the same tick', () => {
    const next = addAnchor(map, { tick: 3840, seconds: 3.1 });
    expect(next.anchors).toHaveLength(3);
    expect(next.anchors[1].seconds).toBe(3.1);
  });

  it('rejects an anchor that would make seconds non-monotonic', () => {
    expect(addAnchor(map, { tick: 1920, seconds: 3.5 })).toBe(map);
    expect(addAnchor(map, { tick: 1920, seconds: 1 })).toBe(map);
  });

  it('clamps a dragged anchor strictly between its neighbours', () => {
    const next = moveAnchor(map, 3840, 10);
    expect(next.anchors[1].seconds).toBeLessThan(4);
    expect(next.anchors[1].seconds).toBeGreaterThan(1);
    const back = moveAnchor(map, 3840, 0);
    expect(back.anchors[1].seconds).toBeGreaterThan(1);
  });

  it('removes an anchor by tick', () => {
    expect(removeAnchor(map, 3840).anchors.map(a => a.tick)).toEqual([0, 7680]);
    expect(removeAnchor(map, 42)).toBe(map);
  });
});

describe('syncMapFromTapTempo', () => {
  it('estimates the tempo from the median interval and ignores an outlier tap', () => {
    // 0.5s beats = 120 BPM, with one late tap at 2.3 instead of 2.0.
    const result = syncMapFromTapTempo(1, [1, 1.5, 2.3, 2.5, 3, 3.5, 4]);
    expect(result).not.toBeNull();
    expect(result?.bpm).toBeCloseTo(120, 0);
    expect(result?.map.anchors[0]).toEqual({ tick: 0, seconds: 1 });
  });

  it('converts dotted-quarter taps to a quarter-note BPM', () => {
    const result = syncMapFromTapTempo(0, [0, 1, 2, 3], 1440);
    expect(result?.bpm).toBeCloseTo(90);
  });

  it('returns null with fewer than two taps', () => {
    expect(syncMapFromTapTempo(0, [1])).toBeNull();
  });
});

describe('syncMapFromScore', () => {
  it('pins every bar line to the score tempo from the first downbeat', () => {
    const score = createScore({ bars: 3, tempo: 120 });
    const m = syncMapFromScore(score, 0.5);
    expect(m.anchors.map(a => a.tick)).toEqual([0, 3840, 7680, 11520]);
    expect(m.anchors.map(a => a.seconds)).toEqual([0.5, 2.5, 4.5, 6.5]);
  });
});
