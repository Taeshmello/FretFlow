import { describe, expect, it } from 'vitest';
import { moveBeat, moveString, noteAt, type Cursor, type CursorScore } from './cursor';

// Two bars: the first has two beats, the second has one.
const score: CursorScore = {
  stringCount: 6,
  bars: [
    { beats: [{ notes: [{ string: 6 }, { string: 5 }] }, { notes: [{ string: 3 }] }] },
    { beats: [{ notes: [] }] },
  ],
};

const at = (barIndex: number, beatIndex: number, string: number): Cursor => ({
  trackIndex: 0,
  barIndex,
  beatIndex,
  string,
});

describe('string movement', () => {
  it('moves down to the next string and stops at the lowest string', () => {
    expect(moveString(score, at(0, 0, 5), 1).string).toBe(6);
    expect(moveString(score, at(0, 0, 6), 1).string).toBe(6);
  });

  it('moves up to the previous string and stops at the highest string', () => {
    expect(moveString(score, at(0, 0, 2), -1).string).toBe(1);
    expect(moveString(score, at(0, 0, 1), -1).string).toBe(1);
  });
});

describe('beat movement', () => {
  it('keeps the string when moving to the next beat', () => {
    expect(moveBeat(score, at(0, 0, 4), 1)).toEqual(at(0, 1, 4));
  });

  it('moves to the first beat of the next bar from the last beat of a bar', () => {
    expect(moveBeat(score, at(0, 1, 4), 1)).toEqual(at(1, 0, 4));
  });

  it('moves to the last beat of the previous bar from the first beat of a bar', () => {
    expect(moveBeat(score, at(1, 0, 4), -1)).toEqual(at(0, 1, 4));
  });

  it('stays put at the very first and very last beat of the score', () => {
    expect(moveBeat(score, at(0, 0, 4), -1)).toEqual(at(0, 0, 4));
    expect(moveBeat(score, at(1, 0, 4), 1)).toEqual(at(1, 0, 4));
  });
});

describe('note lookup', () => {
  it('resolves a cursor to the note sitting on that string', () => {
    expect(noteAt(score, at(0, 0, 5))).toEqual({ string: 5 });
  });

  it('resolves a cursor to null when no note sits on that string', () => {
    expect(noteAt(score, at(0, 0, 1))).toBeNull();
    expect(noteAt(score, at(1, 0, 6))).toBeNull();
  });
});
