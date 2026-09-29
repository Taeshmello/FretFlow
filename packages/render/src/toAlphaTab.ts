import * as alphaTab from '@coderline/alphatab';
import { DRUM_ORDER, DRUM_PIECES, isFretted, type Beat, type DrumPiece, type Id, type MasterBar, type Note, type NoteEffects, type Score, type Track } from '@fretflow/score-model';
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
const PROGRAM = { guitar: 27, bass: 33, piano: 0, drums: 0 } as const;

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
  if (beat.lyric) {
    b.lyrics = [beat.lyric];
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

/** Piano keys from middle C up go on the treble staff, the rest on the bass staff. */
export const GRAND_STAFF_SPLIT = 60;

function keyNote(pitch: number, tied: boolean): alphaTab.model.Note {
  const n = new at.Note();
  n.octave = Math.floor(pitch / 12);
  n.tone = pitch % 12;
  n.isTieDestination = tied;
  return n;
}

const F = at.MusicFontSymbol;
/** Staff line and note heads per piece, as in alphaTab's GP7 default drum kit. */
const DRUM_LOOK: Record<DrumPiece, [name: string, line: number, head: alphaTab.model.MusicFontSymbol, half: alphaTab.model.MusicFontSymbol, whole: alphaTab.model.MusicFontSymbol]> = {
  kick: ['Kick Drum', 7, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  snare: ['Snare', 3, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  hihatClosed: ['Charley', -1, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  hihatOpen: ['Charley', -1, F.NoteheadCircleX, F.NoteheadCircleX, F.NoteheadCircleX],
  crash: ['Crash High', -2, F.NoteheadHeavyX, F.NoteheadHeavyX, F.NoteheadHeavyX],
  ride: ['Ride', 0, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  tomHigh: ['Tom High', 2, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  tomMid: ['Tom Medium', 4, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  tomFloor: ['Very Low Floor Tom', 5, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  sideStick: ['Snare', 3, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
  tomLow: ['Tom Low', 5, F.NoteheadBlack, F.NoteheadHalf, F.NoteheadWhole],
  hihatPedal: ['Charley', 9, F.NoteheadXBlack, F.NoteheadXBlack, F.NoteheadXBlack],
};

/**
 * The track's own articulation list, one entry per kit piece in DRUM_ORDER. A note's
 * percussionArticulation is an index into this list: that is how Guitar Pro files
 * store drums, so export, import, playback and rendering agree.
 */
function drumArticulations(): alphaTab.model.InstrumentArticulation[] {
  return DRUM_ORDER.map(piece => {
    const [name, line, head, half, whole] = DRUM_LOOK[piece];
    const midi = DRUM_PIECES[piece].midi;
    return new at.InstrumentArticulation(name, line, midi, head, half, whole, F.None, undefined, midi);
  });
}

function drumNote(piece: DrumPiece): alphaTab.model.Note {
  const n = new at.Note();
  n.percussionArticulation = DRUM_ORDER.indexOf(piece);
  return n;
}

function chordFor(staff: alphaTab.model.Staff, beat: Beat, converted: alphaTab.model.Beat, stringCount: number): void {
  if (!beat.chord) {
    return;
  }
  const chord = new at.Chord();
  chord.name = beat.chord;
  chord.showName = true;
  chord.showDiagram = false;
  chord.showFingering = false;
  chord.strings = Array(stringCount).fill(-1);
  const chordId = `beat-chord-${beat.id}`;
  staff.addChord(chordId, chord);
  converted.chordId = chordId;
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
  // Drums play on the General MIDI percussion channel (10, index 9).
  t.playbackInfo.primaryChannel = track.instrument === 'drums' ? 9 : trackIndex * 2;
  t.playbackInfo.secondaryChannel = track.instrument === 'drums' ? 9 : trackIndex * 2 + 1;
  const fretted = isFretted(track.instrument);
  const grand = track.instrument === 'piano';
  if (track.instrument === 'drums') {
    t.percussionArticulations = drumArticulations();
  }
  const staffCount = grand ? 2 : 1;
  const staves: alphaTab.model.Staff[] = [];
  for (let i = 0; i < staffCount; i++) {
    const staff = new at.Staff();
    // Same order as ours: [0] is the highest string.
    if (track.tuning.length) {
      staff.stringTuning = new at.Tuning('', [...track.tuning], false);
    }
    staff.capo = track.capo;
    staff.showTablature = fretted && options.staffMode !== 'score';
    staff.showStandardNotation = !fretted || options.staffMode !== 'tab';
    staff.isPercussion = track.instrument === 'drums';
    // Guitar and bass are written an octave above how they sound.
    staff.displayTranspositionPitch = fretted ? -12 : 0;
    t.addStaff(staff);
    staves.push(staff);
  }

  const stringCount = track.tuning.length;
  track.bars.forEach((bar, barIndex) => {
    staves.forEach((staff, staffIndex) => {
      const b = new at.Bar();
      b.keySignature = (score.masterBars[barIndex]?.keySig ?? 0) as alphaTab.model.KeySignature;
      if (track.instrument === 'bass' || (grand && staffIndex === 1)) {
        b.clef = at.Clef.F4;
      } else if (track.instrument === 'drums') {
        b.clef = at.Clef.Neutral;
      }
      const voice = new at.Voice();
      b.addVoice(voice);
      bar.beats.forEach((beat, beatIndex) => {
        const converted = convertBeat(beat, stringCount);
        if (!beat.rest) {
          for (const key of beat.keys ?? []) {
            const upper = key.pitch >= GRAND_STAFF_SPLIT;
            if (upper === (staffIndex === 0)) {
              converted.addNote(keyNote(key.pitch, key.tieFromPrev === true));
            }
          }
          for (const hit of beat.hits ?? []) {
            converted.addNote(drumNote(hit.piece));
          }
        }
        if (staffIndex > 0) {
          // Lyrics and chord names belong to the top staff only.
          converted.lyrics = null;
        } else {
          chordFor(staff, beat, converted, stringCount);
          out.beats.set(beat.id, converted);
        }
        voice.addBeat(converted);
        out.refs.set(converted, { trackIndex, barIndex, beatIndex, beatId: beat.id });
      });
      if (bar.beats.length === 0) {
        const empty = new at.Beat();
        empty.isEmpty = true;
        voice.addBeat(empty);
      }
      staff.addBar(b);
    });
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
