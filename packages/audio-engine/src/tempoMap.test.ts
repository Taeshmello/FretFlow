import { createScore } from '@fretflow/score-model';
import type { Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { barAtTick, buildTempoMap, expandRepeats, scoreTickToSeconds, secondsToScoreTick } from './tempoMap';

function scoreWith(bars: number, edit: (s: Score) => void): Score {
  const score = createScore({ bars, tempo: 120 });
  edit(score);
  return score;
}

describe('buildTempoMap', () => {
  it('lays out 4/4 bars at 120 BPM two seconds apart', () => {
    const map = buildTempoMap(createScore({ bars: 3, tempo: 120 }));
    expect(map.bars.map(b => b.startTick)).toEqual([0, 3840, 7680]);
    expect(map.bars.map(b => b.startSeconds)).toEqual([0, 2, 4]);
    expect(map.totalSeconds).toBe(6);
  });

  it('applies a tempo change from its bar onward', () => {
    const score = scoreWith(3, s => {
      s.masterBars[1].tempo = 60;
    });
    const map = buildTempoMap(score);
    expect(map.bars.map(b => b.bpm)).toEqual([120, 60, 60]);
    expect(map.bars[2].startSeconds).toBe(6);
    expect(scoreTickToSeconds(map, 3840 + 960)).toBeCloseTo(3);
  });

  it('uses the 6/8 bar length of 2880 ticks', () => {
    const score = scoreWith(3, s => {
      s.masterBars[1].timeSig = [6, 8];
    });
    const map = buildTempoMap(score);
    expect(map.bars.map(b => b.startTick)).toEqual([0, 3840, 6720]);
    expect(map.bars[2].startSeconds).toBeCloseTo(3.5);
  });

  it('round-trips ticks through seconds across a tempo change', () => {
    const score = scoreWith(4, s => {
      s.masterBars[2].tempo = 90;
    });
    const map = buildTempoMap(score);
    for (const tick of [0, 100, 3840, 7680, 8000, 15360, 20000]) {
      expect(secondsToScoreTick(map, scoreTickToSeconds(map, tick))).toBe(tick);
    }
  });

  it('finds the bar that contains a tick', () => {
    const map = buildTempoMap(createScore({ bars: 3 }));
    expect(barAtTick(map, 0)).toBe(0);
    expect(barAtTick(map, 3839)).toBe(0);
    expect(barAtTick(map, 3840)).toBe(1);
    expect(barAtTick(map, 99999)).toBe(2);
    expect(barAtTick(map, -5)).toBe(0);
  });
});

describe('expandRepeats', () => {
  it('plays bars in order when there are no repeats', () => {
    expect(expandRepeats(createScore({ bars: 3 }))).toEqual([0, 1, 2]);
  });

  it('plays a repeated section twice', () => {
    const score = scoreWith(4, s => {
      s.masterBars[1].repeatStart = true;
      s.masterBars[2].repeatEnd = 2;
    });
    expect(expandRepeats(score)).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it('plays a repeated section three times', () => {
    const score = scoreWith(3, s => {
      s.masterBars[0].repeatStart = true;
      s.masterBars[1].repeatEnd = 3;
    });
    expect(expandRepeats(score)).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  it('repeats from the previous repeat end when no start is marked', () => {
    const score = scoreWith(4, s => {
      s.masterBars[0].repeatEnd = 2;
      s.masterBars[2].repeatEnd = 2;
    });
    expect(expandRepeats(score)).toEqual([0, 0, 1, 2, 1, 2, 3]);
  });
});
