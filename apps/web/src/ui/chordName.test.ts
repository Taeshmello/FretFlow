import { describe, expect, it } from 'vitest';
import { nameChord } from './chordName';

describe('nameChord', () => {
  it('names root-position triads', () => {
    expect(nameChord([60, 64, 67])).toBe('C');
    expect(nameChord([57, 60, 64])).toBe('Am');
    expect(nameChord([59, 62, 65])).toBe('Bdim');
    expect(nameChord([60, 64, 68])).toBe('Caug');
    expect(nameChord([62, 67, 69])).toBe('Dsus4');
    expect(nameChord([62, 64, 69])).toBe('Dsus2');
  });

  it('names seventh and sixth chords', () => {
    expect(nameChord([55, 59, 62, 65])).toBe('G7');
    expect(nameChord([60, 64, 67, 71])).toBe('Cmaj7');
    expect(nameChord([57, 60, 64, 67])).toBe('Am7');
    expect(nameChord([59, 62, 65, 69])).toBe('Bm7b5');
    expect(nameChord([60, 64, 67, 69])).toBe('C6');
    expect(nameChord([60, 64, 67, 74])).toBe('Cadd9');
  });

  it('writes inversions as slash chords', () => {
    expect(nameChord([52, 60, 67])).toBe('C/E');
    expect(nameChord([43, 60, 64])).toBe('C/G');
  });

  it('ignores doubled notes and octave spread', () => {
    expect(nameChord([40, 47, 52, 55, 59, 64])).toBe('Em'); // open E minor guitar chord
    expect(nameChord([48, 60, 64, 67, 72])).toBe('C');
  });

  it('names power chords and gives up on fewer than two pitch classes or unknown shapes', () => {
    expect(nameChord([40, 47, 52])).toBe('E5');
    expect(nameChord([60])).toBeNull();
    expect(nameChord([60, 72])).toBeNull();
    expect(nameChord([60, 61, 62])).toBeNull();
  });
});
