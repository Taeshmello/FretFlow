import {
  createBeat,
  deleteOp,
  longerBase,
  setOp,
  shorterBase,
  type Beat,
  type Duration,
  type Op,
  type Score,
} from '@fretflow/score-model';
import { beatsInRange, selectionRange, type Cursor, type Selection } from '../cursor';
import { here, type Change } from '../change';
import { clearBeatOps } from './pitched';

/** Beats a rhythm command applies to: the selection if any, otherwise the cursor beat. */
function targets(score: Score, cursor: Cursor, selection: Selection | null): Beat[] {
  if (selection) {
    return beatsInRange(score, selectionRange(selection)).map(r => r.beat);
  }
  const beat = here(score, cursor).beat;
  return beat ? [beat] : [];
}

function mapDuration(
  score: Score,
  cursor: Cursor,
  selection: Selection | null,
  label: string,
  fn: (d: Duration) => Duration,
): Change | null {
  const ops: Op[] = [];
  for (const beat of targets(score, cursor, selection)) {
    const next = fn(beat.duration);
    if (JSON.stringify(next) !== JSON.stringify(beat.duration)) {
      ops.push(setOp(score, beat.id, ['duration'], next));
    }
  }
  return ops.length ? { ops, label } : null;
}

/** `+`: one step shorter. */
export function shorter(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  return mapDuration(score, cursor, selection, 'shorter', d => ({ ...d, base: shorterBase(d.base) }));
}

/** `-`: one step longer. */
export function longer(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  return mapDuration(score, cursor, selection, 'longer', d => ({ ...d, base: longerBase(d.base) }));
}

/** `.`: dots cycle 0 → 1 → 2 → 0. */
export function cycleDots(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  return mapDuration(score, cursor, selection, 'dots', d => ({ ...d, dots: ((d.dots + 1) % 3) as Duration['dots'] }));
}

export function toggleTuplet(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  const first = targets(score, cursor, selection)[0];
  const on = !first?.duration.tuplet;
  return mapDuration(score, cursor, selection, 'triplet', d => {
    const { tuplet: _drop, ...rest } = d;
    return on ? { ...rest, tuplet: [3, 2] } : rest;
  });
}

export function setDuration(score: Score, cursor: Cursor, selection: Selection | null, base: Duration['base']): Change | null {
  return mapDuration(score, cursor, selection, 'set duration', d => ({ ...d, base }));
}

const TREMOLOS: (Beat['tremolo'])[] = [undefined, 8, 16, 32];

/**
 * `Shift+R`: tremolo picking none → eighths → sixteenths → thirty-seconds → none, or
 * exactly `speed` (null = off) from the panel. Rests are skipped.
 */
export function cycleTremolo(score: Score, cursor: Cursor, selection: Selection | null, speed?: Beat['tremolo'] | null): Change | null {
  const beats = targets(score, cursor, selection).filter(b => !b.rest);
  if (!beats.length) {
    return null;
  }
  const next = speed !== undefined ? (speed ?? undefined) : TREMOLOS[(TREMOLOS.indexOf(beats[0].tremolo) + 1) % TREMOLOS.length];
  return { ops: beats.map(b => setOp(score, b.id, ['tremolo'], next)), label: 'tremolo' };
}

/** `R`: rest on → notes are removed; rest off → an empty beat ready for input. */
export function toggleRest(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  const beats = targets(score, cursor, selection);
  if (!beats.length) {
    return null;
  }
  const makeRest = !beats[0].rest;
  const ops: Op[] = [];
  for (const beat of beats) {
    if (makeRest) {
      ops.push(...clearBeatOps(score, beat));
    }
    if (beat.rest !== makeRest) {
      ops.push(setOp(score, beat.id, ['rest'], makeRest));
    }
  }
  return ops.length ? { ops, label: 'rest' } : null;
}

/** Enter: a new rest beat after the cursor with the same duration, and move to it. */
export function insertBeatAfter(score: Score, cursor: Cursor): Change | null {
  const h = here(score, cursor);
  if (!h.beat) {
    return null;
  }
  const bar = h.track.bars[cursor.barIndex];
  const beat = createBeat(h.beat.duration);
  return {
    ops: [{ t: 'insertNode', kind: 'beat', parentId: bar.id, index: cursor.beatIndex + 1, node: beat }],
    label: 'insert beat',
    cursor: { ...cursor, beatIndex: cursor.beatIndex + 1 },
  };
}

/** Backspace: remove the beat (or selected beats). A bar always keeps one beat. */
export function deleteBeats(score: Score, cursor: Cursor, selection: Selection | null): Change | null {
  const h = here(score, cursor);
  const beats = targets(score, cursor, selection);
  if (!beats.length) {
    return null;
  }
  const ids = new Set(beats.map(b => b.id));
  const ops: Op[] = [];
  for (const bar of h.track.bars) {
    const removing = bar.beats.filter(b => ids.has(b.id));
    if (!removing.length) {
      continue;
    }
    const keep = removing.length === bar.beats.length ? removing[0] : null;
    for (const beat of removing) {
      if (beat === keep) {
        ops.push(...clearBeatOps(score, beat));
        if (!beat.rest) {
          ops.push(setOp(score, beat.id, ['rest'], true));
        }
      } else {
        ops.push(deleteOp(score, beat.id));
      }
    }
  }
  const start = selection ? selectionRange(selection).from : cursor;
  const back = { ...cursor, barIndex: start.barIndex, beatIndex: Math.max(0, start.beatIndex - (selection ? 0 : 1)) };
  return ops.length ? { ops, label: 'delete beat', cursor: back, selection: null } : null;
}
