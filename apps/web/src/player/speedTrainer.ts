export interface TrainerConfig {
  startPercent: number;
  targetPercent: number;
  stepPercent: number;
}

export interface TrainerState {
  active: boolean;
  completed: boolean;
  currentPercent: number;
  loops: number;
}

export const DEFAULT_TRAINER: TrainerConfig = { startPercent: 60, targetPercent: 100, stepPercent: 5 };

/** Keep the training recipe within the Pro rate range. Integer percentages avoid drift. */
export function validTrainerConfig(c: TrainerConfig): boolean {
  return Number.isInteger(c.startPercent) && Number.isInteger(c.targetPercent) && Number.isInteger(c.stepPercent)
    && c.startPercent >= 25 && c.targetPercent <= 150 && c.startPercent < c.targetPercent
    && c.stepPercent >= 5 && c.stepPercent <= 25;
}

export function beginTrainer(c: TrainerConfig): TrainerState | null {
  return validTrainerConfig(c) ? { active: true, completed: false, currentPercent: c.startPercent, loops: 0 } : null;
}

/** Each completed repetition increases the rate; the final pass stays at the target. */
export function advanceTrainer(state: TrainerState, c: TrainerConfig, cycles = 1): TrainerState {
  if (!state.active || cycles <= 0 || !validTrainerConfig(c)) return state;
  const currentPercent = Math.min(c.targetPercent, state.currentPercent + c.stepPercent * cycles);
  return {
    active: currentPercent < c.targetPercent,
    completed: currentPercent >= c.targetPercent,
    currentPercent,
    loops: state.loops + cycles,
  };
}

/** A backwards jump must cross the loop boundary, not merely be a small seek. */
export function crossedLoopBoundary(previous: number | null, current: number, start: number, end: number): boolean {
  if (previous === null || ![previous, current, start, end].every(Number.isFinite) || end <= start) return false;
  const margin = Math.min(960, (end - start) / 2);
  return previous > current && previous >= end - margin && current <= start + margin;
}
