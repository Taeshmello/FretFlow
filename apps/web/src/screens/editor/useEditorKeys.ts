import { cursorBeat, cursorTrack } from '@fretflow/editor-core';
import { useEffect, useState } from 'react';
import type { EditorStore } from '../../app/store';
import { previewDrum, previewPitch } from '../../audio/preview';
import { isTextTarget, mapKey } from '../../keymap';

interface Options {
  store: EditorStore;
  /** True while an editor-owned dialog is open; keys then belong to the dialog. */
  dialogOpen: boolean;
  onPlayPause: () => void;
  onHelp: () => void;
}

/** Window key handling for the editor: score commands go to the store, shell keys to the callbacks. */
export function useEditorKeys({ store, dialogOpen, onPlayPause, onHelp }: Options) {
  /** Octave the piano letter keys type into (4 = middle C). */
  const [octave, setOctave] = useState(4);
  const dispatch = store.dispatch;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialogOpen || isTextTarget(e.target) || document.querySelector('dialog[open]')) {
        return;
      }
      const { score, cursor } = store.state;
      const track = cursorTrack(score, cursor);
      const result = mapKey(e, { instrument: track.instrument, octave });
      if (!result) {
        return;
      }
      e.preventDefault();
      if ('command' in result) {
        const c = result.command;
        // Hear a key or drum as it is added, like the guitar audition.
        const beat = cursorBeat(score, cursor);
        if (c.type === 'togglePitch' && !beat?.keys?.some(k => k.pitch === c.pitch)) {
          previewPitch(c.pitch, 'piano');
        } else if (c.type === 'toggleHit' && !beat?.hits?.some(h => h.piece === c.piece)) {
          previewDrum(c.piece);
        }
        dispatch(c);
        return;
      }
      switch (result.shell) {
        case 'playPause':
          onPlayPause();
          break;
        case 'help':
          onHelp();
          break;
        case 'escape':
          dispatch({ type: 'select', selection: null });
          break;
        case 'octaveUp':
          setOctave(o => Math.min(7, o + 1));
          break;
        case 'octaveDown':
          setOctave(o => Math.max(1, o - 1));
          break;
        case 'save':
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, dialogOpen, onPlayPause, onHelp, octave, store]);

  return { octave, setOctave };
}
