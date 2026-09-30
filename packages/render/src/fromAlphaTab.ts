import * as alphaTab from '@coderline/alphatab';
import { convertDuration, liveBeats, Report } from './importCommon';
import { convertEffects } from './importEffects';
import { drumBar, pianoBar } from './importPitched';
import {
  createBar,
  DEFAULT_MAX_FRET,
  newId,
  pitchOf,
  type Bar,
  type Beat,
  type MasterBar,
  type Note,
  type Score,
  type Track,
} from '@fretflow/score-model';
import { toOurString } from './strings';

const at = alphaTab.model;

export const MAX_IMPORT_TRACKS = 2;

export interface ImportResult {
  score: Score;
  /** Human-readable element name → how many were dropped or simplified. */
  unsupported: Map<string, number>;
}

function convertBeat(beat: alphaTab.model.Beat, track: Track, report: Report): Beat {
  const stringCount = track.tuning.length;
  const out: Beat = { id: newId(), duration: convertDuration(beat, report), rest: true, notes: [] };
  if (beat.text) {
    out.text = beat.text;
  }
  if (beat.lyrics?.[0]) {
    out.lyric = beat.lyrics[0];
  }
  if (beat.chord?.name) {
    out.chord = beat.chord.name;
  }
  if (beat.graceType !== at.GraceType.None) {
    report.add('grace notes');
  }
  const marks = beat.tremoloPicking?.marks ?? 0;
  if (marks > 0) {
    out.tremolo = marks === 1 ? 8 : marks === 2 ? 16 : 32;
    if (marks > 3) {
      report.add('tremolo faster than thirty-seconds (set to thirty-seconds)');
    }
  }
  if (beat.slap || beat.pop) {
    report.add('slap/pop');
  }
  const seen = new Set<number>();
  for (const n of beat.notes) {
    if (n.isPercussion || n.string < 1) {
      report.add('notes without a string');
      continue;
    }
    const string = toOurString(n.string, stringCount);
    if (string < 1 || string > stringCount || seen.has(string)) {
      report.add('notes on invalid or duplicate strings');
      continue;
    }
    let fret = n.fret;
    if (fret < 0 || fret > track.maxFret) {
      report.add(`frets outside 0..${track.maxFret}`);
      fret = Math.min(Math.max(fret, 0), track.maxFret);
    }
    seen.add(string);
    const note: Note = {
      id: newId(),
      pitch: pitchOf(track, string, fret),
      string,
      fret,
      fingeringLocked: true,
      effects: convertEffects(n, report),
      source: 'import',
    };
    if (n.isTieDestination) {
      note.tieFromPrev = true;
    }
    out.notes.push(note);
  }
  out.notes.sort((a, b) => a.string - b.string);
  out.rest = out.notes.length === 0;
  return out;
}

function isBass(track: alphaTab.model.Track, tuning: number[]): boolean {
  const program = track.playbackInfo.program;
  return (program >= 32 && program <= 39) || (tuning.length <= 5 && Math.min(...tuning) < 36);
}

function convertMasterBars(score: alphaTab.model.Score, report: Report): MasterBar[] {
  const firstStaff = score.tracks[0]?.staves[0];
  let lastTempo: number | undefined;
  return score.masterBars.map((m, i) => {
    const mb: MasterBar = {
      id: newId(),
      timeSig: [m.timeSignatureNumerator, m.timeSignatureDenominator],
      keySig: Number(firstStaff?.bars[i]?.keySignature ?? 0),
    };
    const tempo = m.tempoAutomations[0]?.value ?? (i === 0 ? score.tempo : undefined);
    if (tempo !== undefined && tempo !== lastTempo) {
      mb.tempo = Math.round(tempo);
      lastTempo = mb.tempo;
    }
    if (m.tempoAutomations.length > 1) {
      report.add('tempo changes inside a bar');
    }
    if (m.isRepeatStart) {
      mb.repeatStart = true;
    }
    if (m.repeatCount > 0) {
      mb.repeatEnd = m.repeatCount;
    }
    if (m.alternateEndings) {
      report.add('alternate endings (1st/2nd)');
    }
    if (m.section?.text) {
      mb.section = m.section.text;
    }
    return mb;
  });
}

type Kind = 'fretted' | 'piano' | 'drums';

function kindOf(t: alphaTab.model.Track): Kind {
  const staff = t.staves[0];
  if (staff?.isPercussion) {
    return 'drums';
  }
  return staff?.isStringed ? 'fretted' : 'piano';
}

/** GP3–7 (via alphaTab) → our model. Keeps the first two guitar, bass, piano or drum tracks. */
export function fromAlphaTab(source: alphaTab.model.Score): ImportResult {
  const report = new Report();
  const masterBars = convertMasterBars(source, report);
  const usable = source.tracks.filter(t => t.staves[0]);
  if (usable.length > MAX_IMPORT_TRACKS) {
    report.add('tracks beyond the first two', usable.length - MAX_IMPORT_TRACKS);
  }

  const tracks: Track[] = usable.slice(0, MAX_IMPORT_TRACKS).map(t => {
    const kind = kindOf(t);
    const staff = t.staves[0];
    if (kind !== 'fretted') {
      const instrument = kind === 'drums' ? 'drums' : 'piano';
      if (t.staves.slice(1).some(st => st.bars.some(b => liveBeats(b).length)) && kind === 'drums') {
        report.add('extra drum staves', t.staves.length - 1);
      }
      return {
        id: newId(),
        name: t.name || (instrument === 'drums' ? 'Drums' : 'Piano'),
        instrument,
        tuning: [],
        capo: 0,
        maxFret: 0,
        bars: masterBars.map((mb, i) => (kind === 'drums' ? drumBar(t, i, mb, report) : pianoBar(t, i, mb, report))),
      };
    }
    const tuning = [...staff.tuning];
    const track: Track = {
      id: newId(),
      name: t.name || 'Track',
      instrument: isBass(t, tuning) ? 'bass' : 'guitar',
      tuning,
      capo: staff.capo,
      maxFret: DEFAULT_MAX_FRET,
      bars: [],
    };
    if (t.staves.length > 1) {
      report.add('extra staves', t.staves.length - 1);
    }
    track.bars = masterBars.map((mb, i): Bar => {
      const bar = staff.bars[i];
      if (!bar) {
        return createBar(mb);
      }
      if (bar.voices.slice(1).some(v => !v.isEmpty && v.beats.some(b => !b.isEmpty))) {
        report.add('second voices');
      }
      const beats = (bar.voices[0]?.beats ?? []).filter(b => !b.isEmpty).map(b => convertBeat(b, track, report));
      return beats.length ? { id: newId(), masterBarId: mb.id, beats } : createBar(mb);
    });
    return track;
  });

  if (tracks.length === 0) {
    throw new Error('The file has no track FretFlow can open.');
  }

  return {
    score: {
      schemaVersion: 1,
      id: newId(),
      meta: {
        title: source.title || 'Imported',
        ...(source.artist ? { artist: source.artist } : {}),
        composerType: 'cover',
      },
      masterBars,
      tracks,
    },
    unsupported: report.items,
  };
}

export function importFile(bytes: Uint8Array, settings?: alphaTab.Settings): ImportResult {
  return fromAlphaTab(alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings));
}
