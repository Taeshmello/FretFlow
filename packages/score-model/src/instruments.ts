import { newId } from './create';
import type { DrumHit, DrumPiece, Instrument, KeyNote, NoteSource } from './types';

/** Guitar and bass use strings and frets; piano and drums do not. */
export function isFretted(instrument: Instrument): boolean {
  return instrument === 'guitar' || instrument === 'bass';
}

/** 88-key piano range. */
export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;

/** Kit pieces in keyboard order (1–9, 0, then the rest), with General MIDI percussion numbers. */
export const DRUM_PIECES: Record<DrumPiece, { midi: number; label: string; short: string }> = {
  kick: { midi: 36, label: 'Kick', short: 'K' },
  snare: { midi: 38, label: 'Snare', short: 'S' },
  hihatClosed: { midi: 42, label: 'Hi-hat', short: 'HH' },
  hihatOpen: { midi: 46, label: 'Open hi-hat', short: 'OH' },
  crash: { midi: 49, label: 'Crash', short: 'Cr' },
  ride: { midi: 51, label: 'Ride', short: 'Rd' },
  tomHigh: { midi: 48, label: 'High tom', short: 'T1' },
  tomMid: { midi: 47, label: 'Mid tom', short: 'T2' },
  tomFloor: { midi: 41, label: 'Floor tom', short: 'FT' },
  sideStick: { midi: 37, label: 'Side stick', short: 'SS' },
  tomLow: { midi: 45, label: 'Low tom', short: 'T3' },
  hihatPedal: { midi: 44, label: 'Pedal hi-hat', short: 'PH' },
};

export const DRUM_ORDER = Object.keys(DRUM_PIECES) as DrumPiece[];

/** Imported GM numbers that are variants of a piece we have. */
const DRUM_ALIASES: Record<number, DrumPiece> = {
  35: 'kick',
  40: 'snare',
  39: 'snare',
  43: 'tomFloor',
  50: 'tomHigh',
  57: 'crash',
  52: 'crash',
  55: 'crash',
  53: 'ride',
  59: 'ride',
};

export function drumPieceForMidi(midi: number): DrumPiece | null {
  const exact = DRUM_ORDER.find(p => DRUM_PIECES[p].midi === midi);
  return exact ?? DRUM_ALIASES[midi] ?? null;
}

export function createKeyNote(pitch: number, source: NoteSource = 'user'): KeyNote {
  return { id: newId(), pitch, source };
}

export function createDrumHit(piece: DrumPiece, source: NoteSource = 'user'): DrumHit {
  return { id: newId(), piece, source };
}
