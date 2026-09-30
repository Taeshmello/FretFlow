import * as alphaTab from '@coderline/alphatab';
import type { Score } from '@fretflow/score-model';
import { addPedalControllers, pedalChanges } from './pedal';
import { toAlphaTab } from './toAlphaTab';

/** Standard MIDI file, one channel pair per track (SPEC §9). */
export function exportMidi(score: Score): Uint8Array {
  const settings = new alphaTab.Settings();
  const { score: model } = toAlphaTab(score, { staffMode: 'scoreTab' }, settings);
  const midi = new alphaTab.midi.MidiFile();
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
  const generator = new alphaTab.midi.MidiFileGenerator(model, settings, handler);
  generator.generate();
  addPedalControllers(midi, model, pedalChanges(score, generator.tickLookup, midi.tickShift));
  return midi.toBinary();
}

/** Guitar Pro 7 (.gp). Not in the MVP list but free through alphaTab's exporter. */
export function exportGp7(score: Score): Uint8Array {
  const settings = new alphaTab.Settings();
  const { score: model } = toAlphaTab(score, { staffMode: 'scoreTab' }, settings);
  return new alphaTab.exporter.Gp7Exporter().export(model, settings);
}
