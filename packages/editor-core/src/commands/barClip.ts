import {
  clone,
  cloneBeat,
  createBar,
  createMasterBar,
  deleteOp,
  insertOp,
  isFretted,
  newId,
  setOp,
  type Beat,
  type Instrument,
  type MasterBar,
  type Op,
  type Score,
  type Track,
} from '@fretflow/score-model';
import { cursorTrack, selectionRange, type Cursor, type Selection } from '../cursor';
import type { Change } from '../change';
import { placeNote } from './clipboard';

/** The master bar fields that travel with copied bars. Tempo and repeats stay where they are. */
type BarLayout = Pick<MasterBar, 'timeSig' | 'keySig' | 'section' | 'width'>;

/** Whole bars of every track, copied with Cmd+C on a bar selection or Copy bar. */
export interface BarClip {
  masterBars: BarLayout[];
  tracks: { instrument: Instrument; tuning: number[]; capo: number; bars: Beat[][] }[];
}

/** First and last bar when the selection covers whole bars of the cursor track (any string range of full beats). */
export function wholeBarRange(score: Score, selection: Selection | null): [number, number] | null {
  if (!selection) {
    return null;
  }
  const r = selectionRange(selection);
  const track = cursorTrack(score, selection.anchor);
  const lastBeat = (track.bars[r.to.barIndex]?.beats.length ?? 0) - 1;
  const allStrings = r.strings[0] === r.strings[1] || (r.strings[0] === 1 && r.strings[1] === track.tuning.length);
  return r.from.beatIndex === 0 && r.to.beatIndex === lastBeat && allStrings ? [r.from.barIndex, r.to.barIndex] : null;
}

export function copyBars(score: Score, from: number, to: number): BarClip {
  const range = score.masterBars.slice(from, to + 1).map((_, i) => from + i);
  return {
    masterBars: range.map(i => {
      const { timeSig, keySig, section, width } = score.masterBars[i];
      return { timeSig: [...timeSig], keySig, ...(section ? { section } : {}), ...(width !== undefined ? { width } : {}) };
    }),
    tracks: score.tracks.map(t => ({
      instrument: t.instrument,
      tuning: [...t.tuning],
      capo: t.capo,
      bars: range.map(i => t.bars[i].beats.map(b => clone(b))),
    })),
  };
}

/**
 * A copied beat for another track: as is on the same instrument and tuning, with
 * pitches kept on another tuning (SPEC §5.5), or emptied on another instrument.
 */
function adaptBeat(beat: Beat, source: BarClip['tracks'][number], target: Track): { beat: Beat; dropped: number } {
  const out = cloneBeat(beat);
  if (target.instrument !== 'piano') {
    delete out.pedal;
  }
  if (source.instrument === target.instrument && (!isFretted(target.instrument) || (source.tuning.join() === target.tuning.join() && source.capo === target.capo))) {
    return { beat: out, dropped: 0 };
  }
  let dropped = (out.keys?.length ?? 0) + (out.hits?.length ?? 0);
  delete out.keys;
  delete out.hits;
  const notes = [];
  if (isFretted(source.instrument) && isFretted(target.instrument)) {
    const taken = new Set<number>();
    for (const n of out.notes) {
      const placed = placeNote(target, n, taken);
      if (placed) {
        taken.add(placed.string);
        notes.push(placed);
      } else {
        dropped++;
      }
    }
  } else {
    dropped += out.notes.length;
  }
  out.notes = notes.sort((a, b) => a.string - b.string);
  out.rest = notes.length === 0;
  return { beat: out, dropped };
}

function layoutOps(score: Score, mb: MasterBar, layout: BarLayout): Op[] {
  const ops: Op[] = [];
  for (const key of ['timeSig', 'keySig', 'section', 'width'] as const) {
    if (JSON.stringify(mb[key]) !== JSON.stringify(layout[key])) {
      ops.push(setOp(score, mb.id, [key], clone(layout[key])));
    }
  }
  return ops;
}

/**
 * Cmd+V: the copied bars replace the bars from the cursor bar on, adding bars
 * past the end. Cmd+Shift+V (`insert`): they go in as new bars before the cursor
 * bar. Each copied track lands on the track with the same index.
 */
export function pasteBars(score: Score, cursor: Cursor, clip: BarClip, insert: boolean): { change: Change; dropped: number } {
  const ops: Op[] = [];
  let dropped = 0;
  clip.masterBars.forEach((layout, k) => {
    const index = cursor.barIndex + k;
    const existing = insert ? undefined : score.masterBars[index];
    let mb: MasterBar;
    if (existing) {
      mb = existing;
      ops.push(...layoutOps(score, existing, layout));
    } else {
      mb = { ...createMasterBar(layout.timeSig, layout.keySig), ...(layout.section ? { section: layout.section } : {}), ...(layout.width !== undefined ? { width: layout.width } : {}) };
      ops.push(insertOp('masterBar', null, index, mb));
    }
    score.tracks.forEach((track, t) => {
      const source = clip.tracks[t];
      const beats = (source?.bars[k] ?? []).map(b => {
        const adapted = adaptBeat(b, source, track);
        dropped += adapted.dropped;
        return adapted.beat;
      });
      if (!existing) {
        ops.push(insertOp('bar', track.id, index, beats.length ? { id: newId(), masterBarId: mb.id, beats } : createBar(mb)));
      } else if (beats.length) {
        const bar = track.bars[index];
        // Delete ops carry their index, so remove from the end.
        [...bar.beats].reverse().forEach(b => ops.push(deleteOp(score, b.id)));
        beats.forEach((b, i) => ops.push(insertOp('beat', bar.id, i, b)));
      }
    });
  });
  return {
    change: { ops, label: insert ? 'insert bars' : 'paste bars', cursor: { ...cursor, beatIndex: 0 }, selection: null },
    dropped,
  };
}

/**
 * Shift+Cmd+←/→: grows or shrinks the selection one whole bar at a time. A new
 * selection starts at the cursor bar's first beat (→) or last beat (←).
 */
export function extendByBar(score: Score, cursor: Cursor, selection: Selection | null, delta: 1 | -1): Selection {
  const track = cursorTrack(score, cursor);
  const last = (bar: number) => Math.max(0, (track.bars[bar]?.beats.length ?? 1) - 1);
  const anchor = selection?.anchor ?? { ...cursor, beatIndex: delta > 0 ? 0 : last(cursor.barIndex) };
  const head = selection?.head ?? { ...cursor, beatIndex: delta > 0 ? 0 : last(cursor.barIndex) };
  const lastBar = track.bars.length - 1;
  let { barIndex, beatIndex } = head;
  if (delta > 0) {
    if (beatIndex === 0 && barIndex < anchor.barIndex) {
      barIndex++;
    } else if (beatIndex < last(barIndex)) {
      beatIndex = last(barIndex);
    } else if (barIndex < lastBar) {
      barIndex++;
      beatIndex = last(barIndex);
    }
  } else if (beatIndex === last(barIndex) && barIndex > anchor.barIndex) {
    barIndex--;
    beatIndex = last(barIndex);
  } else if (beatIndex > 0) {
    beatIndex = 0;
  } else if (barIndex > 0) {
    barIndex--;
  }
  return { anchor, head: { ...head, barIndex, beatIndex } };
}
