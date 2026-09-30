import * as alphaTab from '@coderline/alphatab';
import { createKeyNote, createScore, type Score } from '@fretflow/score-model';
import { describe, expect, it } from 'vitest';
import { exportGp7 } from './exporters';
import { fromAlphaTab, importFile } from './fromAlphaTab';
import { addPedalControllers, pedalChanges, sustainNoteOffs } from './pedal';
import { toAlphaTab } from './toAlphaTab';

/** Two 4/4 bars of quarter-note C4s; pedal marks by [bar, beat]. */
function pedalScore(marks: [bar: number, beat: number, pedal: 'down' | 'up'][]): Score {
  const score = createScore({ instrument: 'piano', bars: 2 });
  for (const bar of score.tracks[0].bars) {
    for (const beat of bar.beats) {
      beat.rest = false;
      beat.keys = [createKeyNote(60)];
    }
  }
  for (const [bar, beat, pedal] of marks) {
    score.tracks[0].bars[bar].beats[beat].pedal = pedal;
  }
  return score;
}

function generate(score: Score) {
  const settings = new alphaTab.Settings();
  const { score: model } = toAlphaTab(score, { staffMode: 'score' }, settings);
  const midi = new alphaTab.midi.MidiFile();
  const generator = new alphaTab.midi.MidiFileGenerator(model, settings, new alphaTab.midi.AlphaSynthMidiFileHandler(midi));
  generator.generate();
  return { model, midi, changes: pedalChanges(score, generator.tickLookup, midi.tickShift) };
}

const noteOffs = (midi: alphaTab.midi.MidiFile) =>
  midi.tracks.flatMap(t => t.events).filter(e => e instanceof alphaTab.midi.NoteOffEvent).map(e => e.tick);
const pedalsOf = (s: Score) => s.tracks[0].bars.map(b => b.beats.map(x => x.pedal ?? '-').join(' '));

describe('piano sustain pedal', () => {
  it('lists presses and releases in ticks, re-pedalling on a second down', () => {
    const { changes } = generate(pedalScore([[0, 0, 'down'], [0, 2, 'down'], [1, 1, 'up']]));
    expect(changes.map(c => [c.tick, c.down])).toEqual([
      [0, true],
      [1920, false],
      [1920, true],
      [4800, false],
    ]);
  });

  it('releases a pedal still down at the end of the piece', () => {
    const { changes } = generate(pedalScore([[1, 0, 'down']]));
    expect(changes.map(c => [c.tick, c.down])).toEqual([
      [3840, true],
      [7680, false],
    ]);
  });

  it('holds released keys until the pedal comes up or the key is struck again', () => {
    const score = pedalScore([[0, 0, 'down'], [0, 2, 'up']]);
    score.tracks[0].bars[0].beats[1].keys = [createKeyNote(64)];
    const { model, midi, changes } = generate(score);
    const before = noteOffs(midi);
    sustainNoteOffs(midi, model, changes);
    const after = noteOffs(midi);
    // C4 at 0 is struck again at 1920 exactly when the pedal lifts: it ends there.
    // E4 at 960 would stop at 1920 anyway. Keys after the pedal are unchanged.
    expect(before.slice(0, 2)).toEqual([960, 1920]);
    expect(after.slice(0, 2)).toEqual([1920, 1920]);
    expect(after.slice(2)).toEqual(before.slice(2));
  });

  it('stops a held key where the same key is played again', () => {
    const { model, midi, changes } = generate(pedalScore([[0, 0, 'down'], [1, 3, 'up']]));
    sustainNoteOffs(midi, model, changes);
    // Every C4 is re-struck on the next beat, so each still ends one beat later.
    expect(noteOffs(midi).slice(0, 4)).toEqual([960, 1920, 2880, 3840]);
  });

  it('writes controller 64 on both of the track channels for MIDI files', () => {
    const { model, midi, changes } = generate(pedalScore([[0, 0, 'down'], [0, 2, 'up']]));
    addPedalControllers(midi, model, changes);
    const cc = midi.tracks
      .flatMap(t => t.events)
      .filter((e): e is alphaTab.midi.ControlChangeEvent => e instanceof alphaTab.midi.ControlChangeEvent && e.controller === alphaTab.midi.ControllerType.HoldPedal)
      .map(e => [e.tick, e.channel, e.value]);
    expect(cc).toEqual([
      [0, 0, 127],
      [0, 1, 127],
      [1920, 0, 0],
      [1920, 1, 0],
    ]);
  });

  it('keeps pedal marks through alphaTab and Guitar Pro', () => {
    const src = pedalScore([[0, 0, 'down'], [0, 2, 'down'], [1, 1, 'up']]);
    const { score: model } = toAlphaTab(src, { staffMode: 'score' }, new alphaTab.Settings());
    const types = model.tracks[0].staves[1].bars[0].sustainPedals.map(m => m.pedalType);
    const P = alphaTab.model.SustainPedalMarkerType;
    expect(types).toEqual([P.Down, P.Up, P.Down]);
    expect(pedalsOf(fromAlphaTab(model).score)).toEqual(pedalsOf(src));
    expect(pedalsOf(importFile(exportGp7(src)).score)).toEqual(pedalsOf(src));
  });
});
