import { syncMapFromScore } from '@fretflow/audio-engine';
import { createScore } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { synthOffsetMs, synthCorrection } from './synthSync';

describe('audio ↔ synth sync', () => {
  const score = createScore({ bars: 8, tempo: 120 });
  const map = syncMapFromScore(score, 0); // 120 BPM: 1 quarter (960 ticks) = 0.5 s

  it('measures how far the synth is ahead of the recording in wall-clock ms', () => {
    // Audio at 1.0 s = tick 1920. Synth at tick 1980 = 60 ticks = 31.25 ms ahead.
    expect(synthOffsetMs(map, 1.0, 1980, 1)).toBeCloseTo(31.25);
    expect(synthOffsetMs(map, 1.0, 1860, 1)).toBeCloseTo(-31.25);
  });

  it('stretches the offset in wall-clock time when playback is slowed down', () => {
    expect(synthOffsetMs(map, 1.0, 1980, 0.5)).toBeCloseTo(62.5);
  });

  it('leaves the synth alone within the 20 ms tolerance', () => {
    expect(synthCorrection(map, 1.0, 1920 + 30, 1)).toBeNull();
  });

  it('moves the synth to the recording position when it drifts past the tolerance', () => {
    expect(synthCorrection(map, 1.0, 1990, 1)).toBe(1920);
    expect(synthCorrection(map, 1.0, 1850, 1)).toBe(1920);
  });
});
