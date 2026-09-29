import * as alphaTab from '@coderline/alphatab';
import type { Beat, Id, MasterBar, Note, NoteEffects, Score, Track } from '@fretflow/score-model';
import { toAlphaTabString } from './strings';

const at = alphaTab.model;

export type StaffMode = 'scoreTab' | 'tab' | 'score';

export interface ConvertOptions {
  staffMode: StaffMode;
}

/** Where one of our beats lives, in our indexes. */
export interface BeatRef {
  trackIndex: number;
  barIndex: number;
  beatIndex: number;
  beatId: Id;
}

export interface Converted {
  score: alphaTab.model.Score;
  /** Our beat id → the alphaTab beat drawn for it. */
  beats: Map<Id, alphaTab.model.Beat>;
  /** alphaTab beat → our position. */
  refs: Map<alphaTab.model.Beat, BeatRef>;
}

/** General MIDI programs: steel guitar, clean electric, finger bass. */
const PROGRAM = { guitar: 27, bass: 33 } as const;

function slideOut(slide: NoteEffects['slide']): alphaTab.model.SlideOutType {
  switch (slide) {
    case 'legato':
      return at.SlideOutType.Legato;
    case 'shift':
      return at.SlideOutType.Shift;
    case 'out':
      return at.SlideOutType.OutDown;
    default:
      return at.SlideOutType.None;
  }
}

/** Bend curves on alphaTab's 0..60 time axis, values in quarter tones. */
function bendPoints(bend: NonNullable<NoteEffects['bend']>): { type: alphaTab.model.BendType; points: [number, number][] } {
  const v = Math.round(bend.amount * 4);
  switch (bend.type) {
    case 'bend':
      return { type: at.BendType.Bend, points: [[0, 0], [15, v], [60, v]] };
    case 'release':
      return { type: at.BendType.Release, points: [[0, v], [30, 0], [60, 0]] };
    case 'bendRelease':
      return { type: at.BendType.BendRelease, points: [[0, 0], [15, v], [30, v], [45, 0], [60, 0]] };
    case 'prebend':
      return { type: at.BendType.Prebend, points: [[0, v], [60, v]] };
  }
}

function convertNote(note: Note, stringCount: number): alphaTab.model.Note {
  const n = new at.Note();
  n.string = toAlphaTabString(note.string, stringCount);
  n.fret = note.fret;
  n.isTieDestination = note.tieFromPrev === true;
  const fx = note.effects;
  n.isHammerPullOrigin = fx.hammerPull === true;
  n.slideOutType = slideOut(fx.slide);
  if (fx.slide === 'in') {
    n.slideInType = at.SlideInType.IntoFromBelow;
  }
  if (fx.bend) {
    const { type, points } = bendPoints(fx.bend);
    n.bendType = type;
    for (const [offset, value] of points) {
      n.addBendPoint(new at.BendPoint(offset, value));
    }
  }
  n.vibrato = fx.vibrato === 'wide' ? at.VibratoType.Wide : fx.vibrato === 'slight' ? at.VibratoType.Slight : at.VibratoType.None;
  n.isPalmMute = fx.palmMute === true;
  n.isDead = fx.dead === true;
  n.isLetRing = fx.letRing === true;
  return n;
}

function convertBeat(beat: Beat, stringCount: number): alphaTab.model.Beat {
  const b = new at.Beat();
  b.duration = beat.duration.base as alphaTab.model.Duration;
  b.dots = beat.duration.dots;
  if (beat.duration.tuplet) {
    b.tupletNumerator = beat.duration.tuplet[0];
    b.tupletDenominator = beat.duration.tuplet[1];
  }
  if (beat.text) {
    b.text = beat.text;
  }
  // No notes = rest in alphaTab.
  if (!beat.rest) {
    for (const note of beat.notes) {
      b.addNote(convertNote(note, stringCount));
    }
  }
  return b;
}

function convertMasterBar(mb: MasterBar): alphaTab.model.MasterBar {
  const m = new at.MasterBar();
  m.timeSignatureNumerator = mb.timeSig[0];
  m.timeSignatureDenominator = mb.timeSig[1];
  m.isRepeatStart = mb.repeatStart === true;
  m.repeatCount = mb.repeatEnd ?? 0;
  if (mb.tempo !== undefined) {
    m.tempoAutomations.push(at.Automation.buildTempoAutomation(false, 0, mb.tempo, 2));
  }
  if (mb.section) {
    const s = new at.Section();
    s.text = mb.section;
    s.marker = '';
    m.section = s;
  }
  return m;
}

function convertTrack(
  track: Track,
  trackIndex: number,
  score: Score,
  options: ConvertOptions,
  out: Converted,
): alphaTab.model.Track {
  const t = new at.Track();
  t.name = track.name;
  t.playbackInfo.program = PROGRAM[track.instrument];
  t.playbackInfo.primaryChannel = trackIndex * 2;
  t.playbackInfo.secondaryChannel = trackIndex * 2 + 1;
  const staff = new at.Staff();
  // Same order as ours: [0] is the highest string.
  staff.stringTuning = new at.Tuning('', [...track.tuning], false);
  staff.capo = track.capo;
  staff.showTablature = options.staffMode !== 'score';
  staff.showStandardNotation = options.staffMode !== 'tab';
  // Guitar and bass are written an octave above how they sound.
  staff.displayTranspositionPitch = -12;
  t.addStaff(staff);

  const stringCount = track.tuning.length;
  track.bars.forEach((bar, barIndex) => {
    const b = new at.Bar();
    b.keySignature = (score.masterBars[barIndex]?.keySig ?? 0) as alphaTab.model.KeySignature;
    if (track.instrument === 'bass') {
      b.clef = at.Clef.F4;
    }
    const voice = new at.Voice();
    b.addVoice(voice);
    bar.beats.forEach((beat, beatIndex) => {
      const converted = convertBeat(beat, stringCount);
      voice.addBeat(converted);
      out.beats.set(beat.id, converted);
      out.refs.set(converted, { trackIndex, barIndex, beatIndex, beatId: beat.id });
    });
    if (bar.beats.length === 0) {
      const empty = new at.Beat();
      empty.isEmpty = true;
      voice.addBeat(empty);
    }
    staff.addBar(b);
  });
  return t;
}

/** Builds a fresh alphaTab score. Cheap enough to do on every edit (D-004: 1–5ms for 200 bars). */
export function toAlphaTab(score: Score, options: ConvertOptions, settings: alphaTab.Settings): Converted {
  const out: Converted = { score: new at.Score(), beats: new Map(), refs: new Map() };
  const s = out.score;
  s.title = score.meta.title;
  s.artist = score.meta.artist ?? '';
  for (const mb of score.masterBars) {
    s.addMasterBar(convertMasterBar(mb));
  }
  score.tracks.forEach((track, i) => s.addTrack(convertTrack(track, i, score, options, out)));
  s.finish(settings);
  return out;
}
