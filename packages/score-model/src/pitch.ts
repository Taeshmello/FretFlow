import type { Track } from './types';

type Tuned = Pick<Track, 'tuning' | 'capo'>;

export function stringCount(track: Pick<Track, 'tuning'>): number {
  return track.tuning.length;
}

/** MIDI pitch of `fret` on 1-based `string`. */
export function pitchOf(track: Tuned, string: number, fret: number): number {
  const open = track.tuning[string - 1];
  if (open === undefined) {
    throw new RangeError(`string ${string} does not exist on a ${track.tuning.length}-string track`);
  }
  return open + track.capo + fret;
}

/** Fret that plays `pitch` on `string`, or null when it is out of 0..maxFret. */
export function fretFor(track: Tuned & Pick<Track, 'maxFret'>, string: number, pitch: number): number | null {
  const open = track.tuning[string - 1];
  if (open === undefined) {
    return null;
  }
  const fret = pitch - open - track.capo;
  return fret >= 0 && fret <= track.maxFret ? fret : null;
}

export interface TuningPreset {
  id: string;
  name: string;
  instrument: 'guitar' | 'bass';
  /** [0] = string 1 (highest). */
  tuning: number[];
}

export const TUNING_PRESETS: readonly TuningPreset[] = [
  { id: 'standard', name: 'Standard', instrument: 'guitar', tuning: [64, 59, 55, 50, 45, 40] },
  { id: 'dropD', name: 'Drop D', instrument: 'guitar', tuning: [64, 59, 55, 50, 45, 38] },
  { id: 'halfDown', name: 'Half step down', instrument: 'guitar', tuning: [63, 58, 54, 49, 44, 39] },
  { id: 'dropC', name: 'Drop C', instrument: 'guitar', tuning: [62, 57, 53, 48, 43, 36] },
  { id: 'dadgad', name: 'DADGAD', instrument: 'guitar', tuning: [62, 57, 55, 50, 45, 38] },
  { id: 'openG', name: 'Open G', instrument: 'guitar', tuning: [62, 59, 55, 50, 43, 38] },
  { id: 'bassStandard', name: 'Bass Standard', instrument: 'bass', tuning: [43, 38, 33, 28] },
  { id: 'bassDropD', name: 'Bass Drop D', instrument: 'bass', tuning: [43, 38, 33, 26] },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchName(pitch: number): string {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}
