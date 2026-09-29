import * as alphaTab from '@coderline/alphatab';
import { createDrumHit, createKeyNote, createScore, validateScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { exportGp7, exportMidi } from './exporters';
import { fromAlphaTab, importFile } from './fromAlphaTab';
import { toAlphaTab } from './toAlphaTab';

function pianoScore(): Score {
  const score = createScore({ instrument: 'piano', bars: 2, title: 'Keys' });
  const [b0, b1] = score.tracks[0].bars[0].beats;
  b0.rest = false;
  b0.keys = [createKeyNote(48), createKeyNote(60), createKeyNote(64), createKeyNote(67)];
  b1.rest = false;
  b1.keys = [{ ...createKeyNote(64), tieFromPrev: true }];
  return score;
}

function drumScore(): Score {
  const score = createScore({ instrument: 'drums', bars: 1, title: 'Beat' });
  const [b0, b1] = score.tracks[0].bars[0].beats;
  b0.rest = false;
  b0.hits = [createDrumHit('kick'), createDrumHit('hihatClosed')];
  b1.rest = false;
  b1.hits = [createDrumHit('snare'), createDrumHit('hihatClosed')];
  return score;
}

const keysOf = (s: Score) => s.tracks[0].bars.map(b => b.beats.map(x => (x.keys ?? []).map(k => `${k.pitch}${k.tieFromPrev ? '~' : ''}`).join(' ') || '-'));
const hitsOf = (s: Score) => s.tracks[0].bars.map(b => b.beats.map(x => (x.hits ?? []).map(h => h.piece).join('+') || '-'));

describe('piano on a grand staff', () => {
  it('puts keys from middle C up on the treble staff and the rest on the bass staff', () => {
    const { score } = toAlphaTab(pianoScore(), { staffMode: 'score' }, new alphaTab.Settings());
    const [treble, bass] = score.tracks[0].staves;
    expect(score.tracks[0].staves).toHaveLength(2);
    expect(treble.bars[0].voices[0].beats[0].notes.map(n => n.realValue)).toEqual([60, 64, 67]);
    expect(bass.bars[0].voices[0].beats[0].notes.map(n => n.realValue)).toEqual([48]);
    expect(bass.bars[0].clef).toBe(alphaTab.model.Clef.F4);
  });

  it('keeps keys and ties through alphaTab and Guitar Pro', () => {
    const src = pianoScore();
    const { score: model } = toAlphaTab(src, { staffMode: 'score' }, new alphaTab.Settings());
    const back = fromAlphaTab(model).score;
    expect(back.tracks[0].instrument).toBe('piano');
    expect(keysOf(back)).toEqual(keysOf(src));
    expect(validateScore(back)).toEqual([]);
    const gp = importFile(exportGp7(src)).score;
    expect(keysOf(gp)).toEqual(keysOf(src));
  });
});

describe('drums on a percussion staff', () => {
  it('writes General MIDI percussion numbers and plays on channel 10', () => {
    const { score } = toAlphaTab(drumScore(), { staffMode: 'score' }, new alphaTab.Settings());
    const track = score.tracks[0];
    const notes = track.staves[0].bars[0].voices[0].beats[0].notes;
    expect(notes.map(n => track.percussionArticulations[n.percussionArticulation].outputMidiNumber)).toEqual([36, 42]);
    expect(track.playbackInfo.primaryChannel).toBe(9);
  });

  it('keeps kit pieces through alphaTab and Guitar Pro', () => {
    const src = drumScore();
    const { score: model } = toAlphaTab(src, { staffMode: 'score' }, new alphaTab.Settings());
    const back = fromAlphaTab(model).score;
    expect(back.tracks[0].instrument).toBe('drums');
    expect(hitsOf(back)).toEqual(hitsOf(src));
    expect(validateScore(back)).toEqual([]);
    expect(hitsOf(importFile(exportGp7(src)).score)).toEqual(hitsOf(src));
  });

  it('exports a MIDI file for piano and drums', () => {
    for (const s of [pianoScore(), drumScore()]) {
      expect(String.fromCharCode(...exportMidi(s).slice(0, 4))).toBe('MThd');
    }
  });
});

describe('drum dynamics', () => {
  it('keeps accents and ghost notes through alphaTab and Guitar Pro', () => {
    const src = drumScore();
    const hits = src.tracks[0].bars[0].beats[0].hits!;
    hits[0].dynamic = 'accent';
    hits[1].dynamic = 'ghost';
    const { score: model } = toAlphaTab(src, { staffMode: 'score' }, new alphaTab.Settings());
    const [kick, hat] = model.tracks[0].staves[0].bars[0].voices[0].beats[0].notes;
    expect(kick.accentuated).toBe(alphaTab.model.AccentuationType.Normal);
    expect(hat.isGhost).toBe(true);
    const dyn = (s: Score) => s.tracks[0].bars[0].beats[0].hits?.map(h => h.dynamic ?? 'normal');
    expect(dyn(fromAlphaTab(model).score)).toEqual(['accent', 'ghost']);
    expect(dyn(importFile(exportGp7(src)).score)).toEqual(['accent', 'ghost']);
  });
});
