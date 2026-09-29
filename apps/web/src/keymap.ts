import type { Command } from '@fretflow/editor-core';
import { DRUM_ORDER, type Instrument } from '@fretflow/score-model';

/** The parts of a KeyboardEvent the key map reads, so it can be tested without a DOM. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Shell actions handled outside editor-core (SPEC §5.2: Space is the shell's). */
export type ShellAction = 'playPause' | 'save' | 'help' | 'escape' | 'octaveUp' | 'octaveDown';

export type KeyResult = { command: Command } | { shell: ShellAction } | null;

const EFFECT_KEYS: Record<string, Command> = {
  t: { type: 'tie' },
  h: { type: 'hammer' },
  // One hammer/pull flag in the model; alphaTab prints h or p from the next pitch.
  p: { type: 'hammer' },
  s: { type: 'slide' },
  b: { type: 'bend' },
  v: { type: 'vibrato' },
  m: { type: 'palmMute' },
  x: { type: 'dead' },
  l: { type: 'letRing' },
  r: { type: 'rest' },
};

/** Which instrument the cursor track is, and the piano entry octave (C4 = middle C). */
export interface KeyContext {
  instrument: Instrument;
  octave: number;
}

const GUITAR: KeyContext = { instrument: 'guitar', octave: 4 };
const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Keys that mean the same thing on every instrument (rhythm, navigation, shell). */
function sharedKey(e: KeyLike, key: string): KeyResult {
  switch (key) {
    case 'ArrowLeft':
      return { command: { type: 'moveBeat', delta: -1, extend: e.shiftKey } };
    case 'ArrowRight':
      return { command: { type: 'moveBeat', delta: 1, extend: e.shiftKey } };
    case '+':
    case '=':
      return { command: { type: 'shorter' } };
    case '-':
    case '_':
      return { command: { type: 'longer' } };
    case '.':
      return { command: { type: 'dots' } };
    case 'Enter':
      return { command: { type: 'insertBeat' } };
    case 'Delete':
      return { command: { type: 'deleteNote' } };
    case 'Backspace':
      return { command: { type: 'deleteBeat' } };
    case ' ':
      return { shell: 'playPause' };
    case '?':
      return { shell: 'help' };
    case 'Escape':
      return { shell: 'escape' };
  }
  return null;
}

/** Piano: letters are notes (Shift = sharp), Z/X change octave, ↑/↓ transpose. */
function pianoKey(e: KeyLike, lower: string, octave: number): KeyResult {
  if (lower in PITCH_CLASS) {
    return { command: { type: 'togglePitch', pitch: (octave + 1) * 12 + PITCH_CLASS[lower] + (e.shiftKey ? 1 : 0) } };
  }
  if (lower === 'z' || lower === 'x') {
    return { shell: lower === 'z' ? 'octaveDown' : 'octaveUp' };
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const step = e.shiftKey ? 12 : 1;
    return { command: { type: 'transposeKeys', delta: e.key === 'ArrowUp' ? step : -step } };
  }
  if (lower === 'r') {
    return { command: { type: 'rest' } };
  }
  if (lower === 't') {
    return { command: { type: 'tie' } };
  }
  return sharedKey(e, e.key);
}

/** Drums: 1–9 and 0 pick kit pieces in DRUM_ORDER. */
function drumKey(e: KeyLike, lower: string): KeyResult {
  if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
    const index = e.key === '0' ? 9 : Number(e.key) - 1;
    return { command: { type: 'toggleHit', piece: DRUM_ORDER[index] } };
  }
  if (lower === 'r') {
    return { command: { type: 'rest' } };
  }
  return sharedKey(e, e.key);
}

/** SPEC §5.2. Returns null for keys the editor does not use, so the browser keeps them. */
export function mapKey(e: KeyLike, ctx: KeyContext = GUITAR): KeyResult {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  if (mod) {
    if (lower === 'z') {
      return { command: { type: e.shiftKey ? 'redo' : 'undo' } };
    }
    if (lower === 'y') {
      return { command: { type: 'redo' } };
    }
    if (lower === 'c') {
      return { command: { type: 'copy' } };
    }
    if (lower === 'x') {
      return { command: { type: 'cut' } };
    }
    if (lower === 'v') {
      return { command: { type: 'paste' } };
    }
    if (lower === 'a') {
      return { command: { type: 'selectAll' } };
    }
    if (lower === 's') {
      return { shell: 'save' };
    }
    if (lower === 'k') {
      return { shell: 'help' };
    }
    if (key === '3') {
      return { command: { type: 'tuplet' } };
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      return { command: { type: 'moveBar', delta: key === 'ArrowRight' ? 1 : -1 } };
    }
    return null;
  }
  if (e.altKey) {
    return null;
  }
  if (ctx.instrument === 'piano') {
    return pianoKey(e, lower, ctx.octave);
  }
  if (ctx.instrument === 'drums') {
    return drumKey(e, lower);
  }

  if (key >= '0' && key <= '9' && key.length === 1) {
    return { command: { type: 'digit', digit: Number(key) } };
  }
  switch (key) {
    case 'ArrowUp':
      return { command: { type: 'moveString', delta: -1, extend: e.shiftKey } };
    case 'ArrowDown':
      return { command: { type: 'moveString', delta: 1, extend: e.shiftKey } };
    case 'ArrowLeft':
      return { command: { type: 'moveBeat', delta: -1, extend: e.shiftKey } };
    case 'ArrowRight':
      return { command: { type: 'moveBeat', delta: 1, extend: e.shiftKey } };
    case '+':
    case '=':
      return { command: { type: 'shorter' } };
    case '-':
    case '_':
      return { command: { type: 'longer' } };
    case '.':
      return { command: { type: 'dots' } };
    case 'Enter':
      return { command: { type: 'insertBeat' } };
    case 'Delete':
      return { command: { type: 'deleteNote' } };
    case 'Backspace':
      return { command: { type: 'deleteBeat' } };
    case ' ':
      return { shell: 'playPause' };
    case '?':
      return { shell: 'help' };
    case 'Escape':
      return { shell: 'escape' };
  }
  const effect = EFFECT_KEYS[lower];
  return effect && !e.shiftKey ? { command: effect } : null;
}

/** Typing into inputs must not drive the editor. */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') {
    return false;
  }
  const el = target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
