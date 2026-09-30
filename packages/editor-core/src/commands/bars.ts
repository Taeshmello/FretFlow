import {
  BAR_WIDTH_MAX,
  BAR_WIDTH_MIN,
  cloneBeat,
  createBar,
  createMasterBar,
  deleteOp,
  insertOp,
  newId,
  setOp,
  type MasterBar,
  type Op,
  type Score,
} from '@fretflow/score-model';
import type { Cursor } from '../cursor';
import type { Change } from '../change';

/** New master bar that continues the time and key signature of `like`, without tempo or repeats. */
function continuing(like: MasterBar | undefined): MasterBar {
  return createMasterBar(like?.timeSig ?? [4, 4], like?.keySig ?? 0);
}

/** Inserts an empty bar at `index` in the master bars and in every track. */
export function insertBarOps(score: Score, index: number): Op[] {
  const mb = continuing(score.masterBars[Math.max(0, index - 1)] ?? score.masterBars[0]);
  const ops: Op[] = [insertOp('masterBar', null, index, mb)];
  for (const track of score.tracks) {
    ops.push(insertOp('bar', track.id, index, createBar(mb)));
  }
  return ops;
}

export function appendBarOps(score: Score): Op[] {
  return insertBarOps(score, score.masterBars.length);
}

export function insertBar(score: Score, cursor: Cursor, after: boolean): Change {
  const index = cursor.barIndex + (after ? 1 : 0);
  return {
    ops: insertBarOps(score, index),
    label: 'insert bar',
    cursor: { ...cursor, barIndex: index, beatIndex: 0 },
  };
}

export function deleteBar(score: Score, cursor: Cursor): Change | null {
  if (score.masterBars.length <= 1) {
    return null;
  }
  const i = cursor.barIndex;
  const mb = score.masterBars[i];
  const ops: Op[] = score.tracks.map(t => deleteOp(score, t.bars[i].id));
  // The first bar must keep a tempo, so hand it over before the bar goes.
  const next = score.masterBars[i + 1];
  if (i === 0 && mb.tempo !== undefined && next && next.tempo === undefined) {
    ops.push(setOp(score, next.id, ['tempo'], mb.tempo));
  }
  ops.push(deleteOp(score, mb.id));
  return { ops, label: 'delete bar', cursor: { ...cursor, barIndex: Math.max(0, i - (i >= score.masterBars.length - 1 ? 1 : 0)), beatIndex: 0 } };
}

export function duplicateBar(score: Score, cursor: Cursor): Change {
  const i = cursor.barIndex;
  const src = score.masterBars[i];
  const mb: MasterBar = { ...continuing(src), ...(src.section ? { section: src.section } : {}) };
  const ops: Op[] = [insertOp('masterBar', null, i + 1, mb)];
  for (const track of score.tracks) {
    const bar = track.bars[i];
    ops.push(insertOp('bar', track.id, i + 1, { id: newId(), masterBarId: mb.id, beats: bar.beats.map(cloneBeat) }));
  }
  return { ops, label: 'duplicate bar', cursor: { ...cursor, barIndex: i + 1, beatIndex: 0 } };
}

export function toggleRepeatStart(score: Score, cursor: Cursor): Change {
  const mb = score.masterBars[cursor.barIndex];
  return { ops: [setOp(score, mb.id, ['repeatStart'], mb.repeatStart ? undefined : true)], label: 'repeat start' };
}

/** Cycles the repeat end: none → ×2 → ×3 → ×4 → none. */
export function cycleRepeatEnd(score: Score, cursor: Cursor): Change {
  const mb = score.masterBars[cursor.barIndex];
  const next = mb.repeatEnd === undefined ? 2 : mb.repeatEnd >= 4 ? undefined : mb.repeatEnd + 1;
  return { ops: [setOp(score, mb.id, ['repeatEnd'], next)], label: 'repeat end' };
}

export type MasterBarProp = 'timeSig' | 'keySig' | 'tempo' | 'section' | 'width';

export function setMasterBarProp(score: Score, barIndex: number, prop: MasterBarProp, value: unknown): Change | null {
  const mb = score.masterBars[barIndex];
  if (!mb) {
    return null;
  }
  if (prop === 'tempo' && barIndex === 0 && value === undefined) {
    return null;
  }
  if (prop === 'timeSig') {
    const [n, d] = value as [number, number];
    if (!Number.isInteger(n) || n < 1 || n > 32 || ![1, 2, 4, 8, 16, 32].includes(d)) {
      return null;
    }
  }
  if (prop === 'keySig' && (typeof value !== 'number' || value < -7 || value > 7)) {
    return null;
  }
  if (prop === 'tempo' && value !== undefined && (typeof value !== 'number' || value < 20 || value > 400)) {
    return null;
  }
  if (prop === 'width') {
    if (value !== undefined && (typeof value !== 'number' || value < BAR_WIDTH_MIN || value > BAR_WIDTH_MAX)) {
      return null;
    }
    // Natural width is the default, so it is stored as no value.
    value = value === 1 ? undefined : value;
  }
  return { ops: [setOp(score, mb.id, [prop], value === '' ? undefined : value)], label: `set ${prop}` };
}

/** First tempo at or before `barIndex`. */
export function tempoAt(score: Score, barIndex: number): number {
  for (let i = Math.min(barIndex, score.masterBars.length - 1); i >= 0; i--) {
    const t = score.masterBars[i].tempo;
    if (t !== undefined) {
      return t;
    }
  }
  return 120;
}
