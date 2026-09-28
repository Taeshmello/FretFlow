import * as alphaTab from '@coderline/alphatab';
import { buildRiffTex, RIFF_BARS } from './sampleRiff';

export const BENCH_BAR_COUNT = 200;

/**
 * The two candidate paths from DECISIONS D-004 (c): feeding alphaTab an alphaTex
 * string, or building its model objects directly the way packages/render will.
 */
export type BuildMethod = 'alphaTex' | 'modelClone';

export interface BuiltScore {
  score: alphaTab.model.Score;
  buildMs: number;
}

function cloneMasterBar(source: alphaTab.model.MasterBar): alphaTab.model.MasterBar {
  const masterBar = new alphaTab.model.MasterBar();
  masterBar.timeSignatureNumerator = source.timeSignatureNumerator;
  masterBar.timeSignatureDenominator = source.timeSignatureDenominator;
  masterBar.timeSignatureCommon = source.timeSignatureCommon;
  masterBar.tripletFeel = source.tripletFeel;
  // MasterBar.keySignature is deprecated in alphaTab 1.8 and delegates to the bar,
  // so the key signature is copied in cloneBar instead.
  return masterBar;
}

function cloneBar(source: alphaTab.model.Bar): alphaTab.model.Bar {
  const bar = new alphaTab.model.Bar();
  bar.clef = source.clef;
  bar.clefOttava = source.clefOttava;
  bar.keySignature = source.keySignature;
  bar.keySignatureType = source.keySignatureType;
  for (const sourceVoice of source.voices) {
    const voice = new alphaTab.model.Voice();
    bar.addVoice(voice);
    for (const sourceBeat of sourceVoice.beats) {
      const beat = new alphaTab.model.Beat();
      beat.duration = sourceBeat.duration;
      beat.dots = sourceBeat.dots;
      beat.isEmpty = sourceBeat.isEmpty;
      voice.addBeat(beat);
      for (const sourceNote of sourceBeat.notes) {
        const note = new alphaTab.model.Note();
        note.fret = sourceNote.fret;
        note.string = sourceNote.string;
        beat.addNote(note);
      }
    }
  }
  return bar;
}

function buildByModelClone(barCount: number): alphaTab.model.Score {
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(buildRiffTex(RIFF_BARS.length), settings);
  const staff = score.tracks[0].staves[0];
  const sourceMasterBars = [...score.masterBars];
  const sourceBars = [...staff.bars];

  while (score.masterBars.length < barCount) {
    const index = score.masterBars.length % sourceMasterBars.length;
    score.addMasterBar(cloneMasterBar(sourceMasterBars[index]));
    staff.addBar(cloneBar(sourceBars[index]));
  }

  score.finish(settings);
  return score;
}

export function buildScore(method: BuildMethod, barCount = BENCH_BAR_COUNT): BuiltScore {
  const started = performance.now();
  const score =
    method === 'alphaTex'
      ? alphaTab.importer.ScoreLoader.loadAlphaTex(buildRiffTex(barCount))
      : buildByModelClone(barCount);
  return { score, buildMs: performance.now() - started };
}

export function countNotes(score: alphaTab.model.Score): number {
  return score.tracks[0].staves[0].bars
    .flatMap(bar => bar.voices)
    .flatMap(voice => voice.beats)
    .reduce((sum, beat) => sum + beat.notes.length, 0);
}
