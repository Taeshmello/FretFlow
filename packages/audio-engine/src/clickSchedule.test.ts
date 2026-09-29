import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { beatSeconds, countInClicks, meterFromTempoMap, scheduleClicks } from './clickSchedule';
import { buildTempoMap } from './tempoMap';

describe('scheduleClicks', () => {
  it('accents beat one and advances bars in 3/4', () => {
    const provider = () => ({ bpm: 120, timeSig: [3, 4] as [number, number] });
    const { clicks, cursor } = scheduleClicks({ bar: 0, beat: 0, time: 0 }, 2, provider);
    expect(clicks.map(c => c.accent)).toEqual([true, false, false, true]);
    expect(cursor).toEqual({ bar: 1, beat: 1, time: 2 });
  });

  it('follows a tempo change at the next bar', () => {
    const map = buildTempoMap(
      (() => {
        const s = createScore({ bars: 2, tempo: 120 });
        s.masterBars[1].tempo = 60;
        return s;
      })(),
    );
    const { clicks } = scheduleClicks({ bar: 0, beat: 0, time: 0 }, 3.5, meterFromTempoMap(map));
    expect(clicks.map(c => c.time)).toEqual([0, 0.5, 1, 1.5, 2, 3]);
  });

  it('clicks on every eighth in 6/8', () => {
    expect(beatSeconds({ bpm: 120, timeSig: [6, 8] })).toBeCloseTo(0.25);
  });
});

describe('countInClicks', () => {
  it('plays one full bar and reports when the music starts', () => {
    const { clicks, endTime } = countInClicks(1, 1, () => ({ bpm: 60, timeSig: [4, 4] }));
    expect(clicks).toHaveLength(4);
    expect(endTime).toBe(5);
  });
});
