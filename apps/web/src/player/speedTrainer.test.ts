import { describe, expect, it } from 'vitest';
import { advanceTrainer, beginTrainer, crossedLoopBoundary, DEFAULT_TRAINER, validTrainerConfig } from './speedTrainer';

describe('Pro speed trainer', () => {
  it('starts at the chosen rate and adds one step per completed loop', () => {
    const first = beginTrainer(DEFAULT_TRAINER);
    expect(first).toEqual({ active: true, completed: false, currentPercent: 60, loops: 0 });
    expect(advanceTrainer(first!, DEFAULT_TRAINER)).toEqual({ active: true, completed: false, currentPercent: 65, loops: 1 });
  });

  it('stops increasing at the target without overshooting or floating-point drift', () => {
    const config = { startPercent: 60, targetPercent: 100, stepPercent: 15 };
    const reached = advanceTrainer(beginTrainer(config)!, config, 3);
    expect(reached).toEqual({ active: false, completed: true, currentPercent: 100, loops: 3 });
    expect(advanceTrainer(reached, config)).toBe(reached);
  });

  it('rejects reversed or out-of-plan settings', () => {
    expect(validTrainerConfig({ startPercent: 100, targetPercent: 60, stepPercent: 5 })).toBe(false);
    expect(beginTrainer({ startPercent: 20, targetPercent: 100, stepPercent: 5 })).toBeNull();
    expect(beginTrainer({ startPercent: 60, targetPercent: 151, stepPercent: 5 })).toBeNull();
  });

  it('counts only a jump across the loop edge', () => {
    expect(crossedLoopBoundary(3700, 100, 0, 3840)).toBe(true);
    expect(crossedLoopBoundary(2000, 100, 0, 3840)).toBe(false);
    expect(crossedLoopBoundary(3700, 2500, 0, 3840)).toBe(false);
    expect(crossedLoopBoundary(null, 100, 0, 3840)).toBe(false);
    expect(crossedLoopBoundary(900, 100, 0, 960)).toBe(true);
    expect(crossedLoopBoundary(900, 100, 960, 0)).toBe(false);
  });
});
