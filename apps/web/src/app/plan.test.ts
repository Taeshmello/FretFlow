import { describe, expect, it } from 'vitest';
import { clampSpeed, printsFooter, speedPresets, speedRange } from './plan';

describe('plan rules (the server decides the plan, D-010; these only shape the UI)', () => {
  it('slows down to 50% and plays at most at normal speed on the free plan', () => {
    expect(speedRange('free')).toEqual([0.5, 1]);
    expect(clampSpeed('free', 0.25)).toBe(0.5);
    expect(clampSpeed('free', 1.4)).toBe(1);
  });

  it('opens 25–150% on Pro', () => {
    expect(speedRange('pro')).toEqual([0.25, 1.5]);
    expect(clampSpeed('pro', 0.25)).toBe(0.25);
    expect(clampSpeed('pro', 1.5)).toBe(1.5);
    expect(clampSpeed('pro', 2)).toBe(1.5);
  });

  it('offers presets inside the range of each plan', () => {
    for (const plan of ['free', 'pro'] as const) {
      const [min, max] = speedRange(plan);
      expect(speedPresets(plan).every(v => v >= min * 100 && v <= max * 100)).toBe(true);
    }
    expect(speedPresets('pro')).toContain(25);
    expect(speedPresets('pro')).toContain(150);
  });

  it('prints the Made with FretFlow footer on free exports only', () => {
    expect(printsFooter('free')).toBe(true);
    expect(printsFooter('pro')).toBe(false);
  });
});
