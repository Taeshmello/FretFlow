import { describe, expect, it } from 'vitest';
import { percentile, pushSample, type Sample } from './latency';

const sample = (n: number): Sample => ({ total: n, render: n });

describe('latency samples', () => {
  it('keeps only the newest samples once the limit is reached', () => {
    let samples: Sample[] = [];
    for (let i = 1; i <= 5; i++) {
      samples = pushSample(samples, sample(i), 3);
    }
    expect(samples.map(s => s.total)).toEqual([3, 4, 5]);
  });

  it('leaves the sample list untouched below the limit', () => {
    const samples = pushSample([sample(1)], sample(2), 3);
    expect(samples.map(s => s.total)).toEqual([1, 2]);
  });
});

describe('percentile', () => {
  it('returns NaN for an empty sample set', () => {
    expect(percentile([], 95)).toBeNaN();
  });

  it('returns the single value for every percentile of a one-sample set', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('picks the nearest-rank value for p50 and p95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
  });

  it('sorts before ranking so input order does not matter', () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
  });
});
