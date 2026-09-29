import { describe, expect, it } from 'vitest';
import { barCapacity, barFill, beatOffsets, durationToTicks, longerBase, shorterBase } from './time';

describe('durationToTicks', () => {
  it('gives 960 ticks for a quarter note', () => {
    expect(durationToTicks({ base: 4, dots: 0 })).toBe(960);
  });

  it('adds half and then a quarter of the value for dots', () => {
    expect(durationToTicks({ base: 4, dots: 1 })).toBe(1440);
    expect(durationToTicks({ base: 4, dots: 2 })).toBe(1680);
  });

  it('scales triplets by 2/3', () => {
    expect(durationToTicks({ base: 8, dots: 0, tuplet: [3, 2] })).toBe(320);
  });

  it('always returns an integer for every allowed combination', () => {
    for (const base of [1, 2, 4, 8, 16, 32] as const) {
      for (const dots of [0, 1, 2] as const) {
        expect(Number.isInteger(durationToTicks({ base, dots }))).toBe(true);
        expect(Number.isInteger(durationToTicks({ base, dots, tuplet: [3, 2] }))).toBe(true);
      }
    }
  });
});

describe('bar fill', () => {
  const fourFour = { timeSig: [4, 4] as [number, number] };
  const q = { base: 4 as const, dots: 0 as const };

  it('holds 3840 ticks in 4/4 and 2880 in 6/8', () => {
    expect(barCapacity(fourFour)).toBe(3840);
    expect(barCapacity({ timeSig: [6, 8] })).toBe(2880);
  });

  it('reports under, full and over with the remaining ticks', () => {
    expect(barFill({ beats: [{ duration: q }] as never }, fourFour)).toEqual({ state: 'under', remaining: 2880 });
    expect(barFill({ beats: Array(4).fill({ duration: q }) }, fourFour)).toEqual({ state: 'full', remaining: 0 });
    expect(barFill({ beats: Array(5).fill({ duration: q }) }, fourFour)).toEqual({ state: 'over', remaining: -960 });
  });

  it('lists the start tick of each beat', () => {
    expect(beatOffsets({ beats: [{ duration: q }, { duration: { base: 8, dots: 0 } }, { duration: q }] as never })).toEqual([
      0, 960, 1440,
    ]);
  });
});

describe('duration steps', () => {
  it('stops at 32nd when getting shorter and at whole when getting longer', () => {
    expect(shorterBase(4)).toBe(8);
    expect(shorterBase(32)).toBe(32);
    expect(longerBase(8)).toBe(4);
    expect(longerBase(1)).toBe(1);
  });
});
