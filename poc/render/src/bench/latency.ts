export const SAMPLE_LIMIT = 100;

export interface Sample {
  /** Key press to the frame after the render pipeline reported completion. */
  total: number;
  /** Key press to postRenderFinished, so paint cost can be told apart from render cost. */
  render: number;
}

/** Appends a sample, dropping the oldest ones once the limit is reached. */
export function pushSample(samples: readonly Sample[], sample: Sample, limit = SAMPLE_LIMIT): Sample[] {
  const next = [...samples, sample];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Nearest-rank percentile. Returns NaN for an empty set so the UI can show a placeholder. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index];
}
