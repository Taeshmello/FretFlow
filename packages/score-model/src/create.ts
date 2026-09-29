import { monotonicFactory } from 'ulid';
import { pitchOf, TUNING_PRESETS } from './pitch';
import type { Bar, Beat, ComposerType, Duration, Id, Instrument, MasterBar, Note, NoteSource, Score, Track } from './types';

const nextUlid = monotonicFactory();

/** Score data is plain JSON, so a JSON round trip is a full deep copy. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function newId(): Id {
  return nextUlid();
}

export const DEFAULT_MAX_FRET = 24;
export const QUARTER: Duration = { base: 4, dots: 0 };

export function createBeat(duration: Duration = QUARTER, rest = true): Beat {
  return { id: newId(), duration: { ...duration }, rest, notes: [] };
}

export function createNote(
  track: Pick<Track, 'tuning' | 'capo'>,
  string: number,
  fret: number,
  source: NoteSource = 'user',
): Note {
  return {
    id: newId(),
    pitch: pitchOf(track, string, fret),
    string,
    fret,
    fingeringLocked: source === 'user',
    effects: {},
    source,
  };
}

export function createMasterBar(timeSig: [number, number] = [4, 4], keySig = 0): MasterBar {
  return { id: newId(), timeSig: [timeSig[0], timeSig[1]], keySig };
}

/** A bar that holds one rest per beat of the time signature. */
export function createBar(masterBar: MasterBar): Bar {
  const [num, den] = masterBar.timeSig;
  const beats: Beat[] = [];
  for (let i = 0; i < num; i++) {
    beats.push(createBeat({ base: den as Duration['base'], dots: 0 }));
  }
  return { id: newId(), masterBarId: masterBar.id, beats };
}

export interface CreateTrackOptions {
  name?: string;
  instrument?: Instrument;
  tuning?: number[];
  capo?: number;
  maxFret?: number;
}

export function createTrack(masterBars: readonly MasterBar[], options: CreateTrackOptions = {}): Track {
  const instrument = options.instrument ?? 'guitar';
  const fallback = instrument === 'piano' || instrument === 'drums'
    ? undefined
    : TUNING_PRESETS.find(p => p.id === (instrument === 'bass' ? 'bassStandard' : 'standard'));
  return {
    id: newId(),
    name: options.name ?? ({ guitar: 'Guitar', bass: 'Bass', piano: 'Piano', drums: 'Drums' })[instrument],
    instrument,
    tuning: [...(options.tuning ?? fallback?.tuning ?? [])],
    capo: options.capo ?? 0,
    maxFret: options.maxFret ?? (instrument === 'piano' || instrument === 'drums' ? 0 : DEFAULT_MAX_FRET),
    bars: masterBars.map(createBar),
  };
}

export interface CreateScoreOptions extends CreateTrackOptions {
  title?: string;
  artist?: string;
  composerType?: ComposerType;
  timeSig?: [number, number];
  keySig?: number;
  tempo?: number;
  bars?: number;
}

export function createScore(options: CreateScoreOptions = {}): Score {
  const count = Math.max(1, options.bars ?? 4);
  const masterBars: MasterBar[] = [];
  for (let i = 0; i < count; i++) {
    masterBars.push(createMasterBar(options.timeSig, options.keySig));
  }
  masterBars[0] = { ...masterBars[0], tempo: options.tempo ?? 120 };
  const meta: Score['meta'] = { title: options.title ?? 'Untitled', composerType: options.composerType ?? 'original' };
  if (options.artist) {
    meta.artist = options.artist;
  }
  return {
    schemaVersion: 1,
    id: newId(),
    meta,
    masterBars,
    tracks: [createTrack(masterBars, options)],
  };
}

/** Deep copy with fresh ids everywhere, keeping masterBarId links consistent. */
export function cloneWithNewIds(score: Score): Score {
  const barMap = new Map<Id, Id>();
  const masterBars = score.masterBars.map(mb => {
    const id = newId();
    barMap.set(mb.id, id);
    return { ...clone(mb), id };
  });
  return {
    ...clone(score),
    id: newId(),
    masterBars,
    tracks: score.tracks.map(t => ({
      ...clone(t),
      id: newId(),
      bars: t.bars.map(b => ({
        id: newId(),
        masterBarId: barMap.get(b.masterBarId) ?? b.masterBarId,
        beats: b.beats.map(cloneBeat),
      })),
    })),
  };
}

export function cloneBeat(beat: Beat): Beat {
  const out: Beat = { ...clone(beat), id: newId(), notes: beat.notes.map(n => ({ ...clone(n), id: newId() })) };
  if (beat.keys) {
    out.keys = beat.keys.map(k => ({ ...clone(k), id: newId() }));
  }
  if (beat.hits) {
    out.hits = beat.hits.map(h => ({ ...clone(h), id: newId() }));
  }
  return out;
}
