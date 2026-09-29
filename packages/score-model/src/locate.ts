import type { Bar, Beat, Id, MasterBar, NodeKind, Note, Score, Track } from './types';

/**
 * Position of a node as indexes from the root:
 * masterBar [mi], track [ti], bar [ti, bi], beat [ti, bi, bei], note [ti, bi, bei, ni].
 */
export interface Location {
  kind: NodeKind;
  path: number[];
}

export type ScoreIndex = Map<Id, Location>;

const cache = new WeakMap<Score, ScoreIndex>();

function buildIndex(score: Score): ScoreIndex {
  const index: ScoreIndex = new Map();
  score.masterBars.forEach((mb, mi) => index.set(mb.id, { kind: 'masterBar', path: [mi] }));
  score.tracks.forEach((track, ti) => {
    index.set(track.id, { kind: 'track', path: [ti] });
    track.bars.forEach((bar, bi) => {
      index.set(bar.id, { kind: 'bar', path: [ti, bi] });
      bar.beats.forEach((beat, bei) => {
        index.set(beat.id, { kind: 'beat', path: [ti, bi, bei] });
        beat.notes.forEach((note, ni) => index.set(note.id, { kind: 'note', path: [ti, bi, bei, ni] }));
      });
    });
  });
  return index;
}

/** Id → location map, built once per immutable score version. */
export function indexOf(score: Score): ScoreIndex {
  let index = cache.get(score);
  if (!index) {
    index = buildIndex(score);
    cache.set(score, index);
  }
  return index;
}

/** Lets an update that did not move any node reuse the previous index. */
export function carryIndex(from: Score, to: Score): void {
  const index = cache.get(from);
  if (index) {
    cache.set(to, index);
  }
}

export function locate(score: Score, id: Id): Location | undefined {
  return indexOf(score).get(id);
}

export function findTrack(score: Score, id: Id): Track | undefined {
  const loc = locate(score, id);
  return loc?.kind === 'track' ? score.tracks[loc.path[0]] : undefined;
}

export function findMasterBar(score: Score, id: Id): MasterBar | undefined {
  const loc = locate(score, id);
  return loc?.kind === 'masterBar' ? score.masterBars[loc.path[0]] : undefined;
}

export function findBar(score: Score, id: Id): Bar | undefined {
  const loc = locate(score, id);
  return loc?.kind === 'bar' ? score.tracks[loc.path[0]].bars[loc.path[1]] : undefined;
}

export function findBeat(score: Score, id: Id): Beat | undefined {
  const loc = locate(score, id);
  if (loc?.kind !== 'beat') {
    return undefined;
  }
  const [ti, bi, bei] = loc.path;
  return score.tracks[ti].bars[bi].beats[bei];
}

export function findNote(score: Score, id: Id): Note | undefined {
  const loc = locate(score, id);
  if (loc?.kind !== 'note') {
    return undefined;
  }
  const [ti, bi, bei, ni] = loc.path;
  return score.tracks[ti].bars[bi].beats[bei].notes[ni];
}

/** The track that owns a bar, beat or note. */
export function trackOf(score: Score, id: Id): Track | undefined {
  const loc = locate(score, id);
  return loc && loc.kind !== 'masterBar' ? score.tracks[loc.path[0]] : undefined;
}
