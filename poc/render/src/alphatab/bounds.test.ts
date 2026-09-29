import { describe, expect, it } from 'vitest';
import { toAlphaTabString, toOurString } from './bounds';

describe('string numbering', () => {
  it('maps our highest string to the last string alphaTab counts', () => {
    expect(toAlphaTabString(1, 6)).toBe(6);
    expect(toAlphaTabString(6, 6)).toBe(1);
  });

  it('maps alphaTab string 1 back to our lowest string', () => {
    expect(toOurString(1, 6)).toBe(6);
    expect(toOurString(6, 6)).toBe(1);
  });

  it('round-trips every string of a six string guitar', () => {
    for (let s = 1; s <= 6; s++) {
      expect(toOurString(toAlphaTabString(s, 6), 6)).toBe(s);
    }
  });

  it('works for a four string bass', () => {
    expect(toAlphaTabString(1, 4)).toBe(4);
    expect(toOurString(4, 4)).toBe(1);
  });
});
