import { describe, expect, it } from 'vitest';
import { canUseSpeedTrainer, clampSpeed, printsFooter, speedPresets, speedRange } from './plan';

describe('plan rules (the server decides the plan, D-010; these only shape the UI)', () => {
  it('keeps free playback at normal speed', () => {
    expect(speedRange('free')).toEqual([1, 1]);
    expect(clampSpeed('free', 0.25)).toBe(1);
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

  it('unlocks the speed trainer only for the server-provided Pro plan', () => {
    expect(canUseSpeedTrainer('free')).toBe(false);
    expect(canUseSpeedTrainer('pro')).toBe(true);
  });
});
