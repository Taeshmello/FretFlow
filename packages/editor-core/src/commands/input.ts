import { createNote, deleteOp, insertOp, pitchOf, setOp, type Id, type Op, type Score } from '@fretflow/score-model';
import { cursorNote, type Cursor } from '../cursor';
import { here, type Change, type Settings } from '../change';
import { advanceRight } from './navigation';

/** Remembers the first digit so a second one within the window can make a two-digit fret. */
export interface PendingDigit {
  at: number;
  /** Cell the first digit went into. */
  cell: Cursor;
  beatId: Id;
  /** Where the cursor was left, so auto-advance still lets a second digit combine. */
  after: Cursor;
  digit: number;
}

const sameCursor = (a: Cursor, b: Cursor) =>
  a.trackId === b.trackId && a.barIndex === b.barIndex && a.beatIndex === b.beatIndex && a.string === b.string;

/** Ops that put `fret` on the cursor's string: overwrite, add to chord, and clear a rest. */
export function setFretOps(score: Score, cursor: Cursor, fret: number): Op[] {
  const h = here(score, cursor);
  if (!h.beat) {
    return [];
  }
  const ops: Op[] = [];
  if (h.beat.rest) {
    ops.push(setOp(score, h.beat.id, ['rest'], false));
  }
  const existing = cursorNote(score, cursor);
  if (existing) {
    ops.push(setOp(score, existing.id, ['fret'], fret));
    ops.push(setOp(score, existing.id, ['pitch'], pitchOf(h.track, cursor.string, fret)));
    ops.push(setOp(score, existing.id, ['fingeringLocked'], true));
  } else {
    // Keep chords sorted from string 1 down so the notes array is stable.
    const index = h.beat.notes.filter(n => n.string < cursor.string).length;
    ops.push(insertOp('note', h.beat.id, index, createNote(h.track, cursor.string, fret)));
  }
  return ops;
}

/**
 * SPEC §5.3: a digit is entered immediately; a second digit on the same cell
 * within the window makes a two-digit fret when it fits, otherwise it replaces.
 */
export function enterFretDigit(
  score: Score,
  cursor: Cursor,
  digit: number,
  now: number,
  pending: PendingDigit | null,
  settings: Settings,
): { change: Change | null; pending: PendingDigit | null } {
  const h = here(score, cursor);
  if (!h.beat || digit < 0 || digit > 9) {
    return { change: null, pending: null };
  }
  if (pending && sameCursor(pending.after, cursor) && now - pending.at <= settings.digitWindowMs) {
    const combined = pending.digit * 10 + digit;
    const fret = combined <= h.track.maxFret ? combined : digit;
    return {
      change: { ops: setFretOps(score, pending.cell, fret), label: 'enter fret', merge: true, cursor },
      pending: null,
    };
  }
  const change: Change = { ops: setFretOps(score, cursor, digit), label: 'enter fret' };
  if (settings.advanceAfterInput) {
    const moved = advanceRight(score, cursor);
    change.cursor = moved.cursor;
    if (moved.change) {
      change.ops.push(...moved.change.ops);
    }
  }
  return { change, pending: { at: now, cell: cursor, beatId: h.beat.id, after: change.cursor ?? cursor, digit } };
}

/** Delete: removes the note on the cursor's string. The beat turns into a rest when it was the last note. */
export function deleteNote(score: Score, cursor: Cursor): Change | null {
  const h = here(score, cursor);
  const note = cursorNote(score, cursor);
  if (!h.beat || !note) {
    return null;
  }
  const ops: Op[] = [deleteOp(score, note.id)];
  if (h.beat.notes.length === 1) {
    ops.push(setOp(score, h.beat.id, ['rest'], true));
  }
  return { ops, label: 'delete note' };
}

/** Sets a fret on an explicit string (fretboard click). Moves the cursor to that string. */
export function placeFret(score: Score, cursor: Cursor, string: number, fret: number): Change | null {
  const h = here(score, cursor);
  if (!h.beat || fret < 0 || fret > h.track.maxFret || string < 1 || string > h.track.tuning.length) {
    return null;
  }
  const at = { ...cursor, string };
  return { ops: setFretOps(score, at, fret), label: 'place fret', cursor: at };
}
