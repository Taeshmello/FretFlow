/** ULID. Assigned at creation and never changed. */
export type Id = string;
/** Integer time. A quarter note is TICKS_PER_QUARTER ticks. */
export type Tick = number;

export type ComposerType = 'original' | 'cover' | 'public_domain';

export interface Score {
  schemaVersion: 1;
  id: Id;
  meta: { title: string; artist?: string; composerType: ComposerType };
  masterBars: MasterBar[];
  tracks: Track[];
}

export interface MasterBar {
  id: Id;
  timeSig: [number, number];
  /** -7..7, negative = flats. */
  keySig: number;
  /** BPM, only set where the tempo changes. */
  tempo?: number;
  repeatStart?: boolean;
  /** Number of plays when this bar closes a repeat. */
  repeatEnd?: number;
  section?: string;
}

export type Instrument = 'guitar' | 'bass' | 'piano' | 'drums';

export interface Track {
  id: Id;
  name: string;
  instrument: Instrument;
  /** MIDI pitches, [0] = string 1 (the highest string). */
  tuning: number[];
  capo: number;
  maxFret: number;
  /** Same length and order as Score.masterBars. */
  bars: Bar[];
}

export interface Bar {
  id: Id;
  masterBarId: Id;
  beats: Beat[];
}

export type DurationBase = 1 | 2 | 4 | 8 | 16 | 32;

export interface Duration {
  base: DurationBase;
  dots: 0 | 1 | 2;
  tuplet?: [3, 2];
}

export interface Beat {
  id: Id;
  duration: Duration;
  rest: boolean;
  /** Guitar/bass: at most one note per string. Empty on piano and drum tracks. */
  notes: Note[];
  /** Piano: pitched notes, at most one per pitch. Only on piano tracks. */
  keys?: KeyNote[];
  /** Drums: one hit per kit piece. Only on drum tracks. */
  hits?: DrumHit[];
  /** User-authored chord symbol shown above the stave, e.g. Am7 or G/B. */
  chord?: string;
  /** Syllable or short lyric phrase attached to this beat. */
  lyric?: string;
  text?: string;
}

export type NoteSource = 'user' | 'import' | 'ai';

export interface Note {
  id: Id;
  /** Canonical. = tuning[string - 1] + capo + fret */
  pitch: number;
  /** 1-based, 1 = highest string. */
  string: number;
  fret: number;
  fingeringLocked: boolean;
  tieFromPrev?: boolean;
  effects: NoteEffects;
  source: NoteSource;
}

/** A piano note. Pitch is the whole truth; there is no string or fret. */
export interface KeyNote {
  id: Id;
  /** MIDI pitch, 21 (A0) … 108 (C8). */
  pitch: number;
  tieFromPrev?: boolean;
  source: NoteSource;
}

export type DrumPiece =
  | 'kick'
  | 'snare'
  | 'sideStick'
  | 'hihatClosed'
  | 'hihatOpen'
  | 'hihatPedal'
  | 'crash'
  | 'ride'
  | 'tomHigh'
  | 'tomMid'
  | 'tomLow'
  | 'tomFloor';

/** One stroke on a kit piece. */
export interface DrumHit {
  id: Id;
  piece: DrumPiece;
  /** Louder (accent) or softer (ghost) than a normal stroke. */
  dynamic?: 'accent' | 'ghost';
  source: NoteSource;
}

export type SlideType = 'legato' | 'shift' | 'in' | 'out';
export type BendType = 'bend' | 'release' | 'bendRelease' | 'prebend';
export type BendAmount = 0.5 | 1 | 1.5 | 2;

export interface NoteEffects {
  /** Connects to the next note on the same string. */
  hammerPull?: boolean;
  slide?: SlideType;
  bend?: { type: BendType; amount: BendAmount };
  vibrato?: 'slight' | 'wide';
  palmMute?: boolean;
  dead?: boolean;
  letRing?: boolean;
  /** Unknown keys are preserved. */
  [k: string]: unknown;
}

export type NodeKind = 'masterBar' | 'track' | 'bar' | 'beat' | 'note' | 'key' | 'hit';

export interface NodeOfKind {
  masterBar: MasterBar;
  track: Track;
  bar: Bar;
  beat: Beat;
  note: Note;
  key: KeyNote;
  hit: DrumHit;
}
