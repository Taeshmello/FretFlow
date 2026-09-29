import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clone, createBeat, createNote, createScore } from './create';
import { findBeat, findNote } from './locate';
import { applyOps, deleteOp, insertOp, invert, moveOp, OpError, setOp, type Op, type Transaction } from './ops';
import { pitchOf } from './pitch';
import type { Score } from './types';
import { validateScore } from './validate';

const tx = (ops: Op[]): Transaction => ({ id: 'tx', ops, label: 'test', at: 0 });

function scoreWithNote() {
  const score = createScore({ bars: 2 });
  const track = score.tracks[0];
  const beat = track.bars[0].beats[0];
  const note = createNote(track, 1, 3);
  const withNote = applyOps(score, [
    setOp(score, beat.id, ['rest'], false),
    insertOp('note', beat.id, 0, note),
  ]);
  return { score: withNote, track, beat, note };
}

describe('applyOps', () => {
  it('does not mutate the input score', () => {
    const { score, note } = scoreWithNote();
    const before = clone(score);
    applyOps(score, [setOp(score, note.id, ['fret'], 5)]);
    expect(score).toEqual(before);
  });

  it('inserts, updates and deletes nodes by id', () => {
    const { score, beat, note } = scoreWithNote();
    expect(findNote(score, note.id)?.fret).toBe(3);
    const updated = applyOps(score, [setOp(score, note.id, ['fret'], 7)]);
    expect(findNote(updated, note.id)?.fret).toBe(7);
    const deleted = applyOps(updated, [deleteOp(updated, note.id)]);
    expect(findBeat(deleted, beat.id)?.notes).toEqual([]);
  });

  it('removes a key when setProp sets undefined', () => {
    const { score, note } = scoreWithNote();
    const withEffect = applyOps(score, [setOp(score, note.id, ['effects', 'palmMute'], true)]);
    expect(findNote(withEffect, note.id)?.effects).toEqual({ palmMute: true });
    const cleared = applyOps(withEffect, [setOp(withEffect, note.id, ['effects', 'palmMute'], undefined)]);
    expect(findNote(cleared, note.id)?.effects).toEqual({});
  });

  it('refuses to change a node id', () => {
    const { score, note } = scoreWithNote();
    expect(() => applyOps(score, [{ t: 'setProp', id: note.id, path: ['id'], value: 'x', prev: note.id }])).toThrow(OpError);
  });

  it('throws for an unknown parent', () => {
    const score = createScore();
    expect(() => applyOps(score, [insertOp('beat', 'missing', 0, createBeat())])).toThrow(OpError);
  });

  it('moves a beat between bars and back through invert', () => {
    const score = createScore({ bars: 2 });
    const [bar0, bar1] = score.tracks[0].bars;
    const moving = bar0.beats[1];
    const op = moveOp(score, moving.id, bar1.id, 0);
    const moved = applyOps(score, [op]);
    expect(moved.tracks[0].bars[1].beats[0].id).toBe(moving.id);
    expect(moved.tracks[0].bars[0].beats).toHaveLength(3);
    expect(applyOps(moved, invert(tx([op])).ops)).toEqual(score);
  });

  it('edits score meta through the score id', () => {
    const score = createScore();
    const renamed = applyOps(score, [setOp(score, score.id, ['meta', 'title'], 'Riff')]);
    expect(renamed.meta.title).toBe('Riff');
  });
});

// Builds a random but valid op from the current score, driven by fast-check integers.
function randomOp(score: Score, pick: number[]): Op | null {
  const [a, b, c, d] = pick;
  const track = score.tracks[0];
  const bar = track.bars[a % track.bars.length];
  const kind = b % 5;
  if (kind === 0) {
    return insertOp('beat', bar.id, c % (bar.beats.length + 1), createBeat({ base: 8, dots: 0 }));
  }
  if (bar.beats.length === 0) {
    return null;
  }
  const beat = bar.beats[c % bar.beats.length];
  if (kind === 1 && bar.beats.length > 1) {
    return deleteOp(score, beat.id);
  }
  if (kind === 2) {
    const string = (d % track.tuning.length) + 1;
    const existing = beat.notes.find(n => n.string === string);
    if (existing) {
      const fret = d % 25;
      return setOp(score, existing.id, ['fret'], fret);
    }
    return insertOp('note', beat.id, beat.notes.length, createNote(track, string, d % 25));
  }
  if (kind === 3 && beat.notes.length > 0) {
    return deleteOp(score, beat.notes[d % beat.notes.length].id);
  }
  if (kind === 4) {
    const target = track.bars[d % track.bars.length];
    const targetLength = target.id === bar.id ? bar.beats.length - 1 : target.beats.length;
    return moveOp(score, beat.id, target.id, c % (targetLength + 1));
  }
  return setOp(score, beat.id, ['duration', 'dots'], (d % 3) as 0 | 1 | 2);
}

describe('invert', () => {
  it('restores the original score after any sequence of random ops', () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.nat(1000), { minLength: 4, maxLength: 4 }), { maxLength: 40 }), picks => {
        const original = createScore({ bars: 3 });
        let score = original;
        const txs: Transaction[] = [];
        for (const pick of picks) {
          const op = randomOp(score, pick);
          if (!op) {
            continue;
          }
          score = applyOps(score, [op]);
          txs.push(tx([op]));
        }
        for (const t of txs.reverse()) {
          score = applyOps(score, invert(t).ops);
        }
        expect(score).toEqual(original);
      }),
      { numRuns: 200 },
    );
  });

  it('inverts a multi-op transaction in reverse order', () => {
    const { score, note } = scoreWithNote();
    const ops = [setOp(score, note.id, ['fret'], 5), setOp(score, note.id, ['pitch'], pitchOf(score.tracks[0], 1, 5))];
    const edited = applyOps(score, ops);
    expect(applyOps(edited, invert(tx(ops)).ops)).toEqual(score);
    expect(validateScore(edited)).toEqual([]);
  });
});
