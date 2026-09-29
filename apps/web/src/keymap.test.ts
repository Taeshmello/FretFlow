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
