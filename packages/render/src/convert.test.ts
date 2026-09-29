import * as alphaTab from '@coderline/alphatab';
import { createNote, createScore, createTrack, validateScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { exportGp7, exportMidi } from './exporters';
import { fromAlphaTab, importFile } from './fromAlphaTab';
import { toAlphaTab } from './toAlphaTab';
import { toAlphaTabString, toOurString } from './strings';

function riff(): Score {
  const score = createScore({ bars: 2, title: 'Riff', tempo: 96 });
  const track = score.tracks[0];
  const [b0, b1, b2] = track.bars[0].beats;
  b0.rest = false;
  b0.notes = [createNote(track, 6, 0), createNote(track, 5, 2)].sort((a, b) => a.string - b.string);
  b1.rest = false;
  b1.duration = { base: 8, dots: 1 };
  b1.notes = [{ ...createNote(track, 3, 7), effects: { bend: { type: 'bend', amount: 1 }, vibrato: 'wide' } }];
  b2.rest = false;
  b2.duration = { base: 8, dots: 0, tuplet: [3, 2] };
  b2.notes = [{ ...createNote(track, 1, 5), effects: { hammerPull: true, palmMute: true, slide: 'legato', letRing: true } }];
  const tied = track.bars[1].beats[0];
  tied.rest = false;
  tied.notes = [{ ...createNote(track, 1, 5), tieFromPrev: true, effects: { dead: false } }];
  score.masterBars[1] = { ...score.masterBars[1], repeatStart: true, repeatEnd: 2, section: 'Chorus', keySig: 2 };
  return score;
}

/** Everything except ids and import-only flags, for round-trip comparison. */
function music(score: Score) {
  return {
    masterBars: score.masterBars.map(({ id: _id, ...m }) => m),
    tracks: score.tracks.map(t => ({
      tuning: t.tuning,
      capo: t.capo,
      bars: t.bars.map(b =>
        b.beats.map(beat => ({
          duration: beat.duration,
          rest: beat.rest,
          notes: beat.notes.map(n => ({ string: n.string, fret: n.fret, pitch: n.pitch, tie: n.tieFromPrev ?? false, fx: Object.fromEntries(Object.entries(n.effects).filter(([, v]) => v)) })),
        })),
      ),
    })),
  };
}

describe('string numbering (D-014)', () => {
  it('round-trips every string of a 6- and 4-string instrument', () => {
    for (const count of [4, 6]) {
      for (let s = 1; s <= count; s++) {
        expect(toOurString(toAlphaTabString(s, count), count)).toBe(s);
      }
    }
    expect(toAlphaTabString(1, 6)).toBe(6);
  });
});

describe('toAlphaTab', () => {
  it('renders a lyric and a standard-only guitar staff', () => {
    const src = createScore();
    src.tracks[0].bars[0].beats[0].lyric = 'Hello';
    const { score } = toAlphaTab(src, { staffMode: 'score' }, new alphaTab.Settings());
    const staff = score.tracks[0].staves[0];
    expect(staff.showStandardNotation).toBe(true);
    expect(staff.showTablature).toBe(false);
    expect(staff.bars[0].voices[0].beats[0].lyrics).toEqual(['Hello']);
    expect(fromAlphaTab(score).score.tracks[0].bars[0].beats[0].lyric).toBe('Hello');
    expect(importFile(exportGp7(src)).score.tracks[0].bars[0].beats[0].lyric).toBe('Hello');
  });

  it('creates standard-only piano and percussion staves', () => {
    for (const instrument of ['piano', 'drums'] as const) {
      const src = createScore({ instrument });
      expect(validateScore(src)).toEqual([]);
      const { score } = toAlphaTab(src, { staffMode: 'tab' }, new alphaTab.Settings());
      const staff = score.tracks[0].staves[0];
      expect(staff.showStandardNotation).toBe(true);
      expect(staff.showTablature).toBe(false);
      expect(staff.isPercussion).toBe(instrument === 'drums');
    }
  });
  it('renders a chord name above the staff without a chord diagram', () => {
    const src = createScore();
    src.tracks[0].bars[0].beats[0].chord = 'Am7';
    const { score } = toAlphaTab(src, { staffMode: 'scoreTab' }, new alphaTab.Settings());
    const beat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
    expect(beat.chord?.name).toBe('Am7');
    expect(beat.chord?.showName).toBe(true);
    expect(beat.chord?.showDiagram).toBe(false);
  });

  it('puts our string 6 (low E) on alphaTab string 1', () => {
    const { score } = toAlphaTab(riff(), { staffMode: 'scoreTab' }, new alphaTab.Settings());
    const low = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes.find(n => n.fret === 0);
    expect(low?.string).toBe(1);
    expect(low?.realValue).toBe(40);
  });

  it('maps every beat both ways', () => {
    const src = riff();
    const out = toAlphaTab(src, { staffMode: 'tab' }, new alphaTab.Settings());
    const id = src.tracks[0].bars[1].beats[2].id;
    const beat = out.beats.get(id);
    expect(beat && out.refs.get(beat)).toEqual({ trackIndex: 0, barIndex: 1, beatIndex: 2, beatId: id });
  });

  it('carries tempo, repeats and sections', () => {
    const { score } = toAlphaTab(riff(), { staffMode: 'scoreTab' }, new alphaTab.Settings());
    expect(score.tempo).toBe(96);
    expect(score.masterBars[1].isRepeatStart).toBe(true);
    expect(score.masterBars[1].repeatCount).toBe(2);
    expect(score.masterBars[1].section?.text).toBe('Chorus');
  });
});

describe('round trip through alphaTab', () => {
  it('preserves chord symbols on import and Guitar Pro export', () => {
    const src = createScore();
    src.tracks[0].bars[0].beats[0].chord = 'G/B';
    const { score: converted } = toAlphaTab(src, { staffMode: 'scoreTab' }, new alphaTab.Settings());
    expect(fromAlphaTab(converted).score.tracks[0].bars[0].beats[0].chord).toBe('G/B');
    expect(importFile(exportGp7(src)).score.tracks[0].bars[0].beats[0].chord).toBe('G/B');
  });

  it('keeps the music when converting to alphaTab and back', () => {
    const src = riff();
    const { score: model } = toAlphaTab(src, { staffMode: 'scoreTab' }, new alphaTab.Settings());
    const { score: back, unsupported } = fromAlphaTab(model);
    expect(music(back)).toEqual(music(src));
    expect(validateScore(back)).toEqual([]);
    expect([...unsupported]).toEqual([]);
  });

  it('survives a Guitar Pro 7 export and import', () => {
    const src = riff();
    const { score: back } = importFile(exportGp7(src));
    expect(music(back)).toEqual(music(src));
  });
});

describe('exportMidi', () => {
  it('writes a standard MIDI file header', () => {
    const bytes = exportMidi(riff());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  });
});

describe('import report', () => {
  it('keeps the first two tracks and reports the rest', () => {
    const src = riff();
    src.tracks.push(createTrack(src.masterBars), createTrack(src.masterBars, { instrument: 'bass' }));
    const { score: model } = toAlphaTab(src, { staffMode: 'tab' }, new alphaTab.Settings());
    const { score, unsupported } = fromAlphaTab(model);
    expect(score.tracks).toHaveLength(2);
    expect(unsupported.get('tracks beyond the first two')).toBe(1);
  });

  it('reports second voices', () => {
    const { score: model } = toAlphaTab(riff(), { staffMode: 'tab' }, new alphaTab.Settings());
    // alphaTab needs the same voice count in every bar; only the first bar gets notes.
    model.tracks[0].staves[0].bars.forEach((bar, i) => {
      const voice = new alphaTab.model.Voice();
      const beat = new alphaTab.model.Beat();
      if (i === 0) {
        const note = new alphaTab.model.Note();
        note.string = 1;
        note.fret = 3;
        beat.addNote(note);
      } else {
        beat.isEmpty = true;
      }
      voice.addBeat(beat);
      bar.addVoice(voice);
    });
    model.finish(new alphaTab.Settings());
    expect(fromAlphaTab(model).unsupported.get('second voices')).toBe(1);
  });
});
