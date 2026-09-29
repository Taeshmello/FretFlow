import type { Bar, Beat, Id, Note, Score, Track } from '@fretflow/score-model';

/** Beat-level position in one track. `string` is 1-based, 1 = highest. */
export interface Cursor {
  trackId: Id;
  barIndex: number;
  beatIndex: number;
  string: number;
}

/** Beat range × string range, both ends inclusive. Always inside one track. */
export interface Selection {
  anchor: Cursor;
  head: Cursor;
}

export function trackIndexOf(score: Score, trackId: Id): number {
  const i = score.tracks.findIndex(t => t.id === trackId);
  return i < 0 ? 0 : i;
}

export function cursorTrack(score: Score, cursor: Cursor): Track {
  return score.tracks[trackIndexOf(score, cursor.trackId)];
}

export function cursorBar(score: Score, cursor: Cursor): Bar {
  return cursorTrack(score, cursor).bars[cursor.barIndex];
}

export function cursorBeat(score: Score, cursor: Cursor): Beat | undefined {
  return cursorBar(score, cursor)?.beats[cursor.beatIndex];
}

export function cursorNote(score: Score, cursor: Cursor): Note | undefined {
  return cursorBeat(score, cursor)?.notes.find(n => n.string === cursor.string);
}

export function initialCursor(score: Score): Cursor {
  return { trackId: score.tracks[0].id, barIndex: 0, beatIndex: 0, string: 1 };
}

/** Pulls a cursor back inside the score after bars, beats or tracks were removed. */
export function clampCursor(score: Score, cursor: Cursor): Cursor {
  const track = score.tracks.find(t => t.id === cursor.trackId) ?? score.tracks[0];
  const barIndex = Math.min(Math.max(cursor.barIndex, 0), track.bars.length - 1);
  const beats = track.bars[barIndex].beats.length;
  const beatIndex = Math.min(Math.max(cursor.beatIndex, 0), Math.max(beats - 1, 0));
  const string = Math.min(Math.max(cursor.string, 1), Math.max(1, track.tuning.length));
  return { trackId: track.id, barIndex, beatIndex, string };
}

export function moveString(score: Score, cursor: Cursor, delta: number): Cursor {
  return clampCursor(score, { ...cursor, string: cursor.string + delta });
}

/**
 * Steps one beat. Crosses bar lines; returns `needsNewBar` when stepping right
 * off the very last beat so the caller can append a bar.
 */
export function moveBeat(score: Score, cursor: Cursor, delta: 1 | -1): { cursor: Cursor; needsNewBar: boolean } {
  const track = cursorTrack(score, cursor);
  const bar = track.bars[cursor.barIndex];
  if (delta > 0) {
    if (cursor.beatIndex < bar.beats.length - 1) {
      return { cursor: { ...cursor, beatIndex: cursor.beatIndex + 1 }, needsNewBar: false };
    }
    if (cursor.barIndex < track.bars.length - 1) {
      return { cursor: { ...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0 }, needsNewBar: false };
    }
    return { cursor, needsNewBar: true };
  }
  if (cursor.beatIndex > 0) {
    return { cursor: { ...cursor, beatIndex: cursor.beatIndex - 1 }, needsNewBar: false };
  }
  if (cursor.barIndex > 0) {
    const prev = track.bars[cursor.barIndex - 1];
    return { cursor: { ...cursor, barIndex: cursor.barIndex - 1, beatIndex: prev.beats.length - 1 }, needsNewBar: false };
  }
  return { cursor, needsNewBar: false };
}

export function moveBar(score: Score, cursor: Cursor, delta: number): Cursor {
  return clampCursor(score, { ...cursor, barIndex: cursor.barIndex + delta, beatIndex: 0 });
}

// --- selection --------------------------------------------------------------

export interface BeatRef {
  barIndex: number;
  beatIndex: number;
}

function order(a: BeatRef, b: BeatRef): number {
  return a.barIndex - b.barIndex || a.beatIndex - b.beatIndex;
}

export interface SelectionRange {
  trackId: Id;
  from: BeatRef;
  to: BeatRef;
  /** Inclusive, lowest number first. */
  strings: [number, number];
}

export function selectionRange(sel: Selection): SelectionRange {
  const [from, to] = order(sel.anchor, sel.head) <= 0 ? [sel.anchor, sel.head] : [sel.head, sel.anchor];
  return {
    trackId: sel.anchor.trackId,
    from: { barIndex: from.barIndex, beatIndex: from.beatIndex },
    to: { barIndex: to.barIndex, beatIndex: to.beatIndex },
    strings: [Math.min(sel.anchor.string, sel.head.string), Math.max(sel.anchor.string, sel.head.string)],
  };
}

/** Every beat in the range in score order. */
export function beatsInRange(score: Score, range: SelectionRange): (BeatRef & { beat: Beat })[] {
  const track = score.tracks[trackIndexOf(score, range.trackId)];
  const out: (BeatRef & { beat: Beat })[] = [];
  for (let bi = range.from.barIndex; bi <= range.to.barIndex; bi++) {
    const beats = track.bars[bi]?.beats ?? [];
    const start = bi === range.from.barIndex ? range.from.beatIndex : 0;
    const end = bi === range.to.barIndex ? range.to.beatIndex : beats.length - 1;
    for (let i = start; i <= end && i < beats.length; i++) {
      out.push({ barIndex: bi, beatIndex: i, beat: beats[i] });
    }
  }
  return out;
}

export function isInSelection(sel: Selection | null, barIndex: number, beatIndex: number, string?: number): boolean {
  if (!sel) {
    return false;
  }
  const r = selectionRange(sel);
  const here = { barIndex, beatIndex };
  if (order(here, r.from) < 0 || order(here, r.to) > 0) {
    return false;
  }
  return string === undefined || (string >= r.strings[0] && string <= r.strings[1]);
}
