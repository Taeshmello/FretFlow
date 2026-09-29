import { describe, expect, it } from 'vitest';
import { computePeakLevels, computePeaks, mergePeaks, requestPeaks } from './peaks';

describe('computePeaks', () => {
  it('merges min and max across two channels per bucket', () => {
    const left = new Float32Array([0.1, -0.5, 0.2, 0.9, 0, 0]);
    const right = new Float32Array([0.3, 0.1, -0.8, 0.2, 0.4, -0.1]);
    const peaks = computePeaks([left, right], 2);
    expect(Array.from(peaks.min)).toEqual([-0.5, -0.8, -0.1].map(Math.fround));
    expect(Array.from(peaks.max)).toEqual([0.3, 0.9, 0.4].map(Math.fround));
  });

  it('keeps a partial last bucket', () => {
    const peaks = computePeaks([new Float32Array([1, 2, 3, 4, 5])], 2);
    expect(Array.from(peaks.max)).toEqual([2, 4, 5]);
  });

  it('returns empty peaks for empty audio', () => {
    expect(computePeaks([], 100).min).toHaveLength(0);
  });
});

describe('computePeakLevels', () => {
  it('produces about 100 fine and 10 coarse peaks per second', () => {
    const second = new Float32Array(44100).map((_, i) => Math.sin(i / 10));
    const levels = computePeakLevels([second], 44100);
    expect(levels.fine.min).toHaveLength(100);
    expect(levels.coarse.min).toHaveLength(10);
  });

  it('builds the coarse level with the same extremes as the fine one', () => {
    const fine = computePeaks([new Float32Array([0, -1, 2, 0, 0, 3])], 1);
    const coarse = mergePeaks(fine, 3);
    expect(Array.from(coarse.min)).toEqual([-1, 0]);
    expect(Array.from(coarse.max)).toEqual([2, 3]);
    expect(coarse.samplesPerPeak).toBe(3);
  });
});

describe('requestPeaks', () => {
  it('falls back to synchronous computation when Worker is unavailable', async () => {
    const levels = await requestPeaks([new Float32Array(8000)], 8000);
    expect(levels.fine.min).toHaveLength(100);
  });
});
