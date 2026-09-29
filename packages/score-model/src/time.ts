import type { Bar, Duration, DurationBase, MasterBar, Tick } from './types';

export const TICKS_PER_QUARTER = 960;

export const DURATION_BASES: readonly DurationBase[] = [1, 2, 4, 8, 16, 32];

/** Always an integer: 960 is divisible by every dot and triplet combination we allow. */
export function durationToTicks(d: Duration): Tick {
  const plain = (TICKS_PER_QUARTER * 4) / d.base;
  let total = plain;
  let add = plain;
  for (let i = 0; i < d.dots; i++) {
    add /= 2;
    total += add;
  }
  if (d.tuplet) {
    const [n, m] = d.tuplet;
    total = (total * m) / n;
  }
  return Math.round(total);
}

export function barCapacity(masterBar: Pick<MasterBar, 'timeSig'>): Tick {
  const [num, den] = masterBar.timeSig;
  return (num * TICKS_PER_QUARTER * 4) / den;
}

export function barTicks(bar: Pick<Bar, 'beats'>): Tick {
  let sum = 0;
  for (const beat of bar.beats) {
    sum += durationToTicks(beat.duration);
  }
  return sum;
}

export type FillState = 'under' | 'full' | 'over';

/** `remaining` is negative when the bar overflows. */
export function barFill(bar: Pick<Bar, 'beats'>, masterBar: Pick<MasterBar, 'timeSig'>): { state: FillState; remaining: Tick } {
  const remaining = barCapacity(masterBar) - barTicks(bar);
  return { state: remaining > 0 ? 'under' : remaining === 0 ? 'full' : 'over', remaining };
}

/** One step shorter (quarter → eighth). Stays at 32nd. */
export function shorterBase(base: DurationBase): DurationBase {
  const i = DURATION_BASES.indexOf(base);
  return DURATION_BASES[Math.min(i + 1, DURATION_BASES.length - 1)];
}

/** One step longer (eighth → quarter). Stays at whole. */
export function longerBase(base: DurationBase): DurationBase {
  const i = DURATION_BASES.indexOf(base);
  return DURATION_BASES[Math.max(i - 1, 0)];
}

/** Tick offset of every beat from the start of the bar. */
export function beatOffsets(bar: Pick<Bar, 'beats'>): Tick[] {
  const out: Tick[] = [];
  let t = 0;
  for (const beat of bar.beats) {
    out.push(t);
    t += durationToTicks(beat.duration);
  }
  return out;
}
