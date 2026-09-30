import {
  createDrumHit,
  createKeyNote,
  deleteOp,
  DRUM_ORDER,
  insertOp,
  PIANO_HIGH,
  PIANO_LOW,
  setOp,
  type Beat,
  type DrumPiece,
  type Op,
  type Score,
} from '@fretflow/score-model';
import type { Cursor } from '../cursor';
import { here, type Change } from '../change';

/** Removes every note, key and hit of a beat (for rests, Delete and cuts). */
export function clearBeatOps(score: Score, beat: Beat): Op[] {
  return [...beat.notes, ...(beat.keys ?? []), ...(beat.hits ?? [])].map(n => deleteOp(score, n.id));
}

/** Notes of any instrument on this beat. */
export function soundingCount(beat: Beat): number {
  return beat.notes.length + (beat.keys?.length ?? 0) + (beat.hits?.length ?? 0);
}

/** Piano: add the pitch to the cursor beat's chord, or take it away if it is there. */
export function togglePitch(score: Score, cursor: Cursor, pitch: number): Change | null {
  const h = here(score, cursor);
  if (!h.beat || h.track.instrument !== 'piano' || !Number.isInteger(pitch) || pitch < PIANO_LOW || pitch > PIANO_HIGH) {
    return null;
  }
  const keys = h.beat.keys ?? [];
  const existing = keys.find(k => k.pitch === pitch);
  if (existing) {
    const ops: Op[] = [deleteOp(score, existing.id)];
    if (keys.length === 1) {
      ops.push(setOp(score, h.beat.id, ['rest'], true));
    }
    return { ops, label: 'remove key' };
  }
  const ops: Op[] = [];
  if (h.beat.rest) {
    ops.push(setOp(score, h.beat.id, ['rest'], false));
  }
  ops.push(insertOp('key', h.beat.id, keys.filter(k => k.pitch < pitch).length, createKeyNote(pitch)));
  return { ops, label: 'add key' };
}

/** Piano ↑/↓: move the whole chord by semitones. Refuses to leave the 88-key range. */
export function transposeKeys(score: Score, cursor: Cursor, delta: number): Change | null {
  const h = here(score, cursor);
  const keys = h.beat?.keys ?? [];
  if (h.track.instrument !== 'piano' || !keys.length || delta === 0) {
    return null;
  }
  if (keys.some(k => k.pitch + delta < PIANO_LOW || k.pitch + delta > PIANO_HIGH)) {
    return null;
  }
  return { ops: keys.map(k => setOp(score, k.id, ['pitch'], k.pitch + delta)), label: 'transpose' };
}

/** Drums: add or remove a kit piece on the cursor beat (kept in kit order). */
export function toggleHit(score: Score, cursor: Cursor, piece: DrumPiece): Change | null {
  const h = here(score, cursor);
  if (!h.beat || h.track.instrument !== 'drums' || !DRUM_ORDER.includes(piece)) {
    return null;
  }
  const hits = h.beat.hits ?? [];
  const existing = hits.find(x => x.piece === piece);
  if (existing) {
    const ops: Op[] = [deleteOp(score, existing.id)];
    if (hits.length === 1) {
      ops.push(setOp(score, h.beat.id, ['rest'], true));
    }
    return { ops, label: 'remove hit' };
  }
  const ops: Op[] = [];
  if (h.beat.rest) {
    ops.push(setOp(score, h.beat.id, ['rest'], false));
  }
  const rank = DRUM_ORDER.indexOf(piece);
  ops.push(insertOp('hit', h.beat.id, hits.filter(x => DRUM_ORDER.indexOf(x.piece) < rank).length, createDrumHit(piece)));
  return { ops, label: 'add hit' };
}

/** Drums: normal → accent → ghost → normal for one piece on the cursor beat. */
export function cycleHitDynamic(score: Score, cursor: Cursor, piece: DrumPiece): Change | null {
  const hit = here(score, cursor).beat?.hits?.find(h => h.piece === piece);
  if (!hit) {
    return null;
  }
  const next = hit.dynamic === undefined ? 'accent' : hit.dynamic === 'accent' ? 'ghost' : undefined;
  return { ops: [setOp(score, hit.id, ['dynamic'], next)], label: 'drum dynamic' };
}

/** Piano P: pedal down → pedal up → no mark on the cursor beat. */
export function cyclePedal(score: Score, cursor: Cursor): Change | null {
  const h = here(score, cursor);
  if (!h.beat || h.track.instrument !== 'piano') {
    return null;
  }
  const next = h.beat.pedal === undefined ? 'down' : h.beat.pedal === 'down' ? 'up' : undefined;
  return { ops: [setOp(score, h.beat.id, ['pedal'], next)], label: 'pedal' };
}

/** The beat before the cursor in the same track, across bar lines. */
function previousBeat(score: Score, cursor: Cursor): Beat | undefined {
  const track = score.tracks.find(t => t.id === cursor.trackId);
  if (!track) {
    return undefined;
  }
  if (cursor.beatIndex > 0) {
    return track.bars[cursor.barIndex].beats[cursor.beatIndex - 1];
  }
  const prevBar = track.bars[cursor.barIndex - 1];
  return prevBar?.beats[prevBar.beats.length - 1];
}

/** Piano T: tie keys that the previous beat also holds; pressing again unties them. */
export function toggleKeyTie(score: Score, cursor: Cursor): Change | null {
  const h = here(score, cursor);
  const keys = h.beat?.keys ?? [];
  if (h.track.instrument !== 'piano' || !keys.length) {
    return null;
  }
  const prev = new Set((previousBeat(score, cursor)?.keys ?? []).map(k => k.pitch));
  const tieable = keys.filter(k => prev.has(k.pitch));
  if (!tieable.length) {
    return null;
  }
  const untie = tieable.every(k => k.tieFromPrev);
  return { ops: tieable.map(k => setOp(score, k.id, ['tieFromPrev'], untie ? undefined : true)), label: 'tie' };
}

/** Delete on piano/drums: empty the beat. */
export function clearBeat(score: Score, cursor: Cursor): Change | null {
  const beat = here(score, cursor).beat;
  if (!beat || soundingCount(beat) === 0) {
    return null;
  }
  return { ops: [...clearBeatOps(score, beat), setOp(score, beat.id, ['rest'], true)], label: 'clear beat' };
}
