import { describe, expect, it } from 'vitest';
import { mixGains } from './crossfader';

describe('mixGains', () => {
  it('plays only the original audio at 0', () => {
    expect(mixGains(0)).toEqual({ audio: 1, synth: 0 });
  });

  it('plays only the synth at 1', () => {
    expect(mixGains(1)).toEqual({ audio: 0, synth: 1 });
  });

  it('keeps equal power at the midpoint', () => {
    const { audio, synth } = mixGains(0.5);
    expect(audio).toBeCloseTo(Math.SQRT1_2);
    expect(synth).toBeCloseTo(Math.SQRT1_2);
    expect(audio ** 2 + synth ** 2).toBeCloseTo(1);
  });

  it('clamps values outside 0..1', () => {
    expect(mixGains(-1)).toEqual(mixGains(0));
    expect(mixGains(2)).toEqual(mixGains(1));
  });
});
