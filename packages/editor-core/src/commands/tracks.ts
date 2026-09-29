import { createTrack, deleteOp, insertOp, pitchOf, setOp, type Instrument, type Op, type Score } from '@fretflow/score-model';
import type { Cursor } from '../cursor';
import type { Change } from '../change';

export const MAX_TRACKS = 2;

/**
 * Tuning or capo change keeps every fret (the player's fingering) and moves
 * the pitch. Re-fingering to keep pitches is out of MVP scope (SPEC §2).
 */
function repitchOps(score: Score, trackId: string, tuning: number[], capo: number): Op[] {
  const track = score.tracks.find(t => t.id === trackId);
  if (!track) {
    return [];
  }
  const ops: Op[] = [];
  for (const bar of track.bars) {
    for (const beat of bar.beats) {
      for (const note of beat.notes) {
        if (note.string > tuning.length) {
          ops.push(deleteOp(score, note.id));
          continue;
        }
        const pitch = pitchOf({ tuning, capo }, note.string, note.fret);
        if (pitch !== note.pitch) {
          ops.push(setOp(score, note.id, ['pitch'], pitch));
        }
      }
    }
  }
  return ops;
}

export function setTuning(score: Score, trackId: string, tuning: number[]): Change | null {
  const track = score.tracks.find(t => t.id === trackId);
  if (!track || track.instrument === 'piano' || track.instrument === 'drums' || tuning.length < 1 || tuning.some(p => !Number.isInteger(p) || p < 0 || p > 127)) {
    return null;
  }
  return {
    ops: [setOp(score, trackId, ['tuning'], [...tuning]), ...repitchOps(score, trackId, tuning, track.capo)],
    label: 'tuning',
  };
}

export function setCapo(score: Score, trackId: string, capo: number): Change | null {
  const track = score.tracks.find(t => t.id === trackId);
  if (!track || track.instrument === 'piano' || track.instrument === 'drums' || !Number.isInteger(capo) || capo < 0 || capo > 12) {
    return null;
  }
  return { ops: [setOp(score, trackId, ['capo'], capo), ...repitchOps(score, trackId, track.tuning, capo)], label: 'capo' };
}

export function renameTrack(score: Score, trackId: string, name: string): Change | null {
  return score.tracks.some(t => t.id === trackId) ? { ops: [setOp(score, trackId, ['name'], name)], label: 'rename track' } : null;
}

export function addTrack(score: Score, cursor: Cursor, instrument: Instrument, tuning?: number[]): Change | null {
  if (score.tracks.length >= MAX_TRACKS) {
    return null;
  }
  const track = createTrack(score.masterBars, { instrument, tuning });
  return {
    ops: [insertOp('track', null, score.tracks.length, track)],
    label: 'add track',
    cursor: { ...cursor, trackId: track.id, string: 1 },
  };
}

export function removeTrack(score: Score, trackId: string, cursor: Cursor): Change | null {
  if (score.tracks.length <= 1 || !score.tracks.some(t => t.id === trackId)) {
    return null;
  }
  const remaining = score.tracks.find(t => t.id !== trackId);
  return {
    ops: [deleteOp(score, trackId)],
    label: 'remove track',
    cursor: cursor.trackId === trackId && remaining ? { ...cursor, trackId: remaining.id } : cursor,
  };
}
