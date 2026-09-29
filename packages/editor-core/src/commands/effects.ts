import { setOp, type NoteEffects, type Op, type Score } from '@fretflow/score-model';
import { beatsInRange, cursorNote, selectionRange, type Cursor, type Selection } from '../cursor';
import type { Change } from '../change';

type EffectKey = 'hammerPull' | 'palmMute' | 'dead' | 'letRing' | 'vibrato' | 'slide' | 'bend';

/** Notes an effect applies to: every note in the selection's string range, or the cursor note. */
function targetNotes(score: Score, cursor: Cursor, selection: Selection | null) {
  if (selection) {
    const r = selectionRange(selection);
    return beatsInRange(score, r).flatMap(({ beat }) =>
      beat.notes.filter(n => n.string >= r.strings[0] && n.string <= r.strings[1]),
    );
  }
  const note = cursorNote(score, cursor);
  return note ? [note] : [];
}

function cycleEffect<K extends EffectKey>(
  score: Score,
  cursor: Cursor,
  selection: Selection | null,
  key: K,
  next: (current: NoteEffects[K]) => NoteEffects[K],
): Change | null {
  const notes = targetNotes(score, cursor, selection);
  if (!notes.length) {
    return null;
  }
  // All targets follow the first note so a mixed selection ends up uniform.
  const value = next(notes[0].effects[key]);
  const ops: Op[] = notes.map(n => setOp(score, n.id, ['effects', key], value));
  return { ops, label: key };
}

const toggle = (v: boolean | undefined) => (v ? undefined : true);

export const toggleHammer = (s: Score, c: Cursor, sel: Selection | null) => cycleEffect(s, c, sel, 'hammerPull', toggle);
export const togglePalmMute = (s: Score, c: Cursor, sel: Selection | null) => cycleEffect(s, c, sel, 'palmMute', toggle);
export const toggleDead = (s: Score, c: Cursor, sel: Selection | null) => cycleEffect(s, c, sel, 'dead', toggle);
export const toggleLetRing = (s: Score, c: Cursor, sel: Selection | null) => cycleEffect(s, c, sel, 'letRing', toggle);
export const toggleVibrato = (s: Score, c: Cursor, sel: Selection | null) =>
  cycleEffect(s, c, sel, 'vibrato', v => (v ? undefined : 'slight'));

const SLIDES: (NoteEffects['slide'])[] = [undefined, 'legato', 'shift', 'in', 'out'];
/** `S`: none → legato → shift → in → out → none. */
export const cycleSlide = (s: Score, c: Cursor, sel: Selection | null) =>
  cycleEffect(s, c, sel, 'slide', v => SLIDES[(SLIDES.indexOf(v) + 1) % SLIDES.length]);

type Bend = NoteEffects['bend'];
const BENDS: Bend[] = [undefined, { type: 'bend', amount: 1 }, { type: 'bend', amount: 0.5 }, { type: 'release', amount: 1 }];
/** `B`: full → ½ → release → none. */
export const cycleBend = (s: Score, c: Cursor, sel: Selection | null) =>
  cycleEffect(s, c, sel, 'bend', v => {
    const i = BENDS.findIndex(b => JSON.stringify(b) === JSON.stringify(v));
    return BENDS[(i + 1) % BENDS.length];
  });

/** Exact effect value from the inspector. */
export function setEffect<K extends EffectKey>(
  score: Score,
  cursor: Cursor,
  selection: Selection | null,
  key: K,
  value: NoteEffects[K],
): Change | null {
  return cycleEffect(score, cursor, selection, key, () => value);
}

/** `T`: tie from the previous note on the same string. The pitch follows that note. */
export function toggleTie(score: Score, cursor: Cursor): Change | null {
  const note = cursorNote(score, cursor);
  if (!note) {
    return null;
  }
  if (note.tieFromPrev) {
    return { ops: [setOp(score, note.id, ['tieFromPrev'], undefined)], label: 'tie' };
  }
  const prev = previousNoteOnString(score, cursor);
  const ops: Op[] = [setOp(score, note.id, ['tieFromPrev'], true)];
  if (prev && prev.fret !== note.fret) {
    ops.push(setOp(score, note.id, ['fret'], prev.fret), setOp(score, note.id, ['pitch'], prev.pitch));
  }
  return { ops, label: 'tie' };
}

function previousNoteOnString(score: Score, cursor: Cursor) {
  const track = score.tracks.find(t => t.id === cursor.trackId);
  if (!track) {
    return undefined;
  }
  let bi = cursor.barIndex;
  let i = cursor.beatIndex - 1;
  while (bi >= 0) {
    const beats = track.bars[bi].beats;
    for (; i >= 0; i--) {
      const n = beats[i].notes.find(x => x.string === cursor.string);
      if (n) {
        return n;
      }
    }
    bi--;
    i = bi >= 0 ? track.bars[bi].beats.length - 1 : -1;
  }
  return undefined;
}
