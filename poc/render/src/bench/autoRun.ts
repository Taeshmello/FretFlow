import { percentile, type Sample } from './latency';

/**
 * Drives a fixed number of edits without a keyboard, so devices like an iPad
 * without a hardware keyboard can be measured. Pure state; the shell dispatches
 * the actual key events.
 */
export interface AutoRun {
  /** Samples to keep once warm-up is over. */
  target: number;
  /** Renders still to discard before samples count (JIT, font and layout caches). */
  warmupLeft: number;
  recorded: number;
}

export type AutoRunStep = 'edit' | 'done';

export function startAutoRun(options: { samples: number; warmup: number }): { run: AutoRun; step: AutoRunStep } {
  const run = { target: options.samples, warmupLeft: options.warmup, recorded: 0 };
  return { run, step: options.samples > 0 ? 'edit' : 'done' };
}

/** Call once per finished render. `keep` says whether that render's sample counts. */
export function advanceAutoRun(run: AutoRun): { run: AutoRun; step: AutoRunStep; keep: boolean } {
  if (run.warmupLeft > 0) {
    return { run: { ...run, warmupLeft: run.warmupLeft - 1 }, step: 'edit', keep: false };
  }
  const recorded = run.recorded + 1;
  return { run: { ...run, recorded }, step: recorded >= run.target ? 'done' : 'edit', keep: true };
}

/** A digit key that differs from the current fret, so the edit is never a no-op. */
export function nextDigit(currentFret: number): string {
  const digit = currentFret >= 0 && currentFret <= 9 ? (currentFret + 1) % 10 : 0;
  return String(digit);
}

export interface AutoRunResult {
  samples: number;
  totalP50: number;
  totalP95: number;
  renderP50: number;
  renderP95: number;
  conditions: string;
  userAgent: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function summarize(samples: readonly Sample[], conditions: string, userAgent: string): AutoRunResult {
  const totals = samples.map(s => s.total);
  const renders = samples.map(s => s.render);
  return {
    samples: samples.length,
    totalP50: round1(percentile(totals, 50)),
    totalP95: round1(percentile(totals, 95)),
    renderP50: round1(percentile(renders, 50)),
    renderP95: round1(percentile(renders, 95)),
    conditions,
    userAgent,
  };
}
