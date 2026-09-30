import { describe, expect, it } from 'vitest';
import { mapKey, type KeyLike } from './keymap';

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('mapKey (SPEC §5.2)', () => {
  it('maps digits to fret input', () => {
    expect(mapKey(k('7'))).toEqual({ command: { type: 'digit', digit: 7 } });
  });

  it('moves between strings and beats, extending the selection with Shift', () => {
    expect(mapKey(k('ArrowUp'))).toEqual({ command: { type: 'moveString', delta: -1, extend: false } });
    expect(mapKey(k('ArrowRight', { shiftKey: true }))).toEqual({ command: { type: 'moveBeat', delta: 1, extend: true } });
  });

  it('moves by bar with Ctrl or Cmd plus arrows', () => {
    expect(mapKey(k('ArrowLeft', { metaKey: true }))).toEqual({ command: { type: 'moveBar', delta: -1 } });
    expect(mapKey(k('ArrowRight', { ctrlKey: true }))).toEqual({ command: { type: 'moveBar', delta: 1 } });
  });

  it('makes + shorter and - longer', () => {
    expect(mapKey(k('+'))).toEqual({ command: { type: 'shorter' } });
    expect(mapKey(k('-'))).toEqual({ command: { type: 'longer' } });
  });

  it('maps technique letters regardless of case lock but not with Shift', () => {
    expect(mapKey(k('b'))).toEqual({ command: { type: 'bend' } });
    expect(mapKey(k('T', { shiftKey: true }))).toEqual({ command: { type: 'tap' } });
    expect(mapKey(k('n'))).toEqual({ command: { type: 'harmonic' } });
    expect(mapKey(k('R', { shiftKey: true }))).toEqual({ command: { type: 'tremolo' } });
    expect(mapKey(k('r'))).toEqual({ command: { type: 'rest' } });
    expect(mapKey(k('t'))).toEqual({ command: { type: 'tie' } });
    expect(mapKey(k('M'))).toEqual({ command: { type: 'palmMute' } });
    expect(mapKey(k('H', { shiftKey: true }))).toBeNull();
  });

  it('maps undo, redo and clipboard shortcuts', () => {
    expect(mapKey(k('z', { metaKey: true }))).toEqual({ command: { type: 'undo' } });
    expect(mapKey(k('z', { metaKey: true, shiftKey: true }))).toEqual({ command: { type: 'redo' } });
    expect(mapKey(k('v', { ctrlKey: true }))).toEqual({ command: { type: 'paste' } });
    expect(mapKey(k('3', { ctrlKey: true }))).toEqual({ command: { type: 'tuplet' } });
  });

  it('maps P to hammer/pull and Cmd+K to the command list', () => {
    expect(mapKey(k('p'))).toEqual({ command: { type: 'hammer' } });
    expect(mapKey(k('k', { metaKey: true }))).toEqual({ shell: 'help' });
  });

  it('leaves Space to the shell for play/pause', () => {
    expect(mapKey(k(' '))).toEqual({ shell: 'playPause' });
  });

  it('ignores keys the editor does not use', () => {
    expect(mapKey(k('q'))).toBeNull();
    expect(mapKey(k('Tab'))).toBeNull();
    expect(mapKey(k('r', { metaKey: true }))).toBeNull();
  });
});

describe('mapKey on piano and drum tracks (D-023)', () => {
  const piano = { instrument: 'piano' as const, octave: 4 };
  const drums = { instrument: 'drums' as const, octave: 4 };

  it('turns letters into piano keys in the current octave, Shift for sharps', () => {
    expect(mapKey(k('c'), piano)).toEqual({ command: { type: 'togglePitch', pitch: 60 } });
    expect(mapKey(k('A'), piano)).toEqual({ command: { type: 'togglePitch', pitch: 69 } });
    expect(mapKey(k('F', { shiftKey: true }), piano)).toEqual({ command: { type: 'togglePitch', pitch: 66 } });
    expect(mapKey(k('c'), { ...piano, octave: 2 })).toEqual({ command: { type: 'togglePitch', pitch: 36 } });
  });

  it('changes octave with Z and X and transposes with the up and down arrows', () => {
    expect(mapKey(k('z'), piano)).toEqual({ shell: 'octaveDown' });
    expect(mapKey(k('x'), piano)).toEqual({ shell: 'octaveUp' });
    expect(mapKey(k('ArrowUp'), piano)).toEqual({ command: { type: 'transposeKeys', delta: 1 } });
    expect(mapKey(k('ArrowDown', { shiftKey: true }), piano)).toEqual({ command: { type: 'transposeKeys', delta: -12 } });
  });

  it('keeps rhythm, rest, tie and navigation keys on piano, and drops fret digits', () => {
    expect(mapKey(k('r'), piano)).toEqual({ command: { type: 'rest' } });
    expect(mapKey(k('t'), piano)).toEqual({ command: { type: 'tie' } });
    expect(mapKey(k('p'), piano)).toEqual({ command: { type: 'pedal' } });
    expect(mapKey(k('+'), piano)).toEqual({ command: { type: 'shorter' } });
    expect(mapKey(k('ArrowRight'), piano)).toEqual({ command: { type: 'moveBeat', delta: 1, extend: false } });
    expect(mapKey(k('5'), piano)).toBeNull();
  });

  it('maps number keys to drum kit pieces', () => {
    expect(mapKey(k('1'), drums)).toEqual({ command: { type: 'toggleHit', piece: 'kick' } });
    expect(mapKey(k('2'), drums)).toEqual({ command: { type: 'toggleHit', piece: 'snare' } });
    expect(mapKey(k('3'), drums)).toEqual({ command: { type: 'toggleHit', piece: 'hihatClosed' } });
    expect(mapKey(k('0'), drums)).toEqual({ command: { type: 'toggleHit', piece: 'sideStick' } });
    expect(mapKey(k('ArrowUp'), drums)).toBeNull();
    expect(mapKey(k('b'), drums)).toBeNull();
  });
});
