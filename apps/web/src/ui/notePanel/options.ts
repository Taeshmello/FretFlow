import type { Command } from '@fretflow/editor-core';
import type { BendAmount, BendType, DurationBase, HarmonicKind, NoteEffects, TremoloSpeed } from '@fretflow/score-model';

export const DURATIONS: { base: DurationBase; label: string; name: string }[] = [
  { base: 1, label: '1', name: 'Whole' },
  { base: 2, label: '½', name: 'Half' },
  { base: 4, label: '¼', name: 'Quarter' },
  { base: 8, label: '⅛', name: 'Eighth' },
  { base: 16, label: '1/16', name: 'Sixteenth' },
  { base: 32, label: '1/32', name: 'Thirty-second' },
];

type Tech = { key: string; label: string; command: Command; on: (fx: NoteEffects) => boolean };
export const TECHNIQUES: Tech[] = [
  // Our model has one hammer/pull flag; alphaTab draws h or p from the next note's pitch.
  { key: 'H', label: 'Hammer-on', command: { type: 'hammer' }, on: fx => !!fx.hammerPull },
  { key: 'P', label: 'Pull-off', command: { type: 'hammer' }, on: fx => !!fx.hammerPull },
  { key: 'S', label: 'Slide', command: { type: 'slide' }, on: fx => !!fx.slide },
  { key: 'B', label: 'Bend', command: { type: 'bend' }, on: fx => !!fx.bend },
  { key: 'V', label: 'Vibrato', command: { type: 'vibrato' }, on: fx => !!fx.vibrato },
  { key: 'M', label: 'Palm mute', command: { type: 'palmMute' }, on: fx => !!fx.palmMute },
  { key: 'X', label: 'Dead note', command: { type: 'dead' }, on: fx => !!fx.dead },
  { key: 'L', label: 'Let ring', command: { type: 'letRing' }, on: fx => !!fx.letRing },
  { key: 'N', label: 'Harmonic', command: { type: 'harmonic' }, on: fx => !!fx.harmonic },
  { key: '⇧T', label: 'Tapping', command: { type: 'tap' }, on: fx => !!fx.tap },
];

export const TREMOLOS: { speed: TremoloSpeed | undefined; label: string }[] = [
  { speed: undefined, label: 'Off' },
  { speed: 8, label: '1/8' },
  { speed: 16, label: '1/16' },
  { speed: 32, label: '1/32' },
];

/** Harmonic kinds with the abbreviations printed on the score. */
export const HARMONIC_KINDS: { kind: HarmonicKind; label: string; name: string }[] = [
  { kind: 'natural', label: 'N.H.', name: 'Natural harmonic (touched at this fret)' },
  { kind: 'artificial', label: 'A.H.', name: 'Artificial harmonic (an octave above the fretted note)' },
  { kind: 'pinch', label: 'P.H.', name: 'Pinch harmonic' },
  { kind: 'tap', label: 'T.H.', name: 'Tapped harmonic' },
  { kind: 'semi', label: 'S.H.', name: 'Semi harmonic' },
  { kind: 'feedback', label: 'Fdbk', name: 'Feedback' },
];

export const BEND_AMOUNTS: { amount: BendAmount; label: string }[] = [
  { amount: 0.5, label: '½' },
  { amount: 1, label: 'Full' },
  { amount: 1.5, label: '1½' },
  { amount: 2, label: '2' },
];
export const BEND_TYPES: { type: BendType; label: string }[] = [
  { type: 'bend', label: 'Bend' },
  { type: 'release', label: 'Release' },
  { type: 'bendRelease', label: 'Bend + release' },
  { type: 'prebend', label: 'Pre-bend' },
];
