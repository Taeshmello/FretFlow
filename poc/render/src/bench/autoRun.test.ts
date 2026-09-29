import { describe, expect, it } from 'vitest';
import { advanceAutoRun, nextDigit, startAutoRun, summarize } from './autoRun';
import type { Sample } from './latency';

describe('auto run', () => {
  it('asks for the first edit as soon as it starts', () => {
    const { step } = startAutoRun({ samples: 3, warmup: 0 });
    expect(step).toBe('edit');
  });

  it('schedules the next edit only after the previous render has finished', () => {
    const { run } = startAutoRun({ samples: 3, warmup: 0 });
    const after = advanceAutoRun(run);
    expect(after.step).toBe('edit');
    expect(after.run.recorded).toBe(1);
  });

  it('stops after the requested number of samples', () => {
    let { run } = startAutoRun({ samples: 3, warmup: 0 });
    const steps: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = advanceAutoRun(run);
      run = next.run;
      steps.push(next.step);
    }
    expect(steps).toEqual(['edit', 'edit', 'done']);
  });

  it('discards warm-up renders before counting samples', () => {
    let { run } = startAutoRun({ samples: 2, warmup: 2 });
    const kept: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const next = advanceAutoRun(run);
      kept.push(next.keep);
      run = next.run;
    }
    expect(kept).toEqual([false, false, true, true]);
    expect(run.recorded).toBe(2);
  });
});

describe('nextDigit', () => {
  it('cycles fret values so every edit actually changes the score', () => {
    for (let fret = 0; fret <= 24; fret++) {
      const digit = nextDigit(fret);
      expect(digit).toMatch(/^[0-9]$/);
      expect(Number(digit)).not.toBe(fret);
    }
  });
});

describe('summarize', () => {
  it('rounds percentiles to 0.1ms so results are readable on a device', () => {
    const result = summarize([{ total: 19.599999999976717, render: 17.899999999965075 }], '', '');
    expect(result.totalP95).toBe(19.6);
    expect(result.renderP95).toBe(17.9);
  });

  it('produces a result summary with p50, p95, sample count and conditions', () => {
    const samples: Sample[] = [10, 20, 30, 40].map(n => ({ total: n, render: n / 2 }));
    const result = summarize(samples, 'partial · svg', 'iPad UA');
    expect(result).toEqual({
      samples: 4,
      totalP50: 20,
      totalP95: 40,
      renderP50: 10,
      renderP95: 20,
      conditions: 'partial · svg',
      userAgent: 'iPad UA',
    });
  });
});
