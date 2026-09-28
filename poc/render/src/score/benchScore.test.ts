import { describe, expect, it } from 'vitest';
import { BENCH_BAR_COUNT, buildScore, countNotes } from './benchScore';

describe('benchmark score', () => {
  it('builds a 200 bar score from alphaTex', () => {
    const { score } = buildScore('alphaTex');
    expect(score.masterBars).toHaveLength(BENCH_BAR_COUNT);
    expect(score.tracks[0].staves[0].bars).toHaveLength(BENCH_BAR_COUNT);
  });

  it('builds a 200 bar score by cloning model objects', () => {
    const { score } = buildScore('modelClone');
    expect(score.masterBars).toHaveLength(BENCH_BAR_COUNT);
    expect(score.tracks[0].staves[0].bars).toHaveLength(BENCH_BAR_COUNT);
  });

  it('gives both builders the same number of notes', () => {
    expect(countNotes(buildScore('modelClone').score)).toBe(countNotes(buildScore('alphaTex').score));
  });

  it('keeps standard tuning after cloning the model', () => {
    expect(buildScore('modelClone').score.tracks[0].staves[0].tuning).toEqual([64, 59, 55, 50, 45, 40]);
  });
});
