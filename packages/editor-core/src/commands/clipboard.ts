import {
  clone,
  createBeat,
  deleteOp,
  fretFor,
  insertOp,
  newId,
  setOp,
  type Beat,
  type Duration,
  type Note,
  type Op,
  type Score,
  type Track,
} from '@fretflow/score-model';
import { beatsInRange, cursorTrack, selectionRange, type Cursor, type Selection } from '../cursor';
import type { Change } from '../change';

/** Copied beats with only the notes inside the copied string range. */
export interface Clip {
  beats: { duration: Duration; rest: boolean; notes: Note[]; text?: string }[];
  strings: [number, number];
  tuning: number[];
  capo: number;
  /** Every string was copied, so pasting inserts whole beats. */
  wholeBeats: boolean;
}

export function copy(score: Score, selection: Selection | null, cursor: Cursor): Clip | null {
  const sel = selection ?? { anchor: cursor, head: cursor };
  const range = selectionRange(sel);
  const track = cursorTrack(score, sel.anchor);
  // A selection that never left one string is a beat range; only a vertical extent picks strings.
  const singleString = range.strings[0] === range.strings[1];
  const wholeBeats = selection === null || singleString || (range.strings[0] === 1 && range.strings[1] === track.tuning.length);
  const strings: [number, number] = wholeBeats ? [1, track.tuning.length] : range.strings;
  const beats = beatsInRange(score, range).map(({ beat }) => {
    const notes = beat.notes.filter(n => n.string >= strings[0] && n.string <= strings[1]).map(n => clone(n));
    return { duration: clone(beat.duration), rest: beat.rest && notes.length === 0, notes, ...(beat.text ? { text: beat.text } : {}) };
  });
  return beats.length ? { beats, strings, tuning: [...track.tuning], capo: track.capo, wholeBeats } : null;
}

/** Ctrl+X: copy, then clear the notes (whole-beat cuts remove the beats). */
export function cut(score: Score, selection: Selection | null, cursor: Cursor): { clip: Clip | null; change: Change | null } {
  const clip = copy(score, selection, cursor);
  if (!clip) {
    return { clip: null, change: null };
  }
  const range = selectionRange(selection ?? { anchor: cursor, head: cursor });
  const ops: Op[] = [];
  for (const { beat } of beatsInRange(score, range)) {
    const removing = beat.notes.filter(n => n.string >= clip.strings[0] && n.string <= clip.strings[1]);
    removing.forEach(n => ops.push(deleteOp(score, n.id)));
    if (removing.length && removing.length === beat.notes.length) {
      ops.push(setOp(score, beat.id, ['rest'], true));
    }
  }
  return { clip, change: ops.length ? { ops, label: 'cut', selection: null } : null };
}

/**
 * Keeps pitch when tunings differ (SPEC §5.5): same string with a recomputed
 * fret, or the nearest free string where it fits.
 */
export function placeNote(target: Track, note: Note, taken: Set<number>): Note | null {
  const order = [...Array(target.tuning.length).keys()]
    .map(i => i + 1)
    .sort((a, b) => Math.abs(a - note.string) - Math.abs(b - note.string));
  for (const string of order) {
    if (taken.has(string)) {
      continue;
    }
    const fret = fretFor(target, string, note.pitch);
    if (fret !== null) {
      return { ...clone(note), id: newId(), string, fret };
    }
  }
  return null;
}

function realise(target: Track, clipBeat: Clip['beats'][number], stringShift: number): { notes: Note[]; dropped: number } {
  const taken = new Set<number>();
  const notes: Note[] = [];
  let dropped = 0;
  for (const n of clipBeat.notes) {
    const shifted = { ...n, string: n.string + stringShift };
    const placed = placeNote(target, shifted, taken);
    if (placed) {
      taken.add(placed.string);
      notes.push(placed);
    } else {
      dropped++;
    }
  }
  notes.sort((a, b) => a.string - b.string);
  return { notes, dropped };
}

/**
 * Ctrl+V. Whole-beat clips are inserted before the cursor beat; partial
 * string clips overwrite those strings on the beats from the cursor on.
 */
export function paste(score: Score, cursor: Cursor, clip: Clip): { change: Change | null; dropped: number } {
  const track = cursorTrack(score, cursor);
  const bar = track.bars[cursor.barIndex];
  const ops: Op[] = [];
  let dropped = 0;

  if (clip.wholeBeats) {
    clip.beats.forEach((cb, i) => {
      const { notes, dropped: d } = realise(track, cb, 0);
      dropped += d;
      const beat: Beat = { ...createBeat(cb.duration, notes.length === 0), notes, ...(cb.text ? { text: cb.text } : {}) };
      ops.push(insertOp('beat', bar.id, cursor.beatIndex + i, beat));
    });
    const last = { ...cursor, beatIndex: cursor.beatIndex + clip.beats.length - 1 };
    return { change: { ops, label: 'paste', cursor: last, selection: null }, dropped };
  }

  // Partial: the top copied string lands on the cursor string.
  const shift = cursor.string - clip.strings[0];
  let bi = cursor.barIndex;
  let i = cursor.beatIndex;
  for (const cb of clip.beats) {
    while (bi < track.bars.length && i >= track.bars[bi].beats.length) {
      bi++;
      i = 0;
    }
    const beat = track.bars[bi]?.beats[i];
    if (!beat) {
      dropped += cb.notes.length;
      continue;
    }
    const { notes, dropped: d } = realise(track, cb, shift);
    dropped += d;
    const lo = clip.strings[0] + shift;
    const hi = clip.strings[1] + shift;
    const replaced = (n: Note) => (n.string >= lo && n.string <= hi) || notes.some(x => x.string === n.string);
    beat.notes.filter(replaced).forEach(n => ops.push(deleteOp(score, n.id)));
    const merged = [...beat.notes.filter(n => !replaced(n)), ...notes].sort((a, b) => a.string - b.string);
    // Inserting in ascending string order means every earlier slot is already filled.
    notes.forEach(n => ops.push(insertOp('note', beat.id, merged.indexOf(n), n)));
    const nowRest = merged.length === 0;
    if (beat.rest !== nowRest) {
      ops.push(setOp(score, beat.id, ['rest'], nowRest));
    }
    i++;
  }
  return { change: ops.length ? { ops, label: 'paste', selection: null } : null, dropped };
}
