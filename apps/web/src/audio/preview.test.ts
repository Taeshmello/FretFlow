import { describe, expect, it } from 'vitest';
import { midiToHz } from './preview';

describe('note preview', () => {
  it('converts MIDI pitch to frequency with A4 = 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(40)).toBeCloseTo(82.41, 1); // low E string
  });
});
