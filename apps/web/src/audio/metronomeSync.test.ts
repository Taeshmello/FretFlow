import { buildTempoMap, syncMapFromScore, syncMapFromTapTempo } from '@fretflow/audio-engine';
import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { beatMapMeter, nextBarLine } from './metronomeSync';

describe('beat-map metronome', () => {
  const score = createScore({ bars: 4, tempo: 120 });
  const tempo = buildTempoMap(score);

  it('clicks at the score tempo when the map was built from the score', () => {
    const meter = beatMapMeter(syncMapFromScore(score, 1), tempo, 1)(0);
    expect(meter.bpm).toBeCloseTo(120);
    expect(meter.timeSig).toEqual([4, 4]);
  });

  it('follows a tapped tempo that differs from the score', () => {
    const tapped = syncMapFromTapTempo(0, [0, 0.6, 1.2, 1.8]);
    expect(tapped).not.toBeNull();
    expect(beatMapMeter(tapped!.map, tempo, 1)(2).bpm).toBeCloseTo(100);
  });

  it('slows the clicks down with the playback rate', () => {
    expect(beatMapMeter(syncMapFromScore(score, 0), tempo, 0.5)(1).bpm).toBeCloseTo(60);
  });

  it('starts on the next bar line, in wall-clock time at the current rate', () => {
    const map = syncMapFromScore(score, 1); // bar 1 at 1s, bar 2 at 3s
    expect(nextBarLine(map, tempo, 1.5, 1)).toEqual({ bar: 1, inSeconds: 1.5 });
    expect(nextBarLine(map, tempo, 1.5, 0.5)).toEqual({ bar: 1, inSeconds: 3 });
    expect(nextBarLine(map, tempo, 1, 1)).toEqual({ bar: 0, inSeconds: 0 });
  });
});
