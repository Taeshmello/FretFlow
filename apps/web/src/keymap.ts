import type { Command } from '@fretflow/editor-core';

/** The parts of a KeyboardEvent the key map reads, so it can be tested without a DOM. */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Shell actions handled outside editor-core (SPEC §5.2: Space is the shell's). */
export type ShellAction = 'playPause' | 'save' | 'help' | 'escape';

export type KeyResult = { command: Command } | { shell: ShellAction } | null;

const EFFECT_KEYS: Record<string, Command> = {
  t: { type: 'tie' },
  h: { type: 'hammer' },
  s: { type: 'slide' },
  b: { type: 'bend' },
  v: { type: 'vibrato' },
  m: { type: 'palmMute' },
  x: { type: 'dead' },
  l: { type: 'letRing' },
  r: { type: 'rest' },
};

/** SPEC §5.2. Returns null for keys the editor does not use, so the browser keeps them. */
export function mapKey(e: KeyLike): KeyResult {
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
