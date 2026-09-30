import { describe, expect, it } from 'vitest';
import { clampRate, MIN_RATE, RATE_CEILING, RATE_FLOOR } from './audioTrackPlayer';

describe('playback rate limits', () => {
  it('keeps the rate inside the player range', () => {
    expect(clampRate(0.3, [MIN_RATE, 1])).toBe(0.5);
    expect(clampRate(1.2, [MIN_RATE, 1])).toBe(1);
    expect(clampRate(0.25, [RATE_FLOOR, RATE_CEILING])).toBe(0.25);
    expect(clampRate(1.5, [RATE_FLOOR, RATE_CEILING])).toBe(1.5);
  });

  it('never goes past the API floor and ceiling whatever range is asked for', () => {
    expect(clampRate(0.1, [0.05, 4])).toBe(RATE_FLOOR);
    expect(clampRate(3, [0.05, 4])).toBe(RATE_CEILING);
  });
});
